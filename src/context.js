import { config as defaultConfig, validateConfig } from './config/env.js';
import { createBitbucketClient } from './services/bitbucketClient.js';
import { createLlmClient } from './llm/index.js';

export function createContext(config = defaultConfig) {
  validateConfig(config);
  return {
    config,
    bitbucket: createBitbucketClient(config.bitbucket),
    llm: createLlmClient(config.llm)
  };
}
