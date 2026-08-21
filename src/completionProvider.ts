import * as vscode from 'vscode';
import { AuthenticationRequiredError, TokenManager } from './auth/tokenManager';
import { TtlCache } from './core/cache';
import { buildCompletionContext, createContextCacheKey } from './core/context';
import { normalizeSuggestion } from './core/normalizer';
import { OpenAIResponsesClient, abortableDelay } from './core/openaiClient';
import { SlidingWindowRateLimiter } from './core/rateLimiter';
import { CompletionSettings } from './core/types';

export class AutocompleteCodexProvider
  implements vscode.InlineCompletionItemProvider, vscode.Disposable
{
  private readonly manualTriggers = new Map<string, number>();
  private readonly requests = new Map<string, AbortController>();
  private readonly cache = new TtlCache<string>();
  private limiter: SlidingWindowRateLimiter;
  private limiterCapacity: number;

  constructor(
    private readonly tokenManager: TokenManager,
    private readonly output: vscode.OutputChannel,
    private readonly readSettings: () => CompletionSettings,
  ) {
    this.limiterCapacity = readSettings().requestsPerMinute;
    this.limiter = new SlidingWindowRateLimiter(this.limiterCapacity);
  }

  markManualTrigger(document: vscode.TextDocument): void {
    this.manualTriggers.set(document.uri.toString(), Date.now() + 3000);
  }

  clearCache(): void {
    this.cache.clear();
  }

  async hasCredential(): Promise<boolean> {
    return this.tokenManager.hasCredential(this.readSettings().authenticationMode);
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[]> {
    const settings = this.readSettings();
    if (!settings.enabled || settings.disabledLanguages.includes(document.languageId)) {
      return [];
    }

    const documentKey = document.uri.toString();
    const manual = this.consumeManualTrigger(documentKey);
    if (settings.triggerMode === 'manual' && !manual) {
      return [];
    }

    if (!(await this.tokenManager.hasCredential(settings.authenticationMode))) {
      this.log(settings.authenticationMode === 'apiKey'
        ? 'No API key configured; run “Autocomplete Codex: Set OpenAI API Key”.'
        : 'Not signed in; run “Autocomplete Codex: Sign in with ChatGPT”.');
      return [];
    }

    if (settings.requestsPerMinute !== this.limiterCapacity) {
      this.limiterCapacity = settings.requestsPerMinute;
      this.limiter = new SlidingWindowRateLimiter(this.limiterCapacity);
    }
    const controller = new AbortController();
    this.requests.get(documentKey)?.abort(new DOMException('Superseded', 'AbortError'));
    this.requests.set(documentKey, controller);
    const cancellation = token.onCancellationRequested(() => {
      controller.abort(new DOMException('Cancelled', 'AbortError'));
    });
    const timeout = setTimeout(
      () => controller.abort(new DOMException('Timed out', 'TimeoutError')),
      settings.timeoutMs,
    );

    try {
      if (!manual && settings.debounceMs > 0) {
        await abortableDelay(settings.debounceMs, controller.signal);
      }

      if (!this.limiter.tryAcquire()) {
        this.log(`Client rate limit reached (${settings.requestsPerMinute} requests/minute).`);
        return [];
      }

      const cursorOffset = document.offsetAt(position);
      const prefixBudget = Math.floor(settings.maxContextCharacters * 0.7);
      const suffixBudget = settings.maxContextCharacters - prefixBudget;
      const prefixStart = document.positionAt(Math.max(0, cursorOffset - prefixBudget));
      const documentEndOffset = document.offsetAt(new vscode.Position(document.lineCount, 0));
      const suffixEnd = document.positionAt(Math.min(documentEndOffset, cursorOffset + suffixBudget));
      const boundedPrefix = document.getText(new vscode.Range(prefixStart, position));
      const boundedSuffix = document.getText(new vscode.Range(position, suffixEnd));
      const context = buildCompletionContext(
        {
          text: boundedPrefix + boundedSuffix,
          offset: boundedPrefix.length,
          languageId: document.languageId,
          filePath: document.uri.fsPath || document.uri.toString(),
        },
        {
          beforeLines: settings.contextBeforeLines,
          afterLines: settings.contextAfterLines,
          maxCharacters: settings.maxContextCharacters,
        },
      );
      context.line = position.line;
      context.character = position.character;
      const credential = await this.tokenManager.getCredential(
        settings.authenticationMode,
        settings.endpoint,
      );
      const model = credential.kind === 'oauth' ? settings.oauthModel : settings.model;
      const cacheKey = createContextCacheKey(context, `${credential.kind}:${model}`);
      const cached = this.cache.get(cacheKey);
      if (cached !== undefined) {
        this.log('Cache hit.');
        return this.toItems(cached, position);
      }

      const startedAt = Date.now();
      const client = new OpenAIResponsesClient({
        endpoint: credential.endpoint,
        accessToken: credential.accessToken,
        authKind: credential.kind,
        accountId: credential.accountId,
        log: (message) => this.log(message),
      });
      const raw = await client.complete(
        {
          context,
          model,
          maxOutputTokens: settings.maxOutputTokens,
          reasoningEffort: settings.reasoningEffort,
        },
        controller.signal,
      );
      const suggestion = normalizeSuggestion(raw, context, settings.maxSuggestionLines);
      this.log(`Completion finished in ${Date.now() - startedAt}ms (${suggestion.length} chars).`);
      if (!suggestion) {
        return [];
      }
      this.cache.set(cacheKey, suggestion, settings.cacheTtlMs);
      return this.toItems(suggestion, position);
    } catch (error) {
      if (!controller.signal.aborted) {
        this.log(error instanceof AuthenticationRequiredError
          ? `Authentication required: ${error.message}`
          : `Completion failed: ${error instanceof Error ? error.message : String(error)}`);
      }
      return [];
    } finally {
      clearTimeout(timeout);
      cancellation.dispose();
      if (this.requests.get(documentKey) === controller) {
        this.requests.delete(documentKey);
      }
    }
  }

  dispose(): void {
    for (const request of this.requests.values()) {
      request.abort(new DOMException('Extension disposed', 'AbortError'));
    }
    this.requests.clear();
    this.cache.clear();
  }

  private consumeManualTrigger(documentKey: string): boolean {
    const expiresAt = this.manualTriggers.get(documentKey) ?? 0;
    this.manualTriggers.delete(documentKey);
    return expiresAt >= Date.now();
  }

  private toItems(suggestion: string, position: vscode.Position): vscode.InlineCompletionItem[] {
    const item = new vscode.InlineCompletionItem(
      suggestion,
      new vscode.Range(position, position),
      { command: 'autocompleteCodex.inlineAccepted', title: 'Record accepted completion' },
    );
    return [item];
  }

  private log(message: string): void {
    this.output.appendLine(`[${new Date().toISOString()}] ${message}`);
  }
}
