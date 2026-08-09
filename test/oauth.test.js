'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  CODEX_OAUTH_CLIENT_ID,
  buildAuthorizationUrl,
  decodeAccountId,
  exchangeAuthorizationCode,
  refreshOAuthToken,
} = require('../out/auth/oauthProtocol');
const { createChallenge, createState, createVerifier } = require('../out/auth/pkce');

test('builds Codex PKCE authorization URL with state and offline access', () => {
  const url = new URL(buildAuthorizationUrl('challenge', 'state', 'http://localhost:1455/auth/callback'));
  assert.equal(`${url.origin}${url.pathname}`, 'https://auth.openai.com/oauth/authorize');
  assert.equal(url.searchParams.get('client_id'), CODEX_OAUTH_CLIENT_ID);
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), 'challenge');
  assert.equal(url.searchParams.get('state'), 'state');
  assert.match(url.searchParams.get('scope'), /offline_access/);
  assert.equal(url.searchParams.get('originator'), 'codex_vscode');
});

test('PKCE verifier, challenge, and state are URL safe', async () => {
  const verifier = createVerifier();
  const challenge = await createChallenge(verifier);
  const state = createState();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.match(challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.match(state, /^[A-Za-z0-9_-]{22}$/);
});

test('exchanges authorization code with verifier and redirect URI', async () => {
  let captured;
  const fetcher = async (url, init) => {
    captured = { url, init };
    return new Response(JSON.stringify({
      access_token: 'header.payload.signature',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const tokens = await exchangeAuthorizationCode('code', 'verifier', 'http://localhost/cb', fetcher);
  const form = new URLSearchParams(captured.init.body);
  assert.equal(form.get('grant_type'), 'authorization_code');
  assert.equal(form.get('code_verifier'), 'verifier');
  assert.equal(form.get('redirect_uri'), 'http://localhost/cb');
  assert.equal(tokens.accessToken, 'header.payload.signature');
  assert.equal(tokens.refreshToken, 'refresh-token');
});

test('refresh rejects invalid refresh tokens', async () => {
  const fetcher = async () => new Response('{}', { status: 401 });
  await assert.rejects(() => refreshOAuthToken('bad-token', fetcher), /invalid or expired/);
});

test('decodes nested ChatGPT account id from access token', () => {
  const payload = Buffer.from(JSON.stringify({
    'https://api.openai.com/auth': { chatgpt_account_id: 'acct-42' },
  })).toString('base64url');
  assert.equal(decodeAccountId(`header.${payload}.signature`), 'acct-42');
});
