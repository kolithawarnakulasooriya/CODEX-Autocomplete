# Changelog

## 1.2.0

- Made automatic Copilot-style ghost text the default trigger mode
- Added `Enable Automatic Ghost Text` to enable both extension and VS Code inline-suggestion settings
- Added status-bar detection for disabled VS Code inline suggestions

## 1.1.0

- Added ChatGPT/Codex OAuth PKCE sign-in as the default authentication mode
- Added localhost callback validation, secure refresh-token storage, refresh locking, and logout/revocation
- Added OAuth/API-key/automatic credential routing and OAuth-specific Codex endpoint requests
- Added OAuth unit tests and Extension Host command coverage

## 1.0.0

- Initial `autocomplete-codex` release
- Manual and automatic inline completion
- Secure API-key storage and Responses API SSE streaming
- Cancellation, debounce, timeout, retry, rate limiting, cache, and normalization
- Unit and Extension Host integration tests
