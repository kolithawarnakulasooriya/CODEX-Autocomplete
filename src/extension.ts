import * as vscode from 'vscode';
import { beginOAuthLogin, LoginCancelledError } from './auth/oauth';
import { TokenManager } from './auth/tokenManager';
import { AutocompleteCodexProvider } from './completionProvider';
import { getSettings } from './config';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Autocomplete Codex');
  const tokenManager = new TokenManager(context.secrets);
  const provider = new AutocompleteCodexProvider(tokenManager, output, getSettings);
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  status.show();

  const refreshStatus = async (): Promise<void> => {
    const settings = getSettings();
    const hasOAuth = await tokenManager.hasOAuthSession();
    const hasApiKey = await tokenManager.hasApiKey();
    const hasCredential = await tokenManager.hasCredential(settings.authenticationMode);
    const inlineSuggestionsEnabled = vscode.workspace
      .getConfiguration('editor')
      .get<boolean>('inlineSuggest.enabled', true);
    const activeAuthentication = settings.authenticationMode === 'apiKey'
      ? 'API key'
      : hasOAuth
        ? 'ChatGPT OAuth'
        : hasApiKey && settings.authenticationMode === 'auto'
          ? 'API key fallback'
          : 'ChatGPT OAuth';

    status.command = hasCredential && !inlineSuggestionsEnabled
      ? 'autocompleteCodex.enableAutomatic'
      : hasCredential
      ? 'autocompleteCodex.toggle'
      : settings.authenticationMode === 'apiKey'
        ? 'autocompleteCodex.setApiKey'
        : 'autocompleteCodex.login';
    status.text = settings.enabled ? '$(sparkle) Codex' : '$(circle-slash) Codex';
    status.tooltip = !hasCredential
      ? settings.authenticationMode === 'apiKey'
        ? 'Autocomplete Codex needs an OpenAI API key'
        : 'Sign in with ChatGPT to use Autocomplete Codex'
      : !inlineSuggestionsEnabled
        ? 'VS Code inline suggestions are disabled; click to enable automatic ghost text'
      : settings.enabled
        ? `Autocomplete enabled (${settings.triggerMode}, ${activeAuthentication})`
        : 'Autocomplete disabled';
    status.backgroundColor = !hasCredential || !inlineSuggestionsEnabled
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
  };

  const login = vscode.commands.registerCommand('autocompleteCodex.login', async () => {
    try {
      const tokens = await beginOAuthLogin();
      await tokenManager.saveOAuthTokens(tokens);
      await vscode.workspace
        .getConfiguration('autocompleteCodex')
        .update('authenticationMode', 'oauth', vscode.ConfigurationTarget.Global);
      provider.clearCache();
      await refreshStatus();
      await vscode.window.showInformationMessage('Autocomplete Codex: signed in with ChatGPT.');
    } catch (error) {
      if (error instanceof LoginCancelledError) {
        await vscode.window.showInformationMessage('Autocomplete Codex: sign-in cancelled.');
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      output.appendLine(`[${new Date().toISOString()}] OAuth sign-in failed: ${message}`);
      output.show(true);
      await vscode.window.showErrorMessage(`Autocomplete Codex sign-in failed: ${message}`);
    }
  });

  const logout = vscode.commands.registerCommand('autocompleteCodex.logout', async () => {
    if (!(await tokenManager.hasOAuthSession())) {
      await vscode.window.showInformationMessage('Autocomplete Codex: already signed out.');
      return;
    }
    await tokenManager.logoutOAuth();
    provider.clearCache();
    await refreshStatus();
    await vscode.window.showInformationMessage('Autocomplete Codex: signed out of ChatGPT.');
  });

  const authStatus = vscode.commands.registerCommand('autocompleteCodex.authStatus', async () => {
    const settings = getSettings();
    const hasOAuth = await tokenManager.hasOAuthSession();
    const hasApiKey = await tokenManager.hasApiKey();
    await vscode.window.showInformationMessage(
      `Autocomplete Codex: mode=${settings.authenticationMode}; ChatGPT=${hasOAuth ? 'signed in' : 'signed out'}; API key=${hasApiKey ? 'configured' : 'not configured'}.`,
    );
  });

  const setApiKey = vscode.commands.registerCommand('autocompleteCodex.setApiKey', async () => {
    const apiKey = await vscode.window.showInputBox({
      title: 'Autocomplete Codex: OpenAI API Key',
      prompt: 'The key is encrypted in VS Code SecretStorage and is never written to settings.',
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => value.trim().length < 10 ? 'Enter a valid API key.' : undefined,
    });
    if (apiKey === undefined) {
      return;
    }
    await tokenManager.setApiKey(apiKey.trim());
    await vscode.workspace
      .getConfiguration('autocompleteCodex')
      .update('authenticationMode', 'apiKey', vscode.ConfigurationTarget.Global);
    provider.clearCache();
    await refreshStatus();
    await vscode.window.showInformationMessage('Autocomplete Codex: API key saved securely.');
  });

  const clearApiKey = vscode.commands.registerCommand('autocompleteCodex.clearApiKey', async () => {
    await tokenManager.clearApiKey();
    provider.clearCache();
    await refreshStatus();
    await vscode.window.showInformationMessage('Autocomplete Codex: API key removed.');
  });

  const trigger = vscode.commands.registerCommand('autocompleteCodex.trigger', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    if (!(await provider.hasCredential())) {
      const settings = getSettings();
      if (settings.authenticationMode === 'apiKey') {
        const choice = await vscode.window.showWarningMessage(
          'Autocomplete Codex needs an OpenAI API key.',
          'Set API Key',
        );
        if (choice === 'Set API Key') {
          await vscode.commands.executeCommand('autocompleteCodex.setApiKey');
        }
      } else {
        const choice = await vscode.window.showWarningMessage(
          'Sign in with ChatGPT to use Autocomplete Codex.',
          'Sign in with ChatGPT',
          'Use API Key',
        );
        if (choice === 'Sign in with ChatGPT') {
          await vscode.commands.executeCommand('autocompleteCodex.login');
        } else if (choice === 'Use API Key') {
          await vscode.commands.executeCommand('autocompleteCodex.setApiKey');
        }
      }
      return;
    }
    provider.markManualTrigger(editor.document);
    await vscode.commands.executeCommand('editor.action.inlineSuggest.trigger');
  });

  const enableAutomatic = vscode.commands.registerCommand(
    'autocompleteCodex.enableAutomatic',
    async () => {
      await vscode.workspace
        .getConfiguration('autocompleteCodex')
        .update('triggerMode', 'automatic', vscode.ConfigurationTarget.Global);
      await vscode.workspace
        .getConfiguration('editor')
        .update('inlineSuggest.enabled', true, vscode.ConfigurationTarget.Global);
      provider.clearCache();
      await refreshStatus();
      await vscode.window.showInformationMessage(
        'Autocomplete Codex: automatic ghost text enabled. Pause briefly after typing to see a suggestion.',
      );
    },
  );

  const toggle = vscode.commands.registerCommand('autocompleteCodex.toggle', async () => {
    const enabled = getSettings().enabled;
    await vscode.workspace
      .getConfiguration('autocompleteCodex')
      .update('enabled', !enabled, vscode.ConfigurationTarget.Global);
    await refreshStatus();
    await vscode.window.showInformationMessage(
      `Autocomplete Codex: ${enabled ? 'disabled' : 'enabled'}.`,
    );
  });

  const showOutput = vscode.commands.registerCommand('autocompleteCodex.showOutput', () => {
    output.show(true);
  });

  const accepted = vscode.commands.registerCommand('autocompleteCodex.inlineAccepted', () => {
    output.appendLine(`[${new Date().toISOString()}] Completion accepted.`);
  });

  const configurationChanged = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration('autocompleteCodex')) {
      provider.clearCache();
      void refreshStatus();
    }
  });

  const registration = vscode.languages.registerInlineCompletionItemProvider(
    [{ scheme: 'file' }, { scheme: 'untitled' }],
    provider,
  );

  context.subscriptions.push(
    output,
    provider,
    status,
    login,
    logout,
    authStatus,
    setApiKey,
    clearApiKey,
    trigger,
    enableAutomatic,
    toggle,
    showOutput,
    accepted,
    configurationChanged,
    registration,
  );
  await refreshStatus();
  output.appendLine(`[${new Date().toISOString()}] Autocomplete Codex activated.`);
}

export function deactivate(): void {
  // Disposables registered in the extension context own shutdown cleanup.
}
