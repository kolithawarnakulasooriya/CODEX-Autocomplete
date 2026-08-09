import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  // Codex and some VS Code terminals inherit this variable from an extension host.
  // The downloaded Electron test runtime must start as VS Code, not as plain Node.
  delete process.env.ELECTRON_RUN_AS_NODE;
  const extensionDevelopmentPath = path.resolve(__dirname, '../..');
  const extensionTestsPath = path.resolve(__dirname, './suite/index');
  await runTests({ extensionDevelopmentPath, extensionTestsPath });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
