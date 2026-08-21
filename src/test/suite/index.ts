import * as assert from 'node:assert/strict';
import * as vscode from 'vscode';

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('Kolitha.autocomplete-codex');
  assert.ok(extension, 'Extension should be discoverable in the Extension Development Host.');
  await extension.activate();
  assert.equal(extension.isActive, true);
  assert.equal(
    vscode.workspace.getConfiguration('autocompleteCodex').get('triggerMode'),
    'automatic',
  );

  const commands = await vscode.commands.getCommands(true);
  for (const command of [
    'autocompleteCodex.login',
    'autocompleteCodex.logout',
    'autocompleteCodex.authStatus',
    'autocompleteCodex.setApiKey',
    'autocompleteCodex.clearApiKey',
    'autocompleteCodex.trigger',
    'autocompleteCodex.enableAutomatic',
    'autocompleteCodex.toggle',
    'autocompleteCodex.showOutput',
  ]) {
    assert.ok(commands.includes(command), `Expected registered command: ${command}`);
  }
}
