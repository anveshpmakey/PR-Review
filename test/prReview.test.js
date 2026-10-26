import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewPullRequest } from '../src/services/prReview.js';
import { createMockClient } from '../src/llm/mock.js';
import { loadConfig } from '../src/config/env.js';
import { SAMPLE_DIFF, samplePr } from './fixtures.js';

function fakeBitbucket({ pr = samplePr(), comments = [], files = {} } = {}) {
  const posted = [];
  return {
    posted,
    getPullRequest: async () => pr,
    getPullRequestDiff: async () => SAMPLE_DIFF,
    listPullRequestComments: async () => comments,
    getFileContent: async (repo, commit, path) => files[`${commit}:${path}`] ?? null,
    postPullRequestComment: async (repo, prId, raw, inline) => {
      if (inline?.to === 999) throw new Error('400 line not in diff');
      posted.push({ repo, prId, raw, inline });
      return { id: posted.length };
    }
  };
}

const ctx = (bitbucket, env = {}) => ({ config: loadConfig({ AI_PROVIDER: 'mock', ...env }), bitbucket, llm: createMockClient() });

test('reviews a PR, posts inline comments and a summary', async () => {
  const bitbucket = fakeBitbucket({ files: { '0123456789ab:.pr-review.md': 'Use constructor injection.' } });
  const result = await reviewPullRequest({ repo: 'ws/repo', prId: 42 }, ctx(bitbucket));
  assert.equal(result.skipped, false);
  assert.equal(result.verdict, 'request_changes');
  const inline = bitbucket.posted.filter(p => p.inline);
  assert.deepEqual(inline.map(p => p.inline), [
    { path: 'src/main/java/com/acme/UserController.java', to: 14 },
    { path: 'src/main/java/com/acme/UserController.java', to: 12 },
    { path: 'src/main/java/com/acme/UserController.java', to: 15 }
  ]);
  const summary = bitbucket.posted.at(-1);
  assert.equal(summary.inline, undefined);
  assert.match(summary.raw, /## AI Code Review/);
  assert.match(summary.raw, /ai-pr-review · commit `abcdef123456`/);
  assert.match(summary.raw, /Ignored \(generated\/binary\/filtered\): 3 file/);
});

test('skips commits that were already reviewed unless forced', async () => {
  const comments = [{ content: { raw: '...\n*ai-pr-review · commit `abcdef123456` · mock*' } }];
  const bitbucket = fakeBitbucket({ comments });
  const skipped = await reviewPullRequest({ repo: 'ws/repo', prId: 42 }, ctx(bitbucket));
  assert.deepEqual([skipped.skipped, skipped.reason], [true, 'duplicate']);
  const forced = await reviewPullRequest({ repo: 'ws/repo', prId: 42, force: true }, ctx(bitbucket));
  assert.equal(forced.skipped, false);
});

test('does not repeat inline findings already posted on earlier commits', async () => {
  const comments = [{
    inline: { path: 'src/main/java/com/acme/UserController.java', to: 14 },
    content: { raw: '**[HIGH] Security:** Possible hard-coded secret\n\n<sub>ai-pr-review · confidence 60%</sub>' }
  }];
  const bitbucket = fakeBitbucket({ comments });
  await reviewPullRequest({ repo: 'ws/repo', prId: 42 }, ctx(bitbucket));
  assert.equal(bitbucket.posted.filter(p => p.inline).length, 2);
});

test('skips drafts, closed PRs and dry runs post nothing', async () => {
  assert.equal((await reviewPullRequest({ repo: 'r', prId: 1 }, ctx(fakeBitbucket({ pr: samplePr({ draft: true }) })))).reason, 'draft');
  assert.equal((await reviewPullRequest({ repo: 'r', prId: 1 }, ctx(fakeBitbucket({ pr: samplePr({ state: 'MERGED' }) })))).reason, 'state MERGED');
  const bitbucket = fakeBitbucket();
  const result = await reviewPullRequest({ repo: 'r', prId: 1 }, ctx(bitbucket, { DRY_RUN: 'true' }));
  assert.equal(bitbucket.posted.length, 0);
  assert.match(result.summaryText, /Inline findings/);
});

test('inline comments can be disabled so everything lands in the summary', async () => {
  const bitbucket = fakeBitbucket();
  await reviewPullRequest({ repo: 'r', prId: 1 }, ctx(bitbucket, { POST_INLINE_COMMENTS: 'false' }));
  assert.equal(bitbucket.posted.length, 1);
  assert.match(bitbucket.posted[0].raw, /Additional findings[\s\S]*hard-coded secret/);
});
