import * as vscode from 'vscode';
import { createChallenge, createState, createVerifier } from './pkce';
import { startOAuthCallbackServer } from './oauthServer';
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  OAuthTokenResponse,
} from './oauthProtocol';

export class LoginCancelledError extends Error {
  constructor() {
    super('Login cancelled.');
    this.name = 'LoginCancelledError';
  }
}

async function promptForRedirectUrl(expectedState: string): Promise<string> {
  const raw = await vscode.window.showInputBox({
    title: 'Autocomplete Codex: Complete OAuth Sign-in',
    prompt: 'Paste the full localhost redirect URL shown in your browser.',
    ignoreFocusOut: true,
  });
  if (!raw) {
    throw new LoginCancelledError();
  }
  const url = new URL(raw);
  if (url.searchParams.get('state') !== expectedState) {
    throw new Error('OAuth state validation failed.');
  }
  const code = url.searchParams.get('code');
  if (!code) {
    throw new Error('The redirect URL does not contain an authorization code.');
  }
  return code;
}

export async function beginOAuthLogin(): Promise<OAuthTokenResponse> {
  const verifier = createVerifier();
  const challenge = await createChallenge(verifier);
  const state = createState();
  const callbackServer = await startOAuthCallbackServer({ expectedState: state });
  const authorizationUrl = buildAuthorizationUrl(challenge, state, callbackServer.redirectUri);
  await vscode.env.openExternal(vscode.Uri.parse(authorizationUrl));

  let code: string;
  try {
    const callback = await callbackServer.waitForCallback();
    if (callback.state !== state) {
      throw new Error('OAuth state validation failed.');
    }
    code = callback.code;
  } catch (error) {
    const choice = await vscode.window.showWarningMessage(
      `Automatic OAuth callback failed: ${error instanceof Error ? error.message : String(error)}`,
      'Paste Redirect URL',
      'Cancel',
    );
    if (choice !== 'Paste Redirect URL') {
      throw new LoginCancelledError();
    }
    code = await promptForRedirectUrl(state);
  } finally {
    callbackServer.dispose();
  }

  return exchangeAuthorizationCode(code, verifier, callbackServer.redirectUri);
}
