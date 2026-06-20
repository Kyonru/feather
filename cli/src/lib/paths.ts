import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url));

export function bundledLuaRoot(): string {
  // When running as a compiled binary, lua/ is shipped next to the executable.
  const execDir = dirname(process.execPath);
  const sibling = join(execDir, 'lua');
  if (existsSync(join(sibling, 'feather', 'init.lua'))) return sibling;
  // Fallback for npm/node: dist/lib/paths.js → ../../lua
  return resolve(MODULE_DIR, '../../lua');
}

export function bundledSkillsRoot(): string {
  // Standalone binaries ship skills/ next to the executable.
  const execDir = dirname(process.execPath);
  const sibling = join(execDir, 'skills');
  if (existsSync(join(sibling, 'catalog.json'))) return sibling;
  // Fallback for npm/node: dist/lib/paths.js → ../../skills
  return resolve(MODULE_DIR, '../../skills');
}

export function repoLuaRoot(): string | null {
  const candidate = resolve(MODULE_DIR, '../../../src-lua');
  return existsSync(join(candidate, 'feather', 'init.lua')) ? candidate : null;
}

export function resolveLocalLuaRoot(opts: { localSrc?: string }): string {
  if (opts.localSrc) return resolve(opts.localSrc);
  return repoLuaRoot() ?? bundledLuaRoot();
}

function hasProjectConfig(dir: string): boolean {
  return existsSync(join(dir, 'feather.config.lua')) || existsSync(join(dir, '.featherrc.lua'));
}

function hasPackageLock(dir: string): boolean {
  return existsSync(join(dir, 'feather.lock.json'));
}

function hasRuntime(dir: string): boolean {
  return existsSync(join(dir, 'feather', 'init.lua'));
}

function hasMain(dir: string): boolean {
  return existsSync(join(dir, 'main.lua'));
}

function walkUp(start: string, predicate: (dir: string) => boolean): string | null {
  let current = resolve(start);
  while (true) {
    if (predicate(current)) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function findConfigDir(cwd = process.cwd()): string {
  const start = resolve(cwd);
  return walkUp(start, hasProjectConfig) ?? findProjectDir(start);
}

export function findPackageDir(cwd = process.cwd()): string {
  const start = resolve(cwd);
  return walkUp(start, (dir) => hasPackageLock(dir) || hasProjectConfig(dir)) ?? findProjectDir(start);
}

export function findProjectDir(cwd = process.cwd()): string {
  const start = resolve(cwd);
  return walkUp(start, (dir) => hasProjectConfig(dir) || hasPackageLock(dir) || hasRuntime(dir) || hasMain(dir)) ?? start;
}
