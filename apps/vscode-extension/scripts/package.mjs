import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const prepareScript = join(extensionRoot, 'scripts', 'prepare.mjs');
let packageResult;
let restoreResult;

try {
  packageResult = spawnSync('npx', ['@vscode/vsce', 'package'], {
    cwd: extensionRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });
} finally {
  // A packaged extension needs platform binaries, while local development and
  // repository checks need feather-dev.mjs. Always put the workspace back in
  // development mode, even when vsce itself fails.
  restoreResult = spawnSync(process.execPath, [prepareScript], {
    cwd: extensionRoot,
    encoding: 'utf8',
    stdio: 'inherit',
  });
}

if (restoreResult.error) throw restoreResult.error;
if (restoreResult.status !== 0) {
  throw new Error(`Could not restore the extension development bundle (exit ${restoreResult.status}).`);
}
if (packageResult.error) throw packageResult.error;
if (packageResult.status !== 0) process.exitCode = packageResult.status ?? 1;
