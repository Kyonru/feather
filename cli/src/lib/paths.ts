import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function bundledLuaRoot(): string {
  // When running as a compiled binary, lua/ is shipped next to the executable.
  const execDir = dirname(process.execPath);
  const sibling = join(execDir, 'lua');
  if (existsSync(join(sibling, 'feather', 'init.lua'))) return sibling;
  // Fallback for npm/node: dist/lib/paths.js → ../../lua
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../lua');
}

export function repoLuaRoot(): string | null {
  const candidate = resolve(__dirname, '../../../src-lua');
  return existsSync(join(candidate, 'feather', 'init.lua')) ? candidate : null;
}

export function resolveLocalLuaRoot(opts: { localSrc?: string }): string {
  if (opts.localSrc) return resolve(opts.localSrc);
  return repoLuaRoot() ?? bundledLuaRoot();
}

export function findProjectDir(cwd = process.cwd()): string {
  if (existsSync(join(cwd, 'feather', 'init.lua'))) return cwd;
  if (existsSync(join(cwd, 'main.lua'))) return cwd;
  return cwd;
}
