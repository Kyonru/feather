import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fail } from '../lib/command.js';
import { bundledSkillsRoot, findProjectDir } from '../lib/paths.js';
import { assertNoSymlinkEscape, assertSafeRelativePath } from '../lib/path-safety.js';
import {
  printBlank,
  printHeading,
  printJson,
  printKeyValues,
  printLine,
  printMuted,
  printSuccess,
  printTable,
  printWarning,
  style,
} from '../lib/output.js';

const DEFAULT_SKILLS_TARGET = '.agents/skills';

type SkillCatalog = {
  version?: number;
  skills?: SkillCatalogEntry[];
};

export type SkillCatalogEntry = {
  id: string;
  title: string;
  description: string;
  tags: string[];
  directory: string;
};

type SkillInstallOptions = {
  all?: boolean;
  dir?: string;
  target?: string;
  force?: boolean;
  dryRun?: boolean;
  json?: boolean;
};

type SkillRemoveOptions = {
  dir?: string;
  target?: string;
  dryRun?: boolean;
  json?: boolean;
};

type SkillListOptions = {
  json?: boolean;
};

type SkillInfoOptions = {
  json?: boolean;
};

type SkillPlanItem = {
  id: string;
  source: string;
  target: string;
  action: 'install' | 'overwrite' | 'skip' | 'remove' | 'missing';
  reason?: string;
};

function readSkillsCatalog(): SkillCatalogEntry[] {
  const root = bundledSkillsRoot();
  const path = join(root, 'catalog.json');
  if (!existsSync(path)) {
    fail('Bundled Feather skills catalog was not found.', {
      details: [`Expected: ${path}`],
    });
  }

  let parsed: SkillCatalog;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8')) as SkillCatalog;
  } catch (error) {
    fail('Bundled Feather skills catalog is invalid JSON.', {
      details: [error instanceof Error ? error.message : String(error)],
    });
  }

  if (!Array.isArray(parsed.skills)) {
    fail('Bundled Feather skills catalog is missing a skills array.');
  }

  const ids = new Set<string>();
  const entries = parsed.skills.map((entry) => normalizeCatalogEntry(entry));
  for (const entry of entries) {
    if (ids.has(entry.id)) fail(`Duplicate bundled skill id: ${entry.id}`);
    ids.add(entry.id);
    const source = skillSourcePath(entry);
    if (!existsSync(join(source, 'SKILL.md'))) {
      fail(`Bundled skill is missing SKILL.md: ${entry.id}`, {
        details: [`Expected: ${join(source, 'SKILL.md')}`],
      });
    }
  }
  return entries;
}

function normalizeCatalogEntry(entry: unknown): SkillCatalogEntry {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    fail('Bundled Feather skills catalog contains an invalid entry.');
  }
  const value = entry as Partial<SkillCatalogEntry>;
  if (!value.id || !value.title || !value.description || !value.directory) {
    fail('Bundled Feather skills catalog entry is missing id, title, description, or directory.');
  }
  assertSafeRelativePath(value.directory, `Skill directory for ${value.id}`);
  return {
    id: value.id,
    title: value.title,
    description: value.description,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    directory: value.directory,
  };
}

function skillSourcePath(entry: SkillCatalogEntry): string {
  return join(bundledSkillsRoot(), entry.directory);
}

function catalogById(entries = readSkillsCatalog()): Map<string, SkillCatalogEntry> {
  return new Map(entries.map((entry) => [entry.id, entry]));
}

function resolveSkillEntries(ids: string[], entries = readSkillsCatalog()): SkillCatalogEntry[] {
  const map = catalogById(entries);
  const result: SkillCatalogEntry[] = [];
  for (const id of ids) {
    const entry = map.get(id);
    if (!entry) {
      fail(`Unknown Feather skill: ${id}`, {
        details: [`Available: ${entries.map((skill) => skill.id).join(', ')}`],
      });
    }
    result.push(entry);
  }
  return result;
}

function normalizeIds(values: string[]): string[] {
  return [...new Set(values.flatMap((value) => value.split(',').map((id) => id.trim()).filter(Boolean)))];
}

function resolveSkillsProjectDir(dir?: string): string {
  const start = resolve(dir ?? process.cwd());
  if (!existsSync(start)) {
    fail('Project directory does not exist.', {
      details: [`Path: ${start}`],
    });
  }
  return findProjectDir(start);
}

function resolveSkillsTarget(projectDir: string, target?: string): string {
  const resolved = target
    ? isAbsolute(target)
      ? resolve(target)
      : resolve(projectDir, target)
    : resolve(projectDir, DEFAULT_SKILLS_TARGET);
  assertNoSymlinkEscape(projectDir, resolved, 'Skills install target');
  return resolved;
}

function skillInstallPath(targetDir: string, entry: SkillCatalogEntry): string {
  return join(targetDir, entry.id);
}

function summarizeEntry(entry: SkillCatalogEntry) {
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    tags: entry.tags,
  };
}

function summarizePlanItem(item: SkillPlanItem, dryRun: boolean) {
  return {
    id: item.id,
    action: item.action,
    source: item.source,
    target: item.target,
    reason: item.reason,
    dryRun,
  };
}

