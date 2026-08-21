import * as vscode from 'vscode';
import {
  AuthenticationMode,
  CompletionSettings,
  ReasoningEffort,
  TriggerMode,
} from './core/types';

const DEFAULT_ENDPOINT = 'https://api.openai.com/v1/responses';

function trustedValue<T>(config: vscode.WorkspaceConfiguration, key: string, fallback: T): T {
  const inspected = config.inspect<T>(key);
  return inspected?.globalLanguageValue
    ?? inspected?.globalValue
    ?? inspected?.defaultLanguageValue
    ?? inspected?.defaultValue
    ?? fallback;
}

function boundedNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : minimum));
}

export function getSettings(): CompletionSettings {
  const config = vscode.workspace.getConfiguration('autocompleteCodex');
  return {
    enabled: trustedValue(config, 'enabled', true),
    triggerMode: trustedValue<TriggerMode>(config, 'triggerMode', 'automatic'),
    authenticationMode: trustedValue<AuthenticationMode>(config, 'authenticationMode', 'oauth'),
    model: trustedValue(config, 'model', 'gpt-5.6-luna'),
    oauthModel: trustedValue(config, 'oauthModel', 'gpt-5.4'),
    endpoint: trustedValue(config, 'endpoint', DEFAULT_ENDPOINT),
    debounceMs: boundedNumber(trustedValue(config, 'debounceMs', 180), 0, 5000),
    timeoutMs: boundedNumber(trustedValue(config, 'timeoutMs', 5000), 250, 30000),
    maxOutputTokens: boundedNumber(trustedValue(config, 'maxOutputTokens', 128), 1, 1024),
    maxSuggestionLines: boundedNumber(trustedValue(config, 'maxSuggestionLines', 3), 1, 20),
    contextBeforeLines: boundedNumber(trustedValue(config, 'contextBeforeLines', 80), 1, 500),
    contextAfterLines: boundedNumber(trustedValue(config, 'contextAfterLines', 20), 0, 200),
    maxContextCharacters: boundedNumber(
      trustedValue(config, 'maxContextCharacters', 24000), 1000, 200000,
    ),
    requestsPerMinute: boundedNumber(trustedValue(config, 'requestsPerMinute', 30), 1, 600),
    cacheTtlMs: boundedNumber(trustedValue(config, 'cacheTtlMs', 30000), 0, 600000),
    reasoningEffort: trustedValue<ReasoningEffort>(config, 'reasoningEffort', 'none'),
    disabledLanguages: trustedValue<readonly string[]>(config, 'disabledLanguages', []),
  };
}
