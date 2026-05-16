import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  type Dirent,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { copyDirectory } from './files.js';

export type NativeWorkspace = {
  root: string;
  dir: string;
  cleanup: () => void;
};

export function createNativeWorkspace(prefix: string, templateDir: string, dirname: string): NativeWorkspace {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const dir = join(root, dirname);
  copyDirectory(templateDir, dir);
  return {
    root,
    dir,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
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
