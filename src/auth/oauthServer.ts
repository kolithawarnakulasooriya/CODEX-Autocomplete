import * as http from 'node:http';

export interface OAuthCallbackResult {
  code: string;
  state: string;
}

export interface OAuthServerOptions {
  host?: string;
  port?: number;
  portFallbackCount?: number;
  timeoutMs?: number;
  expectedState?: string;
}

export interface OAuthCallbackServer {
  redirectUri: string;
  waitForCallback(): Promise<OAuthCallbackResult>;
  dispose(): void;
}

const CALLBACK_PATH = '/auth/callback';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function callbackHtml(success: boolean, message: string): string {
  const title = success ? 'Sign-in complete' : 'Sign-in failed';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>`
    + `<body style="font:16px system-ui;padding:3rem;max-width:40rem"><h1>${title}</h1>`
    + `<p>${escapeHtml(message)}</p><p>You can close this window and return to VS Code.</p></body></html>`;
}

export async function startOAuthCallbackServer(
  options: OAuthServerOptions = {},
): Promise<OAuthCallbackServer> {
  const host = options.host ?? 'localhost';
  const basePort = options.port ?? 1455;
  const fallbackCount = basePort === 0 ? 0 : (options.portFallbackCount ?? 5);
  const timeoutMs = options.timeoutMs ?? 120_000;
  let lastError: Error | undefined;

  for (let offset = 0; offset <= fallbackCount; offset += 1) {
    const requestedPort = basePort === 0 ? 0 : basePort + offset;
    const server = http.createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = (): void => {
          server.off('error', onError);
          resolve();
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(requestedPort, host);
      });
    } catch (error) {
      server.close();
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        lastError = error as Error;
        continue;
      }
      throw error;
    }

    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('OAuth callback server did not expose a TCP port.');
    }
    const redirectUri = `http://${host}:${address.port}${CALLBACK_PATH}`;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = (): void => {
      if (disposed) {
        return;
      }
      disposed = true;
      if (timer) {
        clearTimeout(timer);
      }
      server.close();
    };

    const callback = new Promise<OAuthCallbackResult>((resolve, reject) => {
      server.on('request', (request, response) => {
        const requestUrl = new URL(request.url ?? '/', redirectUri);
        if (requestUrl.pathname !== CALLBACK_PATH) {
          response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          response.end('Not found');
          return;
        }

        const error = requestUrl.searchParams.get('error');
        const code = requestUrl.searchParams.get('code');
        const state = requestUrl.searchParams.get('state');
        const stateMatches = Boolean(state && (!options.expectedState || state === options.expectedState));
        if (!stateMatches || (!code && !error)) {
          response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end(callbackHtml(false, 'The OAuth callback was invalid. Waiting for sign-in to complete.'));
          return;
        }

        if (error) {
          response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end(callbackHtml(false, 'The OAuth provider declined the sign-in request.'));
          cleanup();
          reject(new Error('OAuth authorization failed.'));
          return;
        }

        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(callbackHtml(true, 'Autocomplete Codex is signed in.'));
        cleanup();
        resolve({ code: code!, state: state! });
      });
      server.once('error', (error) => {
        cleanup();
        reject(error);
      });
      timer = setTimeout(() => {
        cleanup();
        reject(new Error('OAuth callback timed out.'));
      }, timeoutMs);
    });

    return {
      redirectUri,
      waitForCallback: () => callback,
      dispose: cleanup,
    };
  }

  throw lastError ?? new Error('Unable to start the OAuth callback server.');
}
