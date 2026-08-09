'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildCompletionContext, createContextCacheKey } = require('../out/core/context');

test('builds cursor context with CRLF input', () => {
  const text = 'const one = 1;\r\nconst answer = Math.\r\nconsole.log(answer);';
  const offset = text.indexOf('Math.') + 'Math.'.length;
  const context = buildCompletionContext(
    { text, offset, languageId: 'javascript', filePath: '/tmp/example.js' },
    { beforeLines: 10, afterLines: 10, maxCharacters: 1000 },
  );

  assert.equal(context.line, 1);
  assert.equal(context.character, 'const answer = Math.'.length);
  assert.equal(context.linePrefix, 'const answer = Math.');
  assert.equal(context.lineSuffix, '');
  assert.match(context.suffix, /console\.log/);
});

test('limits context by line count and character budget', () => {
  const text = Array.from({ length: 20 }, (_, index) => `line-${index}-xxxxxxxxxx`).join('\n');
  const offset = text.indexOf('line-10') + 4;
  const context = buildCompletionContext(
    { text, offset, languageId: 'plaintext', filePath: 'sample.txt' },
    { beforeLines: 2, afterLines: 2, maxCharacters: 100 },
  );

  assert.ok(context.prefix.length + context.suffix.length <= 100);
  assert.doesNotMatch(context.prefix, /line-0/);
  assert.doesNotMatch(context.suffix, /line-19/);
});

test('cache key changes when model or source changes', () => {
  const base = buildCompletionContext(
    { text: 'const x = ', offset: 10, languageId: 'typescript', filePath: 'a.ts' },
    { beforeLines: 5, afterLines: 2, maxCharacters: 1000 },
  );
  assert.notEqual(createContextCacheKey(base, 'model-a'), createContextCacheKey(base, 'model-b'));
  assert.notEqual(
    createContextCacheKey(base, 'model-a'),
    createContextCacheKey({ ...base, prefix: `${base.prefix}1` }, 'model-a'),
  );
});
