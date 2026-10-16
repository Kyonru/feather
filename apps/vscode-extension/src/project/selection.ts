import { existsSync, statSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';

// Which folder is "the project" is decided here, without `vscode`, so the
// multi-root rules are unit tested. The old rule — `feather.projectDir`, else
// the first workspace folder — made the answer depend on folder order.

export type ProjectSource = 'setting' | 'remembered' | 'only-candidate' | 'only-folder';

export type ProjectSelection =
  | { kind: 'resolved'; root: string; name: string; source: ProjectSource }
  | { kind: 'no-workspace' }
  /** Several folders could be the project and none was chosen yet. */
  | { kind: 'needs-selection'; candidates: string[] }
  /** `feather.projectDir` is set but unusable. It is never silently ignored. */
  | { kind: 'invalid-setting'; configured: string; path: string; reason: string }
  /** `feather.projectDir` points outside every workspace folder and was not accepted. */
  | { kind: 'outside-workspace'; configured: string; path: string };

export type SelectionInput = {
  configured?: string;
  workspaceRoots: string[];
  /** Folders under the workspace that contain `main.lua`. */
  candidates: string[];
  /** The folder chosen earlier in this workspace, if any. */
  remembered?: string;
  /** Outside-workspace paths the user explicitly accepted. */
  acceptedOutside?: readonly string[];
  isDirectory?: (path: string) => boolean;
};

export function isInside(root: string, target: string): boolean {
  const rel = relative(resolve(root), resolve(target));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function defaultIsDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * A relative `feather.projectDir` is relative to the workspace, not to the
 * extension host's working directory (which is wherever VS Code was launched).
 * In a multi-root workspace the first folder that contains it wins.
 */
export function resolveConfiguredDir(configured: string, workspaceRoots: string[], isDirectory = defaultIsDirectory): string {
  if (isAbsolute(configured)) return resolve(configured);
  for (const root of workspaceRoots) {
    const candidate = resolve(root, configured);
    if (isDirectory(candidate)) return candidate;
  }
  return resolve(workspaceRoots[0] ?? '.', configured);
}

export function selectProject(input: SelectionInput): ProjectSelection {
  const isDirectory = input.isDirectory ?? defaultIsDirectory;
  const configured = input.configured?.trim();

  if (configured) {
    const path = resolveConfiguredDir(configured, input.workspaceRoots, isDirectory);
    if (!isDirectory(path)) {
      return { kind: 'invalid-setting', configured, path, reason: 'the folder does not exist' };
    }
    const inside = input.workspaceRoots.some((root) => isInside(root, path));
    if (!inside && !(input.acceptedOutside ?? []).some((accepted) => resolve(accepted) === path)) {
      return { kind: 'outside-workspace', configured, path };
    }
    return { kind: 'resolved', root: path, name: basename(path), source: 'setting' };
  }

  if (input.workspaceRoots.length === 0) return { kind: 'no-workspace' };

  const candidates = [...new Set(input.candidates.map((candidate) => resolve(candidate)))];
  const remembered = input.remembered ? resolve(input.remembered) : undefined;
  if (remembered && isDirectory(remembered) && input.workspaceRoots.some((root) => isInside(root, remembered))) {
    return { kind: 'resolved', root: remembered, name: basename(remembered), source: 'remembered' };
  }

  if (candidates.length === 1) {
    return { kind: 'resolved', root: candidates[0], name: basename(candidates[0]), source: 'only-candidate' };
  }
  if (candidates.length === 0 && input.workspaceRoots.length === 1) {
    // One folder and no main.lua anywhere: show that folder's state (it will
    // say main.lua is missing) instead of asking a question with one answer.
    const root = resolve(input.workspaceRoots[0]);
    return { kind: 'resolved', root, name: basename(root), source: 'only-folder' };
  }
  return {
    kind: 'needs-selection',
    candidates: candidates.length > 0 ? candidates : input.workspaceRoots.map((root) => resolve(root)),
  };
}

/**
 * Find folders that look like LÖVE projects: each workspace folder itself, and
 * its direct children, when they contain `main.lua`. Shallow on purpose — a
 * deep scan would find vendored templates and example games inside projects.
 */
export function discoverCandidates(
  workspaceRoots: string[],
  listDirectories: (dir: string) => string[],
  hasMain: (dir: string) => boolean = (dir) => existsSync(resolve(dir, 'main.lua')),
): string[] {
  const found: string[] = [];
  for (const root of workspaceRoots) {
    if (hasMain(root)) {
      found.push(resolve(root));
      continue;
    }
    for (const child of listDirectories(root)) {
      if (hasMain(child)) found.push(resolve(child));
    }
  }
  return [...new Set(found)];
}
