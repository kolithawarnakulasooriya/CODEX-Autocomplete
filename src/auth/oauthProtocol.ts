export const AUTHORIZATION_URL = 'https://auth.openai.com/oauth/authorize';
export const TOKEN_URL = 'https://auth.openai.com/oauth/token';
export const REVOKE_URL = 'https://auth.openai.com/oauth/revoke';
export const CODEX_OAUTH_CLIENT_ID = 'app_EMoamEEZ73f0CkXaXp7hrann';
export const CODEX_OAUTH_SCOPE = 'openid profile email offline_access';

export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  accountId?: string;
}

interface OAuthTokenApiResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
}

export class InvalidRefreshTokenError extends Error {
  constructor() {
    super('The OAuth refresh token is invalid or expired.');
    this.name = 'InvalidRefreshTokenError';
  }
}

export function buildAuthorizationUrl(
  challenge: string,
  state: string,
  redirectUri: string,
): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: CODEX_OAUTH_CLIENT_ID,
    scope: CODEX_OAUTH_SCOPE,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    id_token_add_organizations: 'true',
    codex_cli_simplified_flow: 'true',
    originator: 'codex_vscode',
    state,
    redirect_uri: redirectUri,
  });
  return `${AUTHORIZATION_URL}?${query.toString()}`;
}

export function decodeAccountId(accessToken: string): string | undefined {
  const payloadPart = accessToken.split('.')[1];
  if (!payloadPart) {
    return undefined;
  }
  try {
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as {
      account_id?: string;
      sub?: string;
      'https://api.openai.com/auth'?: { chatgpt_account_id?: string };
    };
    return payload['https://api.openai.com/auth']?.chatgpt_account_id
      ?? payload.account_id
      ?? payload.sub;
  } catch {
    return undefined;
  }
}

function mapTokenResponse(payload: OAuthTokenApiResponse): OAuthTokenResponse {
  if (!payload.access_token) {
    throw new Error('OAuth token response did not contain an access token.');
  }
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
    accountId: decodeAccountId(payload.access_token),
  };
}

async function postTokenForm(
  parameters: Record<string, string>,
  fetcher: typeof fetch,
): Promise<Response> {
  return fetcher(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(parameters),
  });
}

export async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  redirectUri: string,
  fetcher: typeof fetch = fetch,
): Promise<OAuthTokenResponse> {
  const response = await postTokenForm({
    grant_type: 'authorization_code',
    client_id: CODEX_OAUTH_CLIENT_ID,
    code,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  }, fetcher);
  if (!response.ok) {
    throw new Error(`OAuth token exchange failed (${response.status}).`);
  }
  return mapTokenResponse(await response.json() as OAuthTokenApiResponse);
}

export async function refreshOAuthToken(
  refreshToken: string,
  fetcher: typeof fetch = fetch,
): Promise<OAuthTokenResponse> {
  const response = await postTokenForm({
    grant_type: 'refresh_token',
    client_id: CODEX_OAUTH_CLIENT_ID,
    refresh_token: refreshToken,
  }, fetcher);
  if (response.status === 400 || response.status === 401) {
    throw new InvalidRefreshTokenError();
  }
  if (!response.ok) {
    throw new Error(`OAuth token refresh failed (${response.status}).`);
  }
  return mapTokenResponse(await response.json() as OAuthTokenApiResponse);
}

export async function revokeOAuthToken(
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  if (!token) {
    return;
  }
  await fetcher(REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CODEX_OAUTH_CLIENT_ID, token }),
  });
}
