import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPathFilter, globToRegExp } from '../src/utils/fileFilter.js';

test('glob conversion', () => {
  assert.ok(globToRegExp('**/*.min.js').test('a/b/c.min.js'));
  assert.ok(globToRegExp('**/*.min.js').test('c.min.js'));
  assert.ok(globToRegExp('src/**').test('src/a/b.js'));
  assert.ok(!globToRegExp('src/*.js').test('src/a/b.js'));
  assert.ok(globToRegExp('**/*.{png,jpg}').test('img/x.JPG'));
});

test('default ignores and custom include/ignore', () => {
  const filter = createPathFilter({ ignorePaths: ['docs/**'] });
  assert.equal(filter('src/app.js'), true);
  assert.equal(filter('package-lock.json'), false);
  assert.equal(filter('web/dist/bundle.js'), false);
  assert.equal(filter('docs/readme.md'), false);
  const onlyJava = createPathFilter({ includePaths: ['**/*.java'] });
  assert.equal(onlyJava('src/A.java'), true);
  assert.equal(onlyJava('src/a.js'), false);
});
