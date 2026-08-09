import * as vscode from 'vscode';
import {
  AuthenticationMode,
  CompletionSettings,
  ReasoningEffort,
  TriggerMode,
} from './core/types';

export function getSettings(): CompletionSettings {
  const config = vscode.workspace.getConfiguration('autocompleteCodex');
  return {
    enabled: config.get<boolean>('enabled', true),
    triggerMode: config.get<TriggerMode>('triggerMode', 'automatic'),
    authenticationMode: config.get<AuthenticationMode>('authenticationMode', 'oauth'),
    model: config.get<string>('model', 'gpt-5.6-luna'),
    oauthModel: config.get<string>('oauthModel', 'gpt-5.4'),
    endpoint: config.get<string>('endpoint', 'https://api.openai.com/v1/responses'),
    debounceMs: config.get<number>('debounceMs', 180),
    timeoutMs: config.get<number>('timeoutMs', 5000),
    maxOutputTokens: config.get<number>('maxOutputTokens', 128),
    maxSuggestionLines: config.get<number>('maxSuggestionLines', 3),
    contextBeforeLines: config.get<number>('contextBeforeLines', 80),
    contextAfterLines: config.get<number>('contextAfterLines', 20),
    maxContextCharacters: config.get<number>('maxContextCharacters', 24000),
    requestsPerMinute: config.get<number>('requestsPerMinute', 30),
    cacheTtlMs: config.get<number>('cacheTtlMs', 30000),
    reasoningEffort: config.get<ReasoningEffort>('reasoningEffort', 'none'),
    disabledLanguages: config.get<readonly string[]>('disabledLanguages', []),
  };
}
