export type TriggerMode = 'manual' | 'automatic';
export type ReasoningEffort = 'none' | 'low';
export type AuthenticationMode = 'oauth' | 'apiKey' | 'auto';

export interface CompletionSettings {
  enabled: boolean;
  triggerMode: TriggerMode;
  authenticationMode: AuthenticationMode;
  model: string;
  oauthModel: string;
  endpoint: string;
  debounceMs: number;
  timeoutMs: number;
  maxOutputTokens: number;
  maxSuggestionLines: number;
  contextBeforeLines: number;
  contextAfterLines: number;
  maxContextCharacters: number;
  requestsPerMinute: number;
  cacheTtlMs: number;
  reasoningEffort: ReasoningEffort;
  disabledLanguages: readonly string[];
}

export interface CursorContextInput {
  text: string;
  offset: number;
  languageId: string;
  filePath: string;
}

export interface CompletionContext {
  language: string;
  filePath: string;
  line: number;
  character: number;
  linePrefix: string;
  lineSuffix: string;
  prefix: string;
  suffix: string;
}

export interface CompletionRequest {
  context: CompletionContext;
  model: string;
  maxOutputTokens: number;
  reasoningEffort: ReasoningEffort;
}
