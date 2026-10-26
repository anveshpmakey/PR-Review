import { postJson } from './http.js';
import { REVIEW_SCHEMA } from '../review/schema.js';

export function createAnthropicClient(llmConfig, { fetchImpl } = {}) {
  const { apiKey, model, baseUrl } = llmConfig.anthropic;
  return {
    name: `anthropic/${model}`,
    async review({ system, user }) {
      const body = {
        model,
        max_tokens: llmConfig.maxOutputTokens,
        // Cache the (stable) system prompt across chunked calls for the same PR.
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: user }],
        tools: [
          {
            name: 'submit_review',
            description: 'Submit the structured pull request review.',
            input_schema: REVIEW_SCHEMA
          }
        ],
        tool_choice: { type: 'tool', name: 'submit_review' }
      };
      if (llmConfig.temperature !== undefined) body.temperature = llmConfig.temperature;

      const data = await postJson(`${baseUrl.replace(/\/$/, '')}/v1/messages`, {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body,
        timeoutMs: llmConfig.timeoutMs,
        maxRetries: llmConfig.maxRetries,
        label: 'Anthropic',
        fetchImpl
      });

      if (data.stop_reason === 'max_tokens') {
        throw new Error('Anthropic response was truncated (max_tokens). Increase LLM_MAX_OUTPUT_TOKENS or reduce MAX_DIFF_CHARS.');
      }
      const toolUse = (data.content || []).find(c => c.type === 'tool_use' && c.name === 'submit_review');
      if (!toolUse) throw new Error('Anthropic response did not include a submit_review tool call');
      return { review: toolUse.input, usage: data.usage };
    }
  };
}
