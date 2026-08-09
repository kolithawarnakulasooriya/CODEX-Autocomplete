'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeSuggestion } = require('../out/core/normalizer');

test('strips fenced Markdown and explanations', () => {
  assert.equal(
    normalizeSuggestion('```ts\nmap(item => item.id)\n```', { linePrefix: '', lineSuffix: '' }, 3),
    'map(item => item.id)',
  );
  assert.equal(
    normalizeSuggestion("Here's the completion: value + 1", { linePrefix: '', lineSuffix: '' }, 3),
    'value + 1',
  );
});

test('removes repeated prefix and suffix overlap', () => {
  assert.equal(
    normalizeSuggestion('const answer = calculate();', {
      linePrefix: 'const answer = ',
      lineSuffix: ');',
    }, 3),
    'calculate(',
  );
});

test('enforces the configured line limit', () => {
  assert.equal(
    normalizeSuggestion('first\nsecond\nthird', { linePrefix: '', lineSuffix: '' }, 2),
    'first\nsecond',
  );
});
