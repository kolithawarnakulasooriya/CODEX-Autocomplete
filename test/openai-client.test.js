'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  OpenAIResponsesClient,
  assertSafeEndpoint,
  buildResponsesRequestBody,
} = require('../out/core/openaiClient');

const request = {
  context: {
    language: 'typescript',
    filePath: '/workspace/example.ts',
    line: 0,
    character: 10,
    linePrefix: 'const x = ',
    lineSuffix: ';',
    prefix: 'const x = ',
    suffix: ';',
  },
  model: 'gpt-5.6-luna',
  maxOutputTokens: 64,
  reasoningEffort: 'none',
};

test('builds a Responses API body for non-persisted streaming', () => {
  const body = buildResponsesRequestBody(request);
  assert.equal(body.model, 'gpt-5.6-luna');
  assert.equal(body.stream, true);
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 64);
  assert.equal(body.reasoning.effort, 'none');
  const payload = JSON.parse(body.input[0].content[0].text);
  assert.equal(payload.line_prefix, 'const x = ');
  assert.equal(payload.line_suffix, ';');
});

test('rejects insecure remote endpoints but permits localhost test servers', () => {
  assert.throws(() => assertSafeEndpoint('http://example.com/v1/responses'), /must use HTTPS/);
  assert.doesNotThrow(() => assertSafeEndpoint('http://localhost:8080/v1/responses'));
  assert.doesNotThrow(() => assertSafeEndpoint('https://example.com/v1/responses'));
});

test('streams deltas and sends bearer authentication', async () => {
  let captured;
  const fetcher = async (url, init) => {
    captured = { url, init };
    return new Response([
      'data: {"type":"response.created"}\n\n',
      'data: {"type":"response.output_text.delta","delta":"42"}\n\n',
      'data: {"type":"response.completed"}\n\n',
    ].join(''), { status: 200 });
  };
  const client = new OpenAIResponsesClient({
    endpoint: 'https://example.test/v1/responses',
    accessToken: 'sk-test-value',
    fetcher,
  });
  const result = await client.complete(request, new AbortController().signal);

  assert.equal(result, '42');
  assert.equal(captured.url, 'https://example.test/v1/responses');
  assert.equal(captured.init.headers.Authorization, 'Bearer sk-test-value');
  assert.equal(JSON.parse(captured.init.body).stream, true);
});

test('retries a 429 response once', async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    if (calls === 1) {
      return new Response('busy', { status: 429, headers: { 'retry-after': '0' } });
    }
    return new Response('data: {"type":"response.output_text.delta","delta":"ok"}\n\ndata: [DONE]\n\n');
  };
  const client = new OpenAIResponsesClient({
    endpoint: 'https://example.test',
    accessToken: 'key',
    fetcher,
  });
  assert.equal(await client.complete(request, new AbortController().signal), 'ok');
  assert.equal(calls, 2);
});

test('OAuth requests omit API-only token limits and forward the account id', async () => {
  let captured;
  const fetcher = async (_url, init) => {
    captured = init;
    return new Response('data: [DONE]\n\n');
  };
  const client = new OpenAIResponsesClient({
    endpoint: 'https://chatgpt.com/backend-api/codex/responses',
    accessToken: 'oauth-token',
    authKind: 'oauth',
    accountId: 'account-123',
    fetcher,
  });
  await client.complete(request, new AbortController().signal);

  const body = JSON.parse(captured.body);
  assert.equal(body.max_output_tokens, undefined);
  assert.equal(body.text.verbosity, 'low');
  assert.equal(captured.headers.Authorization, 'Bearer oauth-token');
  assert.equal(captured.headers['ChatGPT-Account-Id'], 'account-123');
});
