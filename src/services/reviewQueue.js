import { logger } from '../utils/logger.js';

// In-memory work queue so webhooks can be acknowledged immediately (Bitbucket times out after ~10s).
// Jobs for the same PR are coalesced: if a review is running, only the latest pending request is kept.
export function createReviewQueue({ worker, concurrency = 2 }) {
  const pending = new Map();
  const running = new Set();
  let active = 0;

  function pump() {
    if (active >= concurrency) return;
    for (const [key, job] of pending) {
      if (running.has(key)) continue;
      pending.delete(key);
      running.add(key);
      active += 1;
      Promise.resolve()
        .then(() => worker(job))
        .catch(error => logger.error(`Review job ${key} failed:`, error.message))
        .finally(() => {
          running.delete(key);
          active -= 1;
          pump();
        });
      if (active >= concurrency) return;
    }
  }

  return {
    enqueue(key, job) {
      const existing = pending.get(key);
      pending.set(key, existing ? { ...job, force: job.force || existing.force } : job);
      pump();
    },
    stats: () => ({ pending: pending.size, running: running.size })
  };
}
