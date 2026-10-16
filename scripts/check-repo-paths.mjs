/**
 * Fail when guidance or metadata describes a repository that no longer exists.
 *
 * v4 moved `cli/`, `vscode-extension/`, `docs/`, `src/`, `src-tauri/` and
 * `src-lua/` under `apps/` and `packages/`. Code that used the old paths broke
 * loudly; prose did not. Agent skills kept sending readers to files that were
 * gone, AGENTS.md named generated files at their old location, and package
 * metadata linked npm and the Marketplace to directories that did not exist.
 *
 * Three checks:
 *   1. Instruction files (AGENTS, CONTRIBUTING, README, skills) never start a
 *      path at a removed root.
 *   2. Every backticked repository path in those files resolves.
 *   3. Workspace metadata agrees with itself: `pnpm-workspace.yaml` is the only
 *      inventory, and each package's `repository.directory` is its real path.
 *
 * Historical records (CHANGELOG.md and inspector-improvements/) are not
 * checked: rewriting them would falsify what was true when they were written.
 *
 * Run: node scripts/check-repo-paths.mjs
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);

const REMOVED_ROOTS = ['cli', 'vscode-extension', 'docs', 'src', 'src-tauri', 'src-lua'];
const PATH_ROOTS = ['apps', 'packages', 'scripts', 'catalog', 'skills', '.github', '.husky'];

const instructionFiles = tracked.filter(
  (file) =>
    ['AGENTS.md', 'CONTRIBUTING.md', 'README.md'].includes(file) ||
    (file.startsWith('skills/') && file.endsWith('.md')),
);

const failures = [];
const fail = (file, line, message) => failures.push(`${file}${line ? `:${line}` : ''}: ${message}`);

// A path token begins after start-of-line, whitespace, or an opening quote,
// backtick, parenthesis or bracket — never after a word character, `/`, `.`
// or `-`, so `apps/cli/` and `../cli` are not mistaken for the removed root.
const removedRoot = new RegExp(`(?:^|[\\s\`'"(\\[])((?:${REMOVED_ROOTS.join('|')})/[\\w./-]*)`, 'g');
const backticked = /`([^`\s]+)`/g;

for (const file of instructionFiles) {
  const lines = readFileSync(join(root, file), 'utf8').split('\n');
  // Directory-tree diagrams (```txt / ```text fences) show nesting, so a bare
  // `cli/` under an `apps/` line is correct there. Shell fences are checked.
  let inTree = false;
  lines.forEach((text, index) => {
    const fence = text.match(/^\s*```(\w*)/);
    if (fence) {
      inTree = !inTree && ['txt', 'text'].includes(fence[1]);
      return;
    }
    if (inTree) return;
    for (const match of text.matchAll(removedRoot)) {
      fail(file, index + 1, `\`${match[1]}\` starts at a removed root; v4 moved it under apps/ or packages/`);
    }
    for (const match of text.matchAll(backticked)) {
      const candidate = match[1].replace(/[),.:;]+$/, '');
      const first = candidate.split('/')[0];
      if (!PATH_ROOTS.includes(first) || !candidate.includes('/')) continue;
      if (/[*{}<>$]/.test(candidate)) continue; // globs and placeholders
      const path = candidate.split(':')[0].split('#')[0];
      if (!existsSync(join(root, path))) fail(file, index + 1, `\`${path}\` does not exist`);
    }
  });
}

const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if ('workspaces' in rootManifest) {
  fail('package.json', 0, '`workspaces` duplicates pnpm-workspace.yaml, which is the only workspace inventory');
}

const workspaceDirs = readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8')
  .split('\n')
  .map((line) => line.match(/^\s+-\s+(\S+)\s*$/)?.[1])
  .filter((entry) => entry && !entry.includes("'"));
for (const dir of workspaceDirs) {
  const manifestPath = join(root, dir, 'package.json');
  if (!existsSync(manifestPath)) {
    fail('pnpm-workspace.yaml', 0, `${dir} is listed but has no package.json`);
    continue;
  }
  const declared = JSON.parse(readFileSync(manifestPath, 'utf8')).repository?.directory;
  if (declared !== undefined && declared !== dir) {
    fail(relative(root, manifestPath), 0, `repository.directory is "${declared}", expected "${dir}"`);
  }
}

for (const link of tracked.filter((file) => file.startsWith('apps/docs/'))) {
  const full = join(root, link);
  if (lstatSync(full, { throwIfNoEntry: false })?.isSymbolicLink() && !existsSync(full)) {
    fail(link, 0, 'docs symlink does not resolve');
  }
}

if (failures.length > 0) {
  console.error(`[feather] ${failures.length} stale repository path(s):\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`[feather] Repository paths OK — ${instructionFiles.length} instruction files, ${workspaceDirs.length} workspace packages.`);
