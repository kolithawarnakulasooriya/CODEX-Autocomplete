# Local development and testing

## Fast loop

```bash
npm install
npm run watch
```

Keep `npm run watch` running, press `F5`, and use **Developer: Reload Window** in the Extension Development Host after a change.

## Validation

```bash
npm test
npm run test:integration
npm run package:vsix
```

`npm test` covers PKCE, OAuth URLs, token exchange and refresh, localhost callbacks, secure-token routing, OAuth/API request differences, context selection, output normalization, SSE events, retries, caching, and rate limiting. The integration smoke test verifies activation and command registration in real VS Code.

Live OAuth and model quality are intentionally not part of the deterministic test suite. To perform a manual live test, run **Autocomplete Codex: Sign in with ChatGPT** in the Extension Development Host and use `examples/demo.ts`. Open **Autocomplete Codex: Show Output** to inspect status and timing without exposing source or credentials.

## Debugging

Set breakpoints in `src/**/*.ts` and use the **Run Autocomplete Codex** launch configuration. Source maps connect `out/**/*.js` back to TypeScript.

Automatic mode is the default. Its equivalent settings are:

```json
{
  "autocompleteCodex.triggerMode": "automatic",
  "autocompleteCodex.debounceMs": 180
}
```

Use `"autocompleteCodex.triggerMode": "manual"` when deterministic, command-only requests are preferable during debugging.
