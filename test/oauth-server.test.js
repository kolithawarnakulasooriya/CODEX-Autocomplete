'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { startOAuthCallbackServer } = require('../out/auth/oauthServer');

test('localhost callback returns authorization code and state', async () => {
  const server = await startOAuthCallbackServer({ host: '127.0.0.1', port: 0, timeoutMs: 2000 });
  try {
    const callback = server.waitForCallback();
    const response = await fetch(`${server.redirectUri}?code=code-1&state=state-1`);
    assert.equal(response.status, 200);
    assert.deepEqual(await callback, { code: 'code-1', state: 'state-1' });
  } finally {
    server.dispose();
  }
});

test('localhost callback rejects incomplete authorization', async () => {
  const server = await startOAuthCallbackServer({ host: '127.0.0.1', port: 0, timeoutMs: 2000 });
  try {
    const callback = server.waitForCallback();
    const rejection = assert.rejects(callback, /incomplete/);
    const response = await fetch(server.redirectUri);
    assert.equal(response.status, 400);
    await rejection;
  } finally {
    server.dispose();
  }
});

test('localhost callback rejects an unexpected OAuth state', async () => {
  const server = await startOAuthCallbackServer({
    host: '127.0.0.1',
    port: 0,
    timeoutMs: 2000,
    expectedState: 'expected',
  });
  try {
    const callback = server.waitForCallback();
    const rejection = assert.rejects(callback, /state validation failed/);
    const response = await fetch(`${server.redirectUri}?code=code-1&state=wrong`);
    assert.equal(response.status, 400);
    await rejection;
  } finally {
    server.dispose();
  }
});

test('localhost callback times out', async () => {
  const server = await startOAuthCallbackServer({ host: '127.0.0.1', port: 0, timeoutMs: 10 });
  try {
    await assert.rejects(() => server.waitForCallback(), /timed out/);
  } finally {
    server.dispose();
  }
});
