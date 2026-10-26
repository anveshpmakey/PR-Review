import { postJson } from './http.js';
import { REVIEW_SCHEMA, extractJson } from '../review/schema.js';
import { logger } from '../utils/logger.js';

const MODES = ['json_schema', 'json_object', 'none'];
const SCHEMA_REJECTED = /response_format|json_schema|json_object|structured|schema|not supported|unsupported|invalid.*(format|parameter)/i;

function responseFormat(mode) {
  if (mode === 'json_schema') {
    return { type: 'json_schema', json_schema: { name: 'pull_request_review', strict: true, schema: REVIEW_SCHEMA } };
  }
  if (mode === 'json_object') return { type: 'json_object' };
  return undefined;
}

function systemFor(system, mode) {
  if (mode === 'json_schema') return system;
  return `${system}\n\nRespond with ONLY a single JSON object (no prose, no code fences) that matches this JSON Schema:\n${JSON.stringify(REVIEW_SCHEMA)}`;
}

// Chat Completions client for OpenAI and any OpenAI-compatible server (Ollama, vLLM, LM Studio,
// Groq, OpenRouter, Gemini, Hugging Face, Mistral, DeepSeek, Azure OpenAI v1, LiteLLM, ...).
export function createOpenAiCompatibleClient(providerName, providerConfig, llmConfig, { fetchImpl } = {}) {
  const { apiKey, model, baseUrl, tokenParam = 'max_tokens' } = providerConfig;
  let mode = MODES.includes(providerConfig.structuredOutput) ? providerConfig.structuredOutput : 'json_object';
  const name = `${providerName}/${model}`;

  async function call(system, user) {
    const body = {
      model,
      messages: [
        { role: 'system', content: systemFor(system, mode) },
        { role: 'user', content: user }
      ],
      [tokenParam]: llmConfig.maxOutputTokens
    };
    const format = responseFormat(mode);
    if (format) body.response_format = format;
    if (llmConfig.temperature !== undefined) body.temperature = llmConfig.temperature;

    return postJson(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      body,
      timeoutMs: llmConfig.timeoutMs,
      maxRetries: llmConfig.maxRetries,
      label: name,
      fetchImpl
    });
  }

  return {
    name,
    async review({ system, user }) {
      let data;
      for (;;) {
        try {
          data = await call(system, user);
          break;
        } catch (error) {
          const next = MODES[MODES.indexOf(mode) + 1];
          if (next && [400, 422].includes(error.status) && SCHEMA_REJECTED.test(error.message)) {
            logger.warn(`${name} rejected response_format=${mode}; retrying with ${next}`);
            mode = next;
            continue;
          }
          throw error;
        }
      }

      const choice = data.choices?.[0];
      if (!choice) throw new Error(`${name} response contained no choices`);
      if (choice.message?.refusal) throw new Error(`${name} refused the request: ${choice.message.refusal}`);
      if (choice.finish_reason === 'length') {
        throw new Error(`${name} response was truncated (length). Increase LLM_MAX_OUTPUT_TOKENS or reduce MAX_DIFF_CHARS.`);
      }
      return { review: extractJson(choice.message?.content), usage: data.usage, model: name };
    }
  };
}