export async function skillsListCommand(options: SkillListOptions = {}): Promise<void> {
  const skills = readSkillsCatalog().map(summarizeEntry);
  if (options.json) {
    printJson({ count: skills.length, skills });
    return;
  }
  printHeading(`\nBundled Feather skills (${skills.length})\n`);
  printTable({
    columns: [
      { key: 'id', label: 'ID', color: (value) => style.info(value) },
      { key: 'title', label: 'TITLE' },
      { key: 'tags', label: 'TAGS', color: (value) => style.muted(value) },
    ],
    rows: skills.map((skill) => ({ ...skill, tags: skill.tags.join(', ') })),
  });
  printBlank();
  printMuted('Install with `feather skills install <id>` or `feather skills install --all`.');
}

export async function skillsInfoCommand(id: string, options: SkillInfoOptions = {}): Promise<void> {
  const [entry] = resolveSkillEntries([id]);
  const projectDir = resolveSkillsProjectDir();
  const installPath = skillInstallPath(resolveSkillsTarget(projectDir), entry);
  const value = {
    skill: summarizeEntry(entry),
    sourcePath: skillSourcePath(entry),
    installPath,
  };
  if (options.json) {
    printJson(value);
    return;
  }
  printHeading(`\n${entry.title}\n`);
  printKeyValues([
    ['ID', entry.id],
    ['Description', entry.description],
    ['Tags', entry.tags.join(', ')],
    ['Install path', installPath],
  ]);
}

export async function skillsInstallCommand(ids: string[], options: SkillInstallOptions = {}): Promise<void> {
  const catalog = readSkillsCatalog();
  const requested = normalizeIds(ids);
  if (options.all && requested.length > 0) {
    fail('Use either skill ids or --all, not both.');
  }
  if (!options.all && requested.length === 0) {
    fail('Skill id is required.', {
      details: ['Run `feather skills list` to see available skills, or use `feather skills install --all`.'],
    });
  }

  const entries = options.all ? catalog : resolveSkillEntries(requested, catalog);
  const projectDir = resolveSkillsProjectDir(options.dir);
  const targetDir = resolveSkillsTarget(projectDir, options.target);
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const plan: SkillPlanItem[] = entries.map((entry) => {
    const source = skillSourcePath(entry);
    const target = skillInstallPath(targetDir, entry);
    assertNoSymlinkEscape(projectDir, target, `Skill target for ${entry.id}`);
    if (existsSync(target) && !force) {
      return { id: entry.id, source, target, action: 'skip', reason: 'exists' };
    }
    return { id: entry.id, source, target, action: existsSync(target) ? 'overwrite' : 'install' };
  });

  if (!dryRun) {
    mkdirSync(targetDir, { recursive: true });
    for (const item of plan) {
      if (item.action === 'skip') continue;
      if (existsSync(item.target)) rmSync(item.target, { recursive: true, force: true });
      mkdirSync(dirname(item.target), { recursive: true });
      cpSync(item.source, item.target, { recursive: true, force: true });
    }
  }

  const result = {
    projectDir,
    targetDir,
    dryRun,
    force,
    installed: plan
      .filter((item) => item.action === 'install' || item.action === 'overwrite')
      .map((item) => summarizePlanItem(item, dryRun)),
    skipped: plan.filter((item) => item.action === 'skip').map((item) => summarizePlanItem(item, dryRun)),
    plan,
  };
  if (options.json) {
    printJson(result);
    return;
  }
  printHeading(dryRun ? '\nSkill install plan\n' : '\nSkill install result\n');
  for (const item of plan) {
    if (item.action === 'skip') printWarning(`Skipped ${item.id}: ${item.reason}`);
    else if (dryRun) printLine(`  ${item.action === 'overwrite' ? 'Would overwrite' : 'Would install'} ${style.info(item.id)} -> ${item.target}`);
    else printSuccess(`${item.action === 'overwrite' ? 'Overwritten' : 'Installed'} ${item.id}`);
  }
  if (plan.length === 0) printMuted('No skills selected.');
  printMuted(`Target: ${targetDir}`);
}

export async function skillsRemoveCommand(ids: string[], options: SkillRemoveOptions = {}): Promise<void> {
  const requested = normalizeIds(ids);
  if (requested.length === 0) fail('Skill id is required.');
  const entries = resolveSkillEntries(requested);
  const projectDir = resolveSkillsProjectDir(options.dir);
  const targetDir = resolveSkillsTarget(projectDir, options.target);
  const dryRun = options.dryRun === true;
  const plan: SkillPlanItem[] = entries.map((entry) => {
    const target = skillInstallPath(targetDir, entry);
    assertNoSymlinkEscape(projectDir, target, `Skill target for ${entry.id}`);
    return {
      id: entry.id,
      source: skillSourcePath(entry),
      target,
      action: existsSync(target) ? 'remove' : 'missing',
      reason: existsSync(target) ? undefined : 'missing',
    };
  });

  if (!dryRun) {
    for (const item of plan) {
      if (item.action === 'remove') rmSync(item.target, { recursive: true, force: true });
    }
  }

  const result = {
    projectDir,
    targetDir,
    dryRun,
    removed: plan.filter((item) => item.action === 'remove').map((item) => summarizePlanItem(item, dryRun)),
    skipped: plan.filter((item) => item.action === 'missing').map((item) => summarizePlanItem(item, dryRun)),
    plan,
  };
  if (options.json) {
    printJson(result);
    return;
  }
  printHeading(dryRun ? '\nSkill remove plan\n' : '\nSkill remove result\n');
  for (const item of plan) {
    if (item.action === 'missing') printWarning(`Missing ${item.id}: ${item.reason}`);
    else if (dryRun) printLine(`  Would remove ${style.info(item.id)} from ${item.target}`);
    else printSuccess(`Removed ${item.id}`);
  }
  printMuted(`Target: ${targetDir}`);
}
