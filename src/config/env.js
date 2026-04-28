import dotenv from 'dotenv';

dotenv.config();

function required(name, fallback = undefined) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  bitbucket: {
    workspace: required('BITBUCKET_WORKSPACE'),
    repoSlug: required('BITBUCKET_REPO_SLUG'),
    username: required('BITBUCKET_USERNAME'),
    appPassword: required('BITBUCKET_APP_PASSWORD')
  },
  webhookSecret: process.env.WEBHOOK_SECRET || '',
  aiProvider: process.env.AI_PROVIDER || 'mock',
  openAiApiKey: process.env.OPENAI_API_KEY || '',
  openAiModel: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
  maxDiffChars: Number(process.env.MAX_DIFF_CHARS || 120000),
  postGeneralComment: String(process.env.POST_GENERAL_COMMENT || 'true') === 'true',
  dedupLookbackComments: Number(process.env.DEDUP_LOOKBACK_COMMENTS || 30)
};
