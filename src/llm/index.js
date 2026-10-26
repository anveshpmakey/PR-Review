import { createAnthropicClient } from './anthropic.js';
import { createOpenAiClient } from './openai.js';
import { createMockClient } from './mock.js';

export function createLlmClient(llmConfig, options = {}) {
  switch (llmConfig.provider) {
    case 'anthropic':
      return createAnthropicClient(llmConfig, options);
    case 'openai':
      return createOpenAiClient(llmConfig, options);
    case 'mock':
      return createMockClient();
    default:
      throw new Error(`Unsupported AI_PROVIDER: ${llmConfig.provider}`);
  }
}
