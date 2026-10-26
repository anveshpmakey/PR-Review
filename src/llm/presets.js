// OpenAI-compatible providers, including free tiers and self-hosted open-source models.
// structuredOutput: preferred mode; the client downgrades json_schema -> json_object -> none
// automatically when a server rejects it.
export const COMPAT_PRESETS = {
  openai: {
    envPrefix: 'OPENAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1',
    requiresKey: true,
    structuredOutput: 'json_schema',
    tokenParam: 'max_completion_tokens'
  },
  ollama: {
    envPrefix: 'OLLAMA',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5-coder:14b',
    requiresKey: false,
    structuredOutput: 'json_schema',
    tokenParam: 'max_tokens'
  },
  groq: {
    envPrefix: 'GROQ',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    requiresKey: true,
    structuredOutput: 'json_object',
    tokenParam: 'max_tokens'
  },
  openrouter: {
    envPrefix: 'OPENROUTER',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'meta-llama/llama-3.3-70b-instruct:free',
    requiresKey: true,
    structuredOutput: 'json_object',
    tokenParam: 'max_tokens'
  },
  gemini: {
    envPrefix: 'GEMINI',
    keyEnv: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.5-flash',
    requiresKey: true,
    structuredOutput: 'json_object',
    tokenParam: 'max_tokens'
  },
  huggingface: {
    envPrefix: 'HF',
    keyEnv: ['HF_TOKEN', 'HF_API_KEY', 'HUGGINGFACE_API_KEY'],
    baseUrl: 'https://router.huggingface.co/v1',
    model: 'Qwen/Qwen2.5-Coder-32B-Instruct',
    requiresKey: true,
    structuredOutput: 'json_object',
    tokenParam: 'max_tokens'
  },
  mistral: {
    envPrefix: 'MISTRAL',
    baseUrl: 'https://api.mistral.ai/v1',
    model: 'mistral-small-latest',
    requiresKey: true,
    structuredOutput: 'json_object',
    tokenParam: 'max_tokens'
  },
  deepseek: {
    envPrefix: 'DEEPSEEK',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    requiresKey: true,
    structuredOutput: 'json_object',
    tokenParam: 'max_tokens'
  }
};

export const ALL_PROVIDERS = ['anthropic', ...Object.keys(COMPAT_PRESETS), 'mock'];

// Order used when AI_PROVIDER is not set: paid frontier models first, then free tiers, then local.
export const AUTO_ORDER = ['anthropic', 'openai', 'gemini', 'groq', 'openrouter', 'mistral', 'huggingface', 'deepseek', 'ollama'];
