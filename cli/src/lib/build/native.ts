import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
  type Dirent,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { copyDirectory } from './files.js';

export type NativeBuildLogger = (message: string) => void;

export type NativeCacheInfo = {
  enabled: boolean;
  hit: boolean;
  path?: string;
  key?: string;
};

export type NativeCacheOptions = {
  enabled: boolean;
  target: 'android' | 'ios';
  outDir: string;
  keyParts: Record<string, unknown>;
  requiredPaths?: string[];
  log?: NativeBuildLogger;
};

export type NativeWorkspace = {
  root: string;
  dir: string;
  cache: NativeCacheInfo;
  cleanup: () => void;
};

export function createNativeWorkspace(
  prefix: string,
  templateDir: string,
  dirname: string,
  cache?: NativeCacheOptions,
): NativeWorkspace {
  if (cache?.enabled) {
    const key = nativeCacheKey(templateDir, cache.target, cache.keyParts);
    const root = join(cache.outDir, '.feather-cache', cache.target, key);
    const dir = join(root, dirname);
    const hit = existsSync(dir) && cache.requiredPaths?.every((path) => existsSync(join(dir, path))) !== false;
    logNativeStep(cache.log, `Build cache: ${hit ? 'hit' : 'miss'} ${root}`);
    if (!hit) {
      rmSync(root, { recursive: true, force: true });
      mkdirSync(root, { recursive: true });
      copyDirectory(templateDir, dir);
    }
    return {
      root,
      dir,
      cache: { enabled: true, hit, path: root, key },
      cleanup: () => {},
    };
  }

  const root = mkdtempSync(join(tmpdir(), prefix));
  const dir = join(root, dirname);
  copyDirectory(templateDir, dir);
  return {
    root,
    dir,
    cache: { enabled: false, hit: false },
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function nativeCacheKey(templateDir: string, target: 'android' | 'ios', keyParts: Record<string, unknown>): string {
  const payload = stableJson({
    schema: 1,
    target,
    templateDir: realpathSync(templateDir),
    templateGitHead: gitHead(templateDir),
    keyParts,
  });
  return createHash('sha256').update(payload).digest('hex').slice(0, 32);
}

function gitHead(dir: string): string | null {
  const result = spawnSync('git', ['-C', dir, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function stableValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stableValue);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

export function logNativeStep(log: NativeBuildLogger | undefined, message: string): void {
  log?.(message);
}

export function logNativeCommand(
  log: NativeBuildLogger | undefined,
  command: string,
  args: string[],
  cwd: string,
): void {
  if (!log) return;
  log(`$ ${[command, ...args].map(shellQuote).join(' ')}`);
  log(`  cwd: ${cwd}`);
}

export function logNativeOutput(
  log: NativeBuildLogger | undefined,
  stdout: string | Buffer | null | undefined,
  stderr: string | Buffer | null | undefined,
): void {
  if (!log) return;
  const lines = [
    ...String(stdout ?? '').trim().split(/\r?\n/).filter(Boolean),
    ...String(stderr ?? '').trim().split(/\r?\n/).filter(Boolean),
  ];
  for (const line of lines) log(`  ${line}`);
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

export function resolveWorkspacePath(root: string, path: string, label: string): string {
  const absolute = resolve(root, path);
  const normalizedRoot = resolve(root);
  if (absolute !== normalizedRoot && !absolute.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error(`${label} must stay inside the native build workspace.`);
  }
  return absolute;
}

export function findFirstPath(root: string, predicate: (path: string, entry: Dirent) => boolean): string | null {
  if (!existsSync(root)) return null;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (predicate(path, entry)) return path;
    if (entry.isDirectory()) {
      const found = findFirstPath(path, predicate);
      if (found) return found;
    }
  }
  return null;
}

export function patchTextFile(path: string, update: (source: string) => string): void {
  if (!existsSync(path)) return;
  const source = readFileSync(path, 'utf8');
  const next = update(source);
  if (next !== source) writeFileSync(path, next);
}

export function assignmentValue(match: string, key: string, value: string, quote = true): string {
  const separator = match.includes('=') ? ' = ' : ' ';
  return `${key}${separator}${quote ? `"${value}"` : value}`;
}

export function ensureParentDir(path: string): void {
  mkdirSync(path, { recursive: true });
}

export function escapeXml(value: string): string {
  return value.replace(/[<>&"']/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  }[char]!));
}
