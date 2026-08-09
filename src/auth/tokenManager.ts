import * as vscode from 'vscode';
import { AuthenticationMode } from '../core/types';
import {
  InvalidRefreshTokenError,
  OAuthTokenResponse,
  refreshOAuthToken,
  revokeOAuthToken,
} from './oauthProtocol';

export const API_KEY_SECRET = 'autocomplete-codex.openaiApiKey';
export const OAUTH_TOKENS_SECRET = 'autocomplete-codex.oauthTokens';
export const OAUTH_RESPONSES_ENDPOINT = 'https://chatgpt.com/backend-api/codex/responses';

interface StoredOAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  accountId?: string;
}

export interface CompletionCredential {
  kind: 'oauth' | 'apiKey';
  accessToken: string;
  endpoint: string;
  accountId?: string;
}

export class AuthenticationRequiredError extends Error {
  constructor(mode: AuthenticationMode) {
    super(mode === 'apiKey' ? 'An OpenAI API key is required.' : 'Sign in with ChatGPT to use Codex.');
    this.name = 'AuthenticationRequiredError';
  }
}

export class TokenManager {
  private refreshInFlight?: Promise<StoredOAuthTokens>;
  private invalidationCounter = 0;

  constructor(private readonly secrets: vscode.SecretStorage) {}

  async saveOAuthTokens(tokens: OAuthTokenResponse): Promise<void> {
    const stored: StoredOAuthTokens = {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: typeof tokens.expiresIn === 'number'
        ? Date.now() + tokens.expiresIn * 1000
        : undefined,
      accountId: tokens.accountId,
    };
    await this.secrets.store(OAUTH_TOKENS_SECRET, JSON.stringify(stored));
  }

  async setApiKey(apiKey: string): Promise<void> {
    await this.secrets.store(API_KEY_SECRET, apiKey);
  }

  async clearApiKey(): Promise<void> {
    await this.secrets.delete(API_KEY_SECRET);
  }

  async hasOAuthSession(): Promise<boolean> {
    return Boolean((await this.readOAuthTokens())?.accessToken);
  }

  async hasApiKey(): Promise<boolean> {
    return Boolean(await this.secrets.get(API_KEY_SECRET));
  }

  async hasCredential(mode: AuthenticationMode): Promise<boolean> {
    if (mode === 'oauth') {
      return this.hasOAuthSession();
    }
    if (mode === 'apiKey') {
      return this.hasApiKey();
    }
    return (await this.hasOAuthSession()) || this.hasApiKey();
  }

  async getCredential(mode: AuthenticationMode, apiEndpoint: string): Promise<CompletionCredential> {
    if (mode !== 'apiKey' && await this.hasOAuthSession()) {
      try {
        const tokens = await this.getValidOAuthTokens();
        return {
          kind: 'oauth',
          accessToken: tokens.accessToken,
          endpoint: OAUTH_RESPONSES_ENDPOINT,
          accountId: tokens.accountId,
        };
      } catch (error) {
        if (mode === 'oauth' || !(error instanceof AuthenticationRequiredError)) {
          throw error;
        }
      }
    }

    if (mode !== 'oauth') {
      const apiKey = await this.secrets.get(API_KEY_SECRET);
      if (apiKey) {
        return { kind: 'apiKey', accessToken: apiKey, endpoint: apiEndpoint };
      }
    }
    throw new AuthenticationRequiredError(mode);
  }

  async logoutOAuth(): Promise<void> {
    const tokens = await this.readOAuthTokens();
    this.invalidationCounter += 1;
    this.refreshInFlight = undefined;
    await this.secrets.delete(OAUTH_TOKENS_SECRET);
    await Promise.allSettled([
      tokens?.refreshToken ? revokeOAuthToken(tokens.refreshToken) : Promise.resolve(),
      tokens?.accessToken ? revokeOAuthToken(tokens.accessToken) : Promise.resolve(),
    ]);
  }

  private async getValidOAuthTokens(): Promise<StoredOAuthTokens> {
    const tokens = await this.readOAuthTokens();
    if (!tokens) {
      throw new AuthenticationRequiredError('oauth');
    }
    if (!tokens.expiresAt || Date.now() < tokens.expiresAt - 30_000) {
      return tokens;
    }
    if (!tokens.refreshToken) {
      await this.secrets.delete(OAUTH_TOKENS_SECRET);
      throw new AuthenticationRequiredError('oauth');
    }

    if (!this.refreshInFlight) {
      const invalidationAtStart = this.invalidationCounter;
      this.refreshInFlight = this.performRefresh(tokens, invalidationAtStart).finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    return this.refreshInFlight;
  }

  private async performRefresh(
    previous: StoredOAuthTokens,
    invalidationAtStart: number,
  ): Promise<StoredOAuthTokens> {
    try {
      const refreshed = await refreshOAuthToken(previous.refreshToken as string);
      if (invalidationAtStart !== this.invalidationCounter) {
        throw new AuthenticationRequiredError('oauth');
      }
      const merged: OAuthTokenResponse = {
        ...refreshed,
        refreshToken: refreshed.refreshToken ?? previous.refreshToken,
        accountId: refreshed.accountId ?? previous.accountId,
      };
      await this.saveOAuthTokens(merged);
      return (await this.readOAuthTokens()) as StoredOAuthTokens;
    } catch (error) {
      if (error instanceof InvalidRefreshTokenError) {
        await this.secrets.delete(OAUTH_TOKENS_SECRET);
        throw new AuthenticationRequiredError('oauth');
      }
      throw error;
    }
  }

  private async readOAuthTokens(): Promise<StoredOAuthTokens | undefined> {
    const raw = await this.secrets.get(OAUTH_TOKENS_SECRET);
    if (!raw) {
      return undefined;
    }
    try {
      const parsed = JSON.parse(raw) as StoredOAuthTokens;
      return typeof parsed.accessToken === 'string' ? parsed : undefined;
    } catch {
      await this.secrets.delete(OAUTH_TOKENS_SECRET);
      return undefined;
    }
  }
}
