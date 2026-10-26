import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { computeSignature } from '../src/utils/security.js';
import { createReviewQueue } from '../src/services/reviewQueue.js';

async function withServer(env, fn) {
  const jobs = [];
  const queue = { enqueue: (key, job) => jobs.push({ key, ...job }), stats: () => ({}) };
  const config = loadConfig({ AI_PROVIDER: 'mock', ...env });
  const server = createApp({ config, queue }).listen(0);
  await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn({ base, jobs });
  } finally {
    server.close();
  }
}

const payload = { pullrequest: { id: 7 }, repository: { full_name: 'ws/repo' } };

function post(base, body, headers) {
  return fetch(`${base}/webhook/bitbucket`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
}

test('accepts signed PR events and enqueues a review', async () => {
  await withServer({ WEBHOOK_SECRET: 's3cret' }, async ({ base, jobs }) => {
    const body = JSON.stringify(payload);
    const ok = await post(base, body, { 'x-event-key': 'pullrequest:updated', 'x-hub-signature': computeSignature(body, 's3cret') });
    assert.equal(ok.status, 202);
    assert.deepEqual(jobs, [{ key: 'ws/repo#7', repo: 'ws/repo', prId: 7, force: false }]);

    const bad = await post(base, body, { 'x-event-key': 'pullrequest:updated', 'x-hub-signature': 'sha256=deadbeef' });
    assert.equal(bad.status, 401);
    const legacy = await post(base, body, { 'x-event-key': 'pullrequest:created', 'x-webhook-secret': 's3cret' });
    assert.equal(legacy.status, 202);
  });
});

test('ignores unrelated events and enforces allowed repos', async () => {
  await withServer({ ALLOWED_REPOS: 'ws/other' }, async ({ base, jobs }) => {
    const ignored = await post(base, JSON.stringify(payload), { 'x-event-key': 'repo:push' });
    assert.deepEqual(await ignored.json(), { ignored: true, event: 'repo:push' });
    const forbidden = await post(base, JSON.stringify(payload), { 'x-event-key': 'pullrequest:created' });
    assert.equal(forbidden.status, 403);
    assert.equal(jobs.length, 0);
  });
});

test('comment trigger phrase forces a re-review, bot comments are ignored', async () => {
  await withServer({}, async ({ base, jobs }) => {
    const trigger = { ...payload, comment: { content: { raw: 'please /ai-review' } } };
    const res = await post(base, JSON.stringify(trigger), { 'x-event-key': 'pullrequest:comment_created' });
    assert.equal(res.status, 202);
    assert.equal(jobs[0].force, true);
    const bot = { ...payload, comment: { content: { raw: '/ai-review ... ai-pr-review · commit' } } };
    await post(base, JSON.stringify(bot), { 'x-event-key': 'pullrequest:comment_created' });
    const plain = { ...payload, comment: { content: { raw: 'lgtm' } } };
    await post(base, JSON.stringify(plain), { 'x-event-key': 'pullrequest:comment_created' });
    assert.equal(jobs.length, 1);
  });
});

test('review queue coalesces jobs per PR', async () => {
  const seen = [];
  let release;
  const gate = new Promise(r => { release = r; });
  const queue = createReviewQueue({ concurrency: 1, worker: async job => { seen.push(job.n); if (job.n === 1) await gate; } });
  queue.enqueue('a', { n: 1 });
  queue.enqueue('a', { n: 2 });
  queue.enqueue('a', { n: 3 });
  release();
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(seen, [1, 3]);
});
