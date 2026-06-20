import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const triple = execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
  .split('\n')
  .find((line) => line.startsWith('host:'))
  ?.slice('host:'.length)
  .trim();

if (!triple) {
  throw new Error('Could not determine Rust host target triple.');
}

const extension = process.platform === 'win32' ? '.exe' : '';
const source =
  process.platform === 'darwin' && process.arch === 'arm64'
    ? join(root, 'cli', 'bin', 'feather')
    : process.platform === 'darwin'
      ? join(root, 'cli', 'bin', 'feather-darwin-x64')
      : process.platform === 'win32'
        ? join(root, 'cli', 'bin', 'feather-win-x64.exe')
        : join(root, 'cli', 'bin', 'feather-linux-x64');

const targetDir = join(root, 'src-tauri', 'binaries');
const target = join(targetDir, `feather-cli-${triple}${extension}`);
mkdirSync(targetDir, { recursive: true });
copyFileSync(source, target);
chmodSync(target, 0o755);
console.log(`Prepared Tauri CLI sidecar: ${target}`);
