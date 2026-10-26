import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnthropicClient } from '../src/llm/anthropic.js';
import { createOpenAiCompatibleClient } from '../src/llm/openai.js';
import { createMockClient } from '../src/llm/mock.js';
import { loadConfig } from '../src/config/env.js';
import { parseUnifiedDiff } from '../src/utils/diff.js';
import { SAMPLE_DIFF } from './fixtures.js';

const llmConfig = loadConfig({ ANTHROPIC_API_KEY: 'a-key', OPENAI_API_KEY: 'o-key', LLM_MAX_RETRIES: '1' }).llm;
const review = { summary: 's', verdict: 'approve', findings: [] };

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'retry-after': '0' } });
}

test('anthropic client forces the submit_review tool and parses tool input', async () => {
  const requests = [];
  const fetchImpl = async (url, init) => {
    requests.push({ url, init });
    return jsonResponse(200, { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'submit_review', input: review }] });
  };
  const client = createAnthropicClient(llmConfig, { fetchImpl });
  const out = await client.review({ system: 'sys', user: 'usr' });
  assert.deepEqual(out.review, review);
  assert.equal(requests[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(requests[0].init.headers['x-api-key'], 'a-key');
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.model, 'claude-sonnet-4-5');
  assert.deepEqual(body.tool_choice, { type: 'tool', name: 'submit_review' });
  assert.equal(body.temperature, undefined);
});

test('anthropic client retries on 529 overload', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls === 1) return jsonResponse(529, { error: 'overloaded' });
    return jsonResponse(200, { content: [{ type: 'tool_use', name: 'submit_review', input: review }] });
  };
  const out = await createAnthropicClient(llmConfig, { fetchImpl }).review({ system: 's', user: 'u' });
  assert.equal(calls, 2);
  assert.deepEqual(out.review, review);
});

test('anthropic client surfaces non-retryable errors', async () => {
  const fetchImpl = async () => jsonResponse(401, { error: 'bad key' });
  await assert.rejects(createAnthropicClient(llmConfig, { fetchImpl }).review({ system: 's', user: 'u' }), /401/);
});

test('openai client uses json_schema structured output', async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    sent = { url, body: JSON.parse(init.body), auth: init.headers.Authorization };
    return jsonResponse(200, { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(review) } }] });
  };
  const out = await createOpenAiCompatibleClient('openai', llmConfig.compat.openai, llmConfig, { fetchImpl }).review({ system: 's', user: 'u' });
  assert.deepEqual(out.review, review);
  assert.equal(sent.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(sent.auth, 'Bearer o-key');
  assert.equal(sent.body.response_format.type, 'json_schema');
  assert.equal(sent.body.response_format.json_schema.strict, true);
});

test('openai client rejects truncated output', async () => {
  const fetchImpl = async () => jsonResponse(200, { choices: [{ finish_reason: 'length', message: { content: '{' } }] });
  await assert.rejects(createOpenAiCompatibleClient('openai', llmConfig.compat.openai, llmConfig, { fetchImpl }).review({ system: 's', user: 'u' }), /truncated/);
});

test('mock client flags heuristics on added lines', async () => {
  const entries = parseUnifiedDiff(SAMPLE_DIFF).slice(0, 1).map(file => ({ file }));
  const { review: r } = await createMockClient().review({ entries });
  assert.deepEqual(r.findings.map(f => [f.title, f.line]), [
    ['Transaction boundary declared in a controller', 12],
    ['Possible hard-coded secret', 14],
    ['Debug output left in code', 15]
  ]);
  assert.equal(r.verdict, 'request_changes');
});
