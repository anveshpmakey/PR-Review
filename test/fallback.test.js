import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAiCompatibleClient } from '../src/llm/openai.js';
import { createFallbackClient } from '../src/llm/fallback.js';
import { createLlmClient } from '../src/llm/index.js';
import { loadConfig, validateConfig } from '../src/config/env.js';

const review = { summary: 's', verdict: 'approve', findings: [] };
const ok = content => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }), { status: 200 });
const err = (status, msg) => new Response(JSON.stringify({ error: { message: msg } }), { status });

test('auto-detects free/open-source providers in priority order', () => {
  const cfg = loadConfig({ GROQ_API_KEY: 'g', GEMINI_API_KEY: 'm', OLLAMA_MODEL: 'llama3.1' }).llm;
  assert.deepEqual(cfg.providers, ['gemini', 'groq', 'ollama']);
  assert.equal(cfg.compat.groq.baseUrl, 'https://api.groq.com/openai/v1');
  assert.equal(cfg.compat.ollama.model, 'llama3.1');
  assert.deepEqual(loadConfig({ HF_TOKEN: 'h' }).llm.providers, ['huggingface']);
});

test('explicit provider chain with aliases and fallbacks', () => {
  const cfg = loadConfig({ AI_PROVIDER: 'claude, local', AI_FALLBACK_PROVIDERS: 'openrouter,ollama' }).llm;
  assert.deepEqual(cfg.providers, ['anthropic', 'ollama', 'openrouter']);
});

test('validation requires keys for hosted providers but not for ollama', () => {
  const base = { BITBUCKET_ACCESS_TOKEN: 't' };
  assert.doesNotThrow(() => validateConfig(loadConfig({ ...base, AI_PROVIDER: 'ollama' })));
  assert.throws(() => validateConfig(loadConfig({ ...base, AI_PROVIDER: 'groq' })), /GROQ_API_KEY/);
  assert.throws(() => validateConfig(loadConfig({ ...base, AI_PROVIDER: 'gemini' })), /GEMINI_API_KEY or GOOGLE_API_KEY/);
  assert.throws(() => validateConfig(loadConfig({ ...base, AI_PROVIDER: 'nope' })), /Unknown AI provider "nope"/);
});

test('ollama client needs no auth and uses max_tokens', async () => {
  const llm = loadConfig({ AI_PROVIDER: 'ollama' }).llm;
  let sent;
  const fetchImpl = async (url, init) => { sent = { url, headers: init.headers, body: JSON.parse(init.body) }; return ok(JSON.stringify(review)); };
  const out = await createOpenAiCompatibleClient('ollama', llm.compat.ollama, llm, { fetchImpl }).review({ system: 's', user: 'u' });
  assert.deepEqual(out.review, review);
  assert.equal(out.model, 'ollama/qwen2.5-coder:14b');
  assert.equal(sent.url, 'http://localhost:11434/v1/chat/completions');
  assert.equal(sent.headers.Authorization, undefined);
  assert.equal(sent.body.max_tokens, 8192);
  assert.equal(sent.body.max_completion_tokens, undefined);
});

test('downgrades structured output when a server rejects response_format', async () => {
  const llm = loadConfig({ LLM_MAX_RETRIES: '0' }).llm;
  const formats = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    formats.push(body.response_format?.type ?? 'none');
    if (body.response_format) return err(400, `response_format ${body.response_format.type} is not supported`);
    assert.match(body.messages[0].content, /JSON Schema/);
    return ok(`Sure!\n\`\`\`json\n${JSON.stringify(review)}\n\`\`\``);
  };
  const client = createOpenAiCompatibleClient('custom', { model: 'm', baseUrl: 'http://x/v1', structuredOutput: 'json_schema' }, llm, { fetchImpl });
  assert.deepEqual((await client.review({ system: 's', user: 'u' })).review, review);
  assert.deepEqual(formats, ['json_schema', 'json_object', 'none']);
  await client.review({ system: 's', user: 'u' });
  assert.equal(formats.at(-1), 'none');
});

test('fallback chain moves to the next provider and cools down failed ones', async () => {
  let t = 0;
  const calls = [];
  const failing = { name: 'anthropic/claude', review: async () => { calls.push('claude'); throw new Error('529 overloaded'); } };
  const free = { name: 'groq/llama', review: async () => { calls.push('groq'); return { review }; } };
  const client = createFallbackClient([failing, free], { cooldownMs: 1000, now: () => t });

  assert.equal((await client.review({})).model, 'groq/llama');
  await client.review({});
  assert.deepEqual(calls, ['claude', 'groq', 'groq']);
  t = 2000;
  await client.review({});
  assert.deepEqual(calls, ['claude', 'groq', 'groq', 'claude', 'groq']);
});

test('fallback chain reports every failure when all providers fail', async () => {
  const a = { name: 'a', review: async () => { throw new Error('down'); } };
  const b = { name: 'b', review: async () => { throw new Error('quota'); } };
  await assert.rejects(createFallbackClient([a, b]).review({}), /a: down[\s\S]*b: quota/);
});

test('createLlmClient builds the configured chain', () => {
  const llm = createLlmClient(loadConfig({ AI_PROVIDER: 'anthropic,groq,ollama,mock', ANTHROPIC_API_KEY: 'k', GROQ_API_KEY: 'g' }).llm);
  assert.equal(llm.name, 'anthropic/claude-sonnet-4-5 -> groq/llama-3.3-70b-versatile -> ollama/qwen2.5-coder:14b -> mock/heuristic');
});
