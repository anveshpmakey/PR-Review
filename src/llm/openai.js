import { postJson } from './http.js';
import { REVIEW_SCHEMA, extractJson } from '../review/schema.js';

// Uses the Chat Completions API with JSON-schema structured output, which is supported by OpenAI and
// most OpenAI-compatible gateways (Azure OpenAI v1, OpenRouter, vLLM, LiteLLM, Ollama, ...).
export function createOpenAiClient(llmConfig, { fetchImpl } = {}) {
  const { apiKey, model, baseUrl } = llmConfig.openai;
  return {
    name: `openai/${model}`,
    async review({ system, user }) {
      const body = {
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        max_completion_tokens: llmConfig.maxOutputTokens,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'pull_request_review', strict: true, schema: REVIEW_SCHEMA }
        }
      };
      if (llmConfig.temperature !== undefined) body.temperature = llmConfig.temperature;

      const data = await postJson(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        body,
        timeoutMs: llmConfig.timeoutMs,
        maxRetries: llmConfig.maxRetries,
        label: 'OpenAI',
        fetchImpl
      });

      const choice = data.choices?.[0];
      if (!choice) throw new Error('OpenAI response contained no choices');
      if (choice.message?.refusal) throw new Error(`OpenAI refused the request: ${choice.message.refusal}`);
      if (choice.finish_reason === 'length') {
        throw new Error('OpenAI response was truncated (length). Increase LLM_MAX_OUTPUT_TOKENS or reduce MAX_DIFF_CHARS.');
      }
      return { review: extractJson(choice.message?.content), usage: data.usage };
    }
  };
}
