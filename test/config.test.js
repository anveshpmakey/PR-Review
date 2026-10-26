import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, validateConfig } from '../src/config/env.js';

test('provider auto-detection and claude alias', () => {
  assert.equal(loadConfig({}).llm.provider, 'mock');
  assert.equal(loadConfig({ OPENAI_API_KEY: 'x' }).llm.provider, 'openai');
  assert.equal(loadConfig({ OPENAI_API_KEY: 'x', ANTHROPIC_API_KEY: 'y' }).llm.provider, 'anthropic');
  assert.equal(loadConfig({ AI_PROVIDER: 'Claude' }).llm.provider, 'anthropic');
});

test('validation reports missing credentials', () => {
  assert.throws(() => validateConfig(loadConfig({ AI_PROVIDER: 'anthropic' })), /BITBUCKET_ACCESS_TOKEN[\s\S]*ANTHROPIC_API_KEY/);
  assert.doesNotThrow(() => validateConfig(loadConfig({ BITBUCKET_ACCESS_TOKEN: 't' })));
  assert.throws(() => loadConfig({ PORT: 'abc' }), /PORT must be a number/);
});
