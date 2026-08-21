# autocomplete-codex

`autocomplete-codex` is a complete VS Code extension that generates inline code suggestions as ghost text. It signs in with your ChatGPT account through the Codex OAuth PKCE flow by default, with OpenAI API-key authentication available as a fallback.

This is a community extension, not an official OpenAI product.

## Features

- Inline ghost-text completion in file and untitled editors
- Copilot-style automatic ghost text while typing, with `Ctrl+Alt+Space` as a manual fallback
- Streaming Responses API client with incremental SSE parsing
- Browser-based ChatGPT OAuth sign-in with PKCE and localhost callback validation
- Automatic access-token refresh and sign-out/revocation
- Encrypted OAuth token and optional API-key storage in VS Code `SecretStorage`
- Cancellation of stale requests, debounce, timeout, retry, local rate limiting, and TTL caching
- Cursor-aware context before and after the insertion point
- Removal of code fences, explanations, repeated prefixes, and suffix overlaps
- Language allow/deny controls, a status-bar toggle, and an output channel
- Unit tests and a VS Code Extension Host integration smoke test

OAuth mode uses `gpt-5.4` by default through the Codex backend. API-key mode uses `gpt-5.6-luna` by default through the public Responses API. Both model settings are configurable.


## Commands

| Command | Purpose |
| --- | --- |
| `Autocomplete Codex: Sign in with ChatGPT` | Start Codex OAuth browser sign-in |
| `Autocomplete Codex: Sign out of ChatGPT` | Clear and revoke the OAuth session |
| `Autocomplete Codex: Show Authentication Status` | Show the selected mode and stored credential status |
| `Autocomplete Codex: Set OpenAI API Key` | Save or replace the key securely |
| `Autocomplete Codex: Clear OpenAI API Key` | Delete the saved key |
| `Autocomplete Codex: Trigger Inline Completion` | Request ghost text at the cursor |
| `Autocomplete Codex: Enable Automatic Ghost Text` | Enable automatic mode and VS Code inline suggestions |
| `Autocomplete Codex: Toggle Autocomplete` | Enable or disable the extension globally |
| `Autocomplete Codex: Show Output` | Open timing and error diagnostics |

## Important settings

All settings start with `autocompleteCodex.`. `triggerMode` defaults to `automatic`, and suggestions appear after the configured `debounceMs` pause while typing. `authenticationMode` defaults to `oauth`; `auto` prefers OAuth and falls back to an API key. `oauthModel` controls the Codex backend model, while `model` and `endpoint` apply to API-key mode.

If automatic suggestions do not appear, run **Autocomplete Codex: Enable Automatic Ghost Text**. This sets `autocompleteCodex.triggerMode` to `automatic` and enables VS Code's `editor.inlineSuggest.enabled` setting.

## Security and privacy

- OAuth access and refresh tokens are stored under `autocomplete-codex.oauthTokens` in encrypted VS Code `SecretStorage`.
- The optional API key is stored separately under `autocomplete-codex.openaiApiKey`.
- OAuth uses PKCE, a random state value, and a temporary localhost callback server. The authorization code is rejected if state validation fails.
- The current file path and a bounded source window around the cursor are sent to the configured endpoint.
- Requests set `store: false`.
- Debug output never prints OAuth tokens, API keys, or source context.
- `autocompleteCodex.endpoint` is used only in API-key mode and must be HTTPS except for localhost testing.

The ChatGPT OAuth client and Codex backend route mirror OpenAI's Codex tooling and the analyzed reference extension. They are not documented as a general-purpose third-party OAuth API and may require maintenance if OpenAI changes that contract.

The streaming implementation follows the official [OpenAI streaming Responses guide](https://developers.openai.com/api/docs/guides/streaming-responses).

# Version Updates

| Version | Updates |
| --- | --- |
| 1.0.0 | Initial Developments |
| 1.2.0 | Implemented Code API Key authentication |
| 1.3.0 | Implemented the Chat GPT Authentication |
| 1.4.0 | Full Security test and update |