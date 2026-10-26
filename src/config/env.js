import dotenv from 'dotenv';
import { ALL_PROVIDERS, AUTO_ORDER, COMPAT_PRESETS } from '../llm/presets.js';

dotenv.config();

const SEVERITIES = ['low', 'medium', 'high', 'critical'];

function str(env, name, fallback = '') {
  const value = env[name];
  return value === undefined || value === '' ? fallback : String(value);
}

function num(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) throw new Error(`Environment variable ${name} must be a number, got "${raw}"`);
  return value;
}

function optionalNum(env, name) {
  const raw = env[name];
  return raw === undefined || raw === '' ? undefined : num(env, name, undefined);
}

function bool(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function list(env, name) {
  return str(env, name)
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function normalizeProvider(name) {
  const p = name.trim().toLowerCase();
  const aliases = { claude: 'anthropic', google: 'gemini', hf: 'huggingface', local: 'ollama' };
  return aliases[p] || p;
}

function compatConfig(env) {
  return Object.fromEntries(Object.entries(COMPAT_PRESETS).map(([name, preset]) => {
    const prefix = preset.envPrefix;
    const keyEnv = preset.keyEnv || [`${prefix}_API_KEY`];
    return [name, {
      apiKey: keyEnv.map(k => str(env, k)).find(Boolean) || '',
      model: str(env, `${prefix}_MODEL`, preset.model),
      baseUrl: str(env, `${prefix}_BASE_URL`, preset.baseUrl),
      structuredOutput: str(env, `${prefix}_STRUCTURED_OUTPUT`, preset.structuredOutput),
      tokenParam: str(env, `${prefix}_TOKEN_PARAM`, preset.tokenParam),
      requiresKey: preset.requiresKey,
      explicitlyConfigured: Boolean(env[`${prefix}_BASE_URL`] || env[`${prefix}_MODEL`])
    }];
  }));
}

function isConfigured(provider, anthropic, compat) {
  if (provider === 'anthropic') return Boolean(anthropic.apiKey);
  const c = compat[provider];
  if (!c) return false;
  return c.requiresKey ? Boolean(c.apiKey) : c.explicitlyConfigured;
}

function resolveProviders(env, anthropic, compat) {
  const explicit = [...list(env, 'AI_PROVIDER'), ...list(env, 'AI_FALLBACK_PROVIDERS')].map(normalizeProvider);
  if (explicit.length) return [...new Set(explicit)];
  const detected = AUTO_ORDER.filter(p => isConfigured(p, anthropic, compat));
  return detected.length ? detected : ['mock'];
}

function buildLlmConfig(env) {
  const anthropic = {
    apiKey: str(env, 'ANTHROPIC_API_KEY'),
    model: str(env, 'ANTHROPIC_MODEL', 'claude-sonnet-4-5'),
    baseUrl: str(env, 'ANTHROPIC_BASE_URL', 'https://api.anthropic.com')
  };
  const compat = compatConfig(env);
  const providers = resolveProviders(env, anthropic, compat);
  return {
    providers,
    provider: providers[0],
    maxOutputTokens: num(env, 'LLM_MAX_OUTPUT_TOKENS', 8192),
    temperature: optionalNum(env, 'LLM_TEMPERATURE'),
    timeoutMs: num(env, 'LLM_TIMEOUT_MS', 180000),
    maxRetries: num(env, 'LLM_MAX_RETRIES', 3),
    fallbackCooldownMs: num(env, 'LLM_FALLBACK_COOLDOWN_MS', 300000),
    anthropic,
    compat,
    openai: compat.openai
  };
}

export function loadConfig(env = process.env) {
  const minSeverity = str(env, 'MIN_SEVERITY', 'low').toLowerCase();
  return {
    port: num(env, 'PORT', 3000),
    nodeEnv: str(env, 'NODE_ENV', 'development'),
    logLevel: str(env, 'LOG_LEVEL', 'info'),
    bitbucket: {
      baseUrl: str(env, 'BITBUCKET_API_URL', 'https://api.bitbucket.org/2.0'),
      workspace: str(env, 'BITBUCKET_WORKSPACE'),
      repoSlug: str(env, 'BITBUCKET_REPO_SLUG'),
      username: str(env, 'BITBUCKET_USERNAME'),
      appPassword: str(env, 'BITBUCKET_APP_PASSWORD'),
      accessToken: str(env, 'BITBUCKET_ACCESS_TOKEN')
    },
    webhookSecret: str(env, 'WEBHOOK_SECRET'),
    allowedRepos: list(env, 'ALLOWED_REPOS'),
    llm: buildLlmConfig(env),
    review: {
      profile: str(env, 'REVIEW_PROFILE', 'general').toLowerCase(),
      guidelines: str(env, 'REVIEW_GUIDELINES'),
      guidelinesPath: str(env, 'REVIEW_GUIDELINES_PATH', '.pr-review.md'),
      includeFileContext: bool(env, 'INCLUDE_FILE_CONTEXT', true),
      maxContextFileChars: num(env, 'MAX_CONTEXT_FILE_CHARS', 20000),
      maxChunkChars: num(env, 'MAX_DIFF_CHARS', 60000),
      maxChunks: num(env, 'MAX_CHUNKS', 10),
      concurrency: num(env, 'REVIEW_CONCURRENCY', 2),
      minSeverity: SEVERITIES.includes(minSeverity) ? minSeverity : 'low',
      minConfidence: num(env, 'MIN_CONFIDENCE', 0.5),
      maxInlineComments: num(env, 'MAX_INLINE_COMMENTS', 15),
      ignorePaths: list(env, 'IGNORE_PATHS'),
      includePaths: list(env, 'INCLUDE_PATHS'),
      skipDrafts: bool(env, 'SKIP_DRAFTS', true),
      triggerPhrase: str(env, 'REVIEW_TRIGGER_PHRASE', '/ai-review')
    },
    postGeneralComment: bool(env, 'POST_GENERAL_COMMENT', true),
    postInlineComments: bool(env, 'POST_INLINE_COMMENTS', true),
    dryRun: bool(env, 'DRY_RUN', false)
  };
}

export function validateConfig(cfg) {
  const errors = [];
  const bb = cfg.bitbucket;
  if (!bb.accessToken && !(bb.username && bb.appPassword)) {
    errors.push('Set BITBUCKET_ACCESS_TOKEN or both BITBUCKET_USERNAME and BITBUCKET_APP_PASSWORD');
  }
  for (const provider of cfg.llm.providers) {
    if (!ALL_PROVIDERS.includes(provider)) {
      errors.push(`Unknown AI provider "${provider}". Supported: ${ALL_PROVIDERS.join(', ')}`);
    } else if (provider === 'anthropic' && !cfg.llm.anthropic.apiKey) {
      errors.push('ANTHROPIC_API_KEY is required for provider anthropic');
    } else if (cfg.llm.compat[provider]?.requiresKey && !cfg.llm.compat[provider].apiKey
      && cfg.llm.compat[provider].baseUrl === COMPAT_PRESETS[provider].baseUrl) {
      errors.push(`An API key is required for provider ${provider} (${(COMPAT_PRESETS[provider].keyEnv || [`${COMPAT_PRESETS[provider].envPrefix}_API_KEY`]).join(' or ')})`);
    }
  }
  if (errors.length) throw new Error(`Invalid configuration:\n - ${errors.join('\n - ')}`);
  return cfg;
}

export const config = loadConfig();
