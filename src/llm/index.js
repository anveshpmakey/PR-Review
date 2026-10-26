import { createAnthropicClient } from './anthropic.js';
import { createOpenAiCompatibleClient } from './openai.js';
import { createMockClient } from './mock.js';
import { createFallbackClient } from './fallback.js';

export function createProviderClient(provider, llmConfig, options = {}) {
  if (provider === 'anthropic') return createAnthropicClient(llmConfig, options);
  if (provider === 'mock') return createMockClient();
  const compat = llmConfig.compat?.[provider];
  if (!compat) throw new Error(`Unsupported AI provider: ${provider}`);
  return createOpenAiCompatibleClient(provider, compat, llmConfig, options);
}

export function createLlmClient(llmConfig, options = {}) {
  const clients = llmConfig.providers.map(p => createProviderClient(p, llmConfig, options));
  return createFallbackClient(clients, { cooldownMs: llmConfig.fallbackCooldownMs });
}
