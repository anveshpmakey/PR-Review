import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runReview, anchorAndFilterFindings } from '../src/review/engine.js';
import { buildChunks } from '../src/review/chunker.js';
import { normalizeReview, extractJson } from '../src/review/schema.js';
import { loadConfig } from '../src/config/env.js';
import { parseUnifiedDiff } from '../src/utils/diff.js';
import { SAMPLE_DIFF, samplePr } from './fixtures.js';

const reviewConfig = () => loadConfig({}).review;
const files = () => parseUnifiedDiff(SAMPLE_DIFF).filter(f => f.path.endsWith('.java') || f.path === 'src/new.js');

function fakeLlm(findingsPerCall, calls = []) {
  return {
    name: 'fake/model',
    async review(args) {
      calls.push(args);
      return { review: { summary: 'Looks risky.', verdict: 'comment', findings: findingsPerCall } };
    }
  };
}

test('normalizes malformed review output', () => {
  const r = normalizeReview({ verdict: 'nope', findings: [{ path: 'b/x.js', line: '7', severity: 'HIGH', title: 't', body: 'b', confidence: 9 }, null, { path: 'y' }] });
  assert.equal(r.verdict, 'comment');
  assert.equal(r.findings.length, 1);
  assert.deepEqual(r.findings[0], { path: 'x.js', line: 7, severity: 'high', category: 'other', title: 't', body: 'b', suggestion: null, confidence: 1 });
});

test('extracts JSON from fenced or noisy text', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Here you go: {"a":2} thanks'), { a: 2 });
  assert.throws(() => extractJson('no json'));
});

test('anchors, filters, dedupes and sorts findings', () => {
  const cfg = { ...reviewConfig(), minSeverity: 'medium' };
  const out = anchorAndFilterFindings([
    { path: 'UserController.java', line: 19, severity: 'medium', category: 'bug', title: 'A', body: '', confidence: 0.9 },
    { path: 'src/main/java/com/acme/UserController.java', line: 14, severity: 'critical', category: 'security', title: 'Secret', body: '', confidence: 0.9 },
    { path: 'src/main/java/com/acme/UserController.java', line: 14, severity: 'critical', category: 'security', title: 'secret!', body: '', confidence: 0.9 },
    { path: 'src/new.js', line: 1, severity: 'low', category: 'bug', title: 'low', body: '', confidence: 0.9 },
    { path: 'src/new.js', line: 1, severity: 'high', category: 'bug', title: 'unsure', body: '', confidence: 0.2 },
    { path: 'src/new.js', line: 2, severity: 'high', category: 'bug', title: 'Already posted', body: '', confidence: 0.9 },
    { path: 'unknown.js', line: 3, severity: 'high', category: 'bug', title: 'Elsewhere', body: '', confidence: 0.9 }
  ], files(), cfg, [{ path: 'src/new.js', title: 'Already posted' }]);

  assert.deepEqual(out.map(f => [f.title, f.path, f.line, f.anchored]), [
    ['Secret', 'src/main/java/com/acme/UserController.java', 14, true],
    ['Elsewhere', 'unknown.js', null, false],
    ['A', 'src/main/java/com/acme/UserController.java', 18, true]
  ]);
});

test('runReview chunks large PRs and merges results', async () => {
  const calls = [];
  const llm = fakeLlm([{ path: 'src/new.js', line: 1, severity: 'high', category: 'bug', title: 'Boom', body: 'b', suggestion: null, confidence: 0.9 }], calls);
  const result = await runReview({ pr: samplePr(), files: files(), llm, reviewConfig: { ...reviewConfig(), maxChunkChars: 300 }, guidelines: 'Always use tabs' });
  assert.equal(calls.length, 2);
  assert.match(calls[0].system, /Always use tabs/);
  assert.match(calls[0].user, /part 1/);
  assert.equal(result.findings.length, 1);
  assert.equal(result.verdict, 'request_changes');
  assert.equal(result.inline.length, 1);
});

test('runReview tolerates partial chunk failures but throws when all fail', async () => {
  let n = 0;
  const flaky = { name: 'flaky', review: async () => { n += 1; if (n === 1) throw new Error('boom'); return { review: { summary: 's', verdict: 'approve', findings: [] } }; } };
  const result = await runReview({ pr: samplePr(), files: files(), llm: flaky, reviewConfig: { ...reviewConfig(), maxChunkChars: 300, concurrency: 1 } });
  assert.equal(result.failedChunks, 1);
  assert.equal(result.verdict, 'approve');

  const broken = { name: 'broken', review: async () => { throw new Error('down'); } };
  await assert.rejects(runReview({ pr: samplePr(), files: files(), llm: broken, reviewConfig: reviewConfig() }), /down/);
});

test('chunker respects max chunks and reports skipped files', () => {
  const { chunks, skipped } = buildChunks(files(), { maxChunkChars: 300, maxChunks: 1 });
  assert.equal(chunks.length, 1);
  assert.deepEqual(skipped, ['src/new.js']);
});

test('overflow beyond maxInlineComments goes to summary', async () => {
  const many = Array.from({ length: 4 }, (_, i) => ({ path: 'src/new.js', line: 1, severity: 'medium', category: 'bug', title: `Issue ${i}`, body: '', suggestion: null, confidence: 0.9 }));
  const result = await runReview({ pr: samplePr(), files: files(), llm: fakeLlm(many), reviewConfig: { ...reviewConfig(), maxInlineComments: 2 } });
  assert.equal(result.inline.length, 2);
  assert.equal(result.overflow.length, 2);
});
