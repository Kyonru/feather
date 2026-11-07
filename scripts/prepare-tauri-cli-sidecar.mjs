import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export function sidecarBinaryForTarget(targetTriple) {
  if (targetTriple === 'aarch64-apple-darwin') return 'feather';
  if (targetTriple === 'x86_64-apple-darwin') return 'feather-darwin-x64';
  if (targetTriple === 'x86_64-pc-windows-msvc') return 'feather-win-x64.exe';
  if (targetTriple === 'x86_64-unknown-linux-gnu') return 'feather-linux-x64';
  throw new Error(`No Feather CLI sidecar is built for target ${targetTriple}.`);
}

export function prepareSidecar({ root = process.cwd(), targetTriple } = {}) {
  const hostTriple = execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
    .split('\n')
    .find((line) => line.startsWith('host:'))
    ?.slice('host:'.length)
    .trim();
  const triple = targetTriple || process.env.TAURI_ENV_TARGET_TRIPLE || hostTriple;

  if (!triple) throw new Error('Could not determine the Rust target triple.');

  const extension = triple.includes('windows') ? '.exe' : '';
  const source = join(root, 'apps', 'cli', 'bin', sidecarBinaryForTarget(triple));
  const targetDir = join(root, 'apps', 'inspector', 'src-tauri', 'binaries');
  const target = join(targetDir, `feather-cli-${triple}${extension}`);
  mkdirSync(targetDir, { recursive: true });
  copyFileSync(source, target);
  chmodSync(target, 0o755);
  console.log(`Prepared Tauri CLI sidecar: ${target}`);
  return target;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  prepareSidecar({ root: resolve(dirname(currentFile), '..') });
}
