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

test('localhost callback ignores incomplete authorization and accepts a later valid callback', async () => {
  const server = await startOAuthCallbackServer({ host: '127.0.0.1', port: 0, timeoutMs: 2000 });
  try {
    const callback = server.waitForCallback();
    const response = await fetch(server.redirectUri);
    assert.equal(response.status, 400);
    const valid = await fetch(`${server.redirectUri}?code=code-1&state=state-1`);
    assert.equal(valid.status, 200);
    assert.deepEqual(await callback, { code: 'code-1', state: 'state-1' });
  } finally {
    server.dispose();
  }
});

test('localhost callback ignores an unexpected OAuth state', async () => {
  const server = await startOAuthCallbackServer({
    host: '127.0.0.1',
    port: 0,
    timeoutMs: 2000,
    expectedState: 'expected',
  });
  try {
    const callback = server.waitForCallback();
    const response = await fetch(`${server.redirectUri}?code=code-1&state=wrong`);
    assert.equal(response.status, 400);
    const valid = await fetch(`${server.redirectUri}?code=code-2&state=expected`);
    assert.equal(valid.status, 200);
    assert.deepEqual(await callback, { code: 'code-2', state: 'expected' });
  } finally {
    server.dispose();
  }
});

test('localhost callback rejects a provider error only when state matches', async () => {
  const server = await startOAuthCallbackServer({
    host: '127.0.0.1', port: 0, timeoutMs: 2000, expectedState: 'expected',
  });
  try {
    const callback = server.waitForCallback();
    const ignored = await fetch(`${server.redirectUri}?error=attacker-controlled&state=wrong`);
    assert.equal(ignored.status, 400);
    const rejection = assert.rejects(callback, /OAuth authorization failed\.$/);
    const matching = await fetch(`${server.redirectUri}?error=access_denied&state=expected`);
    assert.equal(matching.status, 400);
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
