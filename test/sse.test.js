'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { SseParser, textFromEvent } = require('../out/core/sse');

test('parses SSE events split across arbitrary chunks', () => {
  const parser = new SseParser();
  assert.deepEqual(parser.push('event: message\ndata: {"type":"response.output_'), []);
  const payloads = parser.push('text.delta","delta":"hello"}\n\ndata: [DONE]\n\n');
  assert.equal(payloads.length, 2);
  assert.deepEqual(textFromEvent(payloads[0]), { text: 'hello', done: false });
  assert.deepEqual(textFromEvent(payloads[1]), { text: '', done: true });
});

test('joins multiline data fields and ignores invalid JSON', () => {
  const parser = new SseParser();
  assert.deepEqual(parser.push('data: {"type":\ndata: "noop"}\n\n'), ['{"type":\n"noop"}']);
  assert.deepEqual(textFromEvent('not-json'), { text: '', done: false });
});

test('throws stream errors with provider message', () => {
  assert.throws(
    () => textFromEvent('{"type":"error","error":{"message":"bad request"}}'),
    /bad request/,
  );
});

test('rejects an SSE event that exceeds the parser buffer limit', () => {
  const parser = new SseParser(16);
  assert.throws(() => parser.push('data: 12345678901'), /size limit/);
});


