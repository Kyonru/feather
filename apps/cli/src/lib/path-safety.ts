import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export function isPathInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export function assertPathInside(root: string, target: string, label: string): void {
  if (!isPathInside(root, target)) {
    throw new Error(`${label} must stay inside project root: ${target}`);
  }
}

export function isSafeRelativePath(path: string): boolean {
  const normalized = path.replace(/\\/g, '/');
  return Boolean(normalized) && !isAbsolute(normalized) && !normalized.split('/').some((part) => part === '' || part === '..');
}

export function assertSafeRelativePath(path: string, label: string): void {
  if (!isSafeRelativePath(path)) {
    throw new Error(`${label} must be a relative path inside the project: ${path}`);
  }
}

function nearestExistingPath(path: string): string | null {
  let current = resolve(path);
  while (!existsSync(current)) {
    const next = dirname(current);
    if (next === current) return null;
    current = next;
  }
  return current;
}

export function assertNoSymlinkEscape(root: string, target: string, label: string): void {
  const rootPath = resolve(root);
  const targetPath = resolve(target);
  assertPathInside(rootPath, targetPath, label);
  const projectRoot = realpathSync(rootPath);

  const existing = nearestExistingPath(targetPath);
  if (!existing) return;

  const resolvedExisting = realpathSync(existing);
  if (!isPathInside(projectRoot, resolvedExisting)) {
    throw new Error(`${label} resolves outside project root: ${existing}`);
  }

  if (existsSync(targetPath)) {
    const stat = lstatSync(targetPath);
    if (stat.isSymbolicLink()) {
      const resolvedTarget = realpathSync(targetPath);
      if (!isPathInside(projectRoot, resolvedTarget)) {
        throw new Error(`${label} symlink resolves outside project root: ${targetPath}`);
      }
    }
  }
}

export function assertSafeProjectTarget(root: string, relativePath: string, label: string): string {
  assertSafeRelativePath(relativePath, label);
  const target = join(resolve(root), relativePath);
  assertNoSymlinkEscape(root, target, label);
  return target;
}

function inspectSymlink(projectRoot: string, path: string): { path: string; target: string } | null {
  const target = realpathSync(path);
  return isPathInside(projectRoot, target) ? null : { path, target };
}

function pathComponentEscape(root: string, path: string): { path: string; target: string } | null {
  const rootPath = resolve(root);
  const projectRoot = realpathSync(rootPath);
  const absolute = resolve(path);
  if (!isPathInside(rootPath, absolute)) return null;
  const parts = relative(rootPath, absolute).split(sep).filter(Boolean);
  let current = rootPath;
  for (const part of parts) {
    current = join(current, part);
    if (!existsSync(current)) break;
    const stat = lstatSync(current);
    if (!stat.isSymbolicLink()) continue;
    const escape = inspectSymlink(projectRoot, current);
    if (escape) return escape;
  }
  return null;
}

export function findSymlinkEscapes(root: string, paths: string[]): Array<{ path: string; target: string }> {
  const projectRoot = realpathSync(resolve(root));
  const seen = new Set<string>();
  const escapes: Array<{ path: string; target: string }> = [];

  const visit = (path: string) => {
    const absolute = resolve(path);
    if (seen.has(absolute) || !existsSync(absolute)) return;
    seen.add(absolute);

    const componentEscape = pathComponentEscape(root, absolute);
    if (componentEscape) {
      escapes.push(componentEscape);
      return;
    }

    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      const escape = inspectSymlink(projectRoot, absolute);
      if (escape) escapes.push(escape);
      return;
    }
    if (!stat.isDirectory()) return;

    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      visit(join(absolute, entry.name));
    }
  };

  for (const path of paths) visit(path);

  return escapes;
}
