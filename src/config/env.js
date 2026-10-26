import dotenv from 'dotenv';

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

function defaultProvider(env) {
  if (env.AI_PROVIDER) {
    const p = env.AI_PROVIDER.toLowerCase();
    return p === 'claude' ? 'anthropic' : p;
  }
  if (env.ANTHROPIC_API_KEY) return 'anthropic';
  if (env.OPENAI_API_KEY) return 'openai';
  return 'mock';
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
    llm: {
      provider: defaultProvider(env),
      maxOutputTokens: num(env, 'LLM_MAX_OUTPUT_TOKENS', 8192),
      temperature: optionalNum(env, 'LLM_TEMPERATURE'),
      timeoutMs: num(env, 'LLM_TIMEOUT_MS', 180000),
      maxRetries: num(env, 'LLM_MAX_RETRIES', 3),
      anthropic: {
        apiKey: str(env, 'ANTHROPIC_API_KEY'),
        model: str(env, 'ANTHROPIC_MODEL', 'claude-sonnet-4-5'),
        baseUrl: str(env, 'ANTHROPIC_BASE_URL', 'https://api.anthropic.com')
      },
      openai: {
        apiKey: str(env, 'OPENAI_API_KEY'),
        model: str(env, 'OPENAI_MODEL', 'gpt-4.1'),
        baseUrl: str(env, 'OPENAI_BASE_URL', 'https://api.openai.com/v1')
      }
    },
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
  const { provider } = cfg.llm;
  if (!['anthropic', 'openai', 'mock'].includes(provider)) {
    errors.push(`AI_PROVIDER must be one of anthropic|openai|mock, got "${provider}"`);
  }
  if (provider === 'anthropic' && !cfg.llm.anthropic.apiKey) errors.push('ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic');
  if (provider === 'openai' && !cfg.llm.openai.apiKey && cfg.llm.openai.baseUrl === 'https://api.openai.com/v1') {
    errors.push('OPENAI_API_KEY is required when AI_PROVIDER=openai');
  }
  if (errors.length) throw new Error(`Invalid configuration:\n - ${errors.join('\n - ')}`);
  return cfg;
}

export const config = loadConfig();
