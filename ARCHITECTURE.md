# Architecture

The reference project was analyzed as a staged VS Code inline-completion system with authentication, context shaping, a streaming provider, cancellation/debounce, post-processing, telemetry, and extensive quality tooling. `autocomplete-codex` keeps those essential boundaries in a smaller implementation:

```text
VS Code command / automatic trigger
                │
                ▼
TokenManager
  ├─ OAuth PKCE access/refresh tokens
  ├─ refresh lock + logout/revocation
  ├─ OAuth Codex endpoint selection
  └─ optional API-key fallback
                │
                ▼
AutocompleteCodexProvider
  ├─ trigger gate + debounce
  ├─ superseding cancellation + timeout
  ├─ rolling request limiter + TTL cache
  └─ bounded cursor context
                │
                ▼
OpenAIResponsesClient
  ├─ OAuth Codex backend or public /v1/responses
  ├─ stream=true and store=false
  ├─ bearer authentication
  ├─ one retry for 429/5xx
  └─ SSE response.output_text.delta parser
                │
                ▼
normalizeSuggestion
  ├─ strip fences/explanation
  ├─ remove repeated prefix
  ├─ remove suffix overlap
  └─ enforce line cap
                │
                ▼
VS Code InlineCompletionItem ghost text
```

OAuth protocol, PKCE, callback-server, and token lifecycle code lives under `src/auth`. Core completion logic lives under `src/core`. `src/completionProvider.ts` adapts those layers to the editor, and `src/extension.ts` owns commands, settings, status UI, and lifecycle.
