import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionDevelopmentPath = resolve(__dirname, '../..');
const extensionTestsPath = resolve(__dirname, 'suite/index.cjs');
const workspacePath = join(tmpdir(), 'feather-cli-vscode-e2e-workspace');
// VS Code puts its IPC socket under the user-data dir, and macOS caps socket
// paths at 103 characters, so the default under .vscode-test/ fails from any
// deeply nested checkout (a git worktree, for one).
const userDataDir = join(tmpdir(), 'fvsc-user-data');

// Start from a clean project every run: the suite writes a broken lockfile and
// the managed jobs it starts may write files, so leftovers would change results.
rmSync(workspacePath, { recursive: true, force: true });
mkdirSync(workspacePath, { recursive: true });
writeFileSync(join(workspacePath, 'main.lua'), 'function love.draw() end\n');
writeFileSync(join(workspacePath, 'feather.config.lua'), 'return { managed = "cli", __DANGEROUS_INSECURE_CONNECTION__ = true }\n');

// VS Code 1.142 renamed the macOS executable from `Electron` to `Code`, which
// @vscode/test-electron 2.5.2 still expects. Resolve it ourselves.
// The download lives under node_modules: the root lint scans all of apps/, and a
// copy of VS Code under apps/vscode-extension/.vscode-test broke `pnpm run verify`.
const cachePath = join(extensionDevelopmentPath, 'node_modules', '.vscode-test');
let vscodeExecutablePath = await downloadAndUnzipVSCode({ cachePath });
if (!existsSync(vscodeExecutablePath)) {
  const renamed = join(dirname(vscodeExecutablePath), 'Code');
  if (existsSync(renamed)) vscodeExecutablePath = renamed;
}

await runTests({
  vscodeExecutablePath,
  extensionDevelopmentPath,
  extensionTestsPath,
  extensionTestsEnv: { FEATHER_E2E_WORKSPACE: workspacePath },
  launchArgs: [workspacePath, '--disable-extensions', `--user-data-dir=${userDataDir}`, '--skip-welcome', '--skip-release-notes'],
});
