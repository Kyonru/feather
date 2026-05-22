import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = resolve(__dirname, '../..');
const extensionTestsPath = resolve(__dirname, 'suite/index.cjs');
const workspacePath = join(tmpdir(), 'feather-vscode-e2e-workspace');

mkdirSync(workspacePath, { recursive: true });
writeFileSync(join(workspacePath, 'main.lua'), 'function love.draw() end\n');
writeFileSync(join(workspacePath, 'feather.config.lua'), 'return { __DANGEROUS_INSECURE_CONNECTION__ = true }\n');

await runTests({
  extensionDevelopmentPath,
  extensionTestsPath,
  launchArgs: [workspacePath, '--disable-extensions'],
});
