'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  API_KEY_SECRET,
  OAUTH_RESPONSES_ENDPOINT,
  OAUTH_TOKENS_SECRET,
  TokenManager,
} = require('../out/auth/tokenManager');

class MemorySecretStorage {
  constructor() {
    this.values = new Map();
  }
  get(key) { return Promise.resolve(this.values.get(key)); }
  store(key, value) { this.values.set(key, value); return Promise.resolve(); }
  delete(key) { this.values.delete(key); return Promise.resolve(); }
}

test('OAuth mode resolves the Codex backend and account', async () => {
  const storage = new MemorySecretStorage();
  const manager = new TokenManager(storage);
  await manager.saveOAuthTokens({ accessToken: 'access', expiresIn: 3600, accountId: 'acct-1' });
  const credential = await manager.getCredential('oauth', 'https://api.openai.com/v1/responses');
  assert.deepEqual(credential, {
    kind: 'oauth',
    accessToken: 'access',
    endpoint: OAUTH_RESPONSES_ENDPOINT,
    accountId: 'acct-1',
  });
});

test('auto mode prefers OAuth and falls back to API key', async () => {
  const storage = new MemorySecretStorage();
  const manager = new TokenManager(storage);
  await manager.setApiKey('sk-test');
  assert.equal((await manager.getCredential('auto', 'https://api.example/responses')).kind, 'apiKey');
  await manager.saveOAuthTokens({ accessToken: 'oauth', expiresIn: 3600 });
  assert.equal((await manager.getCredential('auto', 'https://api.example/responses')).kind, 'oauth');
});

test('concurrent expired-token reads share one refresh request', async () => {
  const storage = new MemorySecretStorage();
  const manager = new TokenManager(storage);
  await manager.saveOAuthTokens({ accessToken: 'expired', refreshToken: 'refresh', expiresIn: -1 });
  const originalFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(JSON.stringify({ access_token: 'fresh', expires_in: 3600 }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const [first, second] = await Promise.all([
      manager.getCredential('oauth', 'https://api.example'),
      manager.getCredential('oauth', 'https://api.example'),
    ]);
    assert.equal(first.accessToken, 'fresh');
    assert.equal(second.accessToken, 'fresh');
    assert.equal(calls, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('logout clears OAuth tokens without clearing API-key fallback', async () => {
  const storage = new MemorySecretStorage();
  const manager = new TokenManager(storage);
  await manager.saveOAuthTokens({ accessToken: 'access', refreshToken: 'refresh', expiresIn: 3600 });
  await manager.setApiKey('sk-test');
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('', { status: 200 });
  try {
    await manager.logoutOAuth();
    assert.equal(await storage.get(OAUTH_TOKENS_SECRET), undefined);
    assert.equal(await storage.get(API_KEY_SECRET), 'sk-test');
  } finally {
    global.fetch = originalFetch;
  }
});
