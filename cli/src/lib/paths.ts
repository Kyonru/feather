import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function bundledLuaRoot(): string {
  return resolve(__dirname, '../../lua');
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
