import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseUnifiedDiff, renderFileDiff, nearestCommentableLine, summarizeFiles } from '../src/utils/diff.js';
import { SAMPLE_DIFF } from './fixtures.js';

test('parses files, statuses and line numbers', () => {
  const files = parseUnifiedDiff(SAMPLE_DIFF);
  assert.deepEqual(files.map(f => [f.path, f.status]), [
    ['src/main/java/com/acme/UserController.java', 'modified'],
    ['package-lock.json', 'modified'],
    ['src/new.js', 'added'],
    ['old.txt', 'deleted'],
    ['logo.png', 'modified']
  ]);
  const controller = files[0];
  assert.equal(controller.additions, 4);
  assert.equal(controller.deletions, 1);
  assert.deepEqual([...controller.addedLines], [12, 14, 15, 16]);
  assert.ok(controller.commentableLines.has(10));
  assert.ok(files[4].isBinary);
  assert.deepEqual(summarizeFiles(files), { files: 5, linesAdded: 7, linesRemoved: 3 });
});

test('renders diff with new-file line numbers', () => {
  const [controller] = parseUnifiedDiff(SAMPLE_DIFF);
  const text = renderFileDiff(controller);
  assert.match(text, /### File: src\/main\/java\/com\/acme\/UserController.java/);
  assert.match(text, /\n {3}12 \+ {5}@Transactional/);
  assert.match(text, /\n {6}- {9}return service.find\(id\);/);
});

test('snaps to nearest commentable line', () => {
  const [controller] = parseUnifiedDiff(SAMPLE_DIFF);
  assert.equal(nearestCommentableLine(controller, 14), 14);
  assert.equal(nearestCommentableLine(controller, 19), 18);
  assert.equal(nearestCommentableLine(controller, 100), null);
});

test('handles renames', () => {
  const diff = 'diff --git a/a.js b/b.js\nsimilarity index 90%\nrename from a.js\nrename to b.js\n--- a/a.js\n+++ b/b.js\n@@ -1 +1 @@\n-x\n+y\n';
  const [file] = parseUnifiedDiff(diff);
  assert.equal(file.path, 'b.js');
  assert.equal(file.oldPath, 'a.js');
  assert.equal(file.status, 'renamed');
});
