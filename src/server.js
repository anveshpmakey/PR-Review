import { createApp } from './app.js';
import { createContext } from './context.js';
import { createReviewQueue } from './services/reviewQueue.js';
import { reviewPullRequest } from './services/prReview.js';
import { logger } from './utils/logger.js';

const ctx = createContext();
const queue = createReviewQueue({
  concurrency: ctx.config.review.concurrency,
  worker: job => reviewPullRequest(job, ctx)
});

createApp({ config: ctx.config, queue }).listen(ctx.config.port, () => {
  logger.info(`bitbucket-pr-review-agent listening on port ${ctx.config.port} (LLM: ${ctx.llm.name})`);
});
