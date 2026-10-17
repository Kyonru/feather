import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
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

const DEFAULT_SKILL_CLIENT = 'all';
const SKILL_CLIENT_TARGETS = {
  agents: { project: '.agents/skills', user: join(homedir(), '.agents', 'skills') },
  codex: { project: '.codex/skills', user: join(homedir(), '.codex', 'skills') },
  claude: { project: '.claude/skills', user: join(homedir(), '.claude', 'skills') },
} as const;

type SkillClient = keyof typeof SKILL_CLIENT_TARGETS;
type SkillClientSelection = SkillClient | 'all';
type SkillScope = 'project' | 'user';

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
  client?: string;
  global?: boolean;
  force?: boolean;
  dryRun?: boolean;
  json?: boolean;
};

type SkillRemoveOptions = {
  dir?: string;
  target?: string;
  client?: string;
  global?: boolean;
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
  targetDir: string;
  client: SkillClient | 'custom';
  scope: SkillScope;
  action: 'install' | 'overwrite' | 'skip' | 'remove' | 'missing';
  reason?: string;
};

type SkillTarget = {
  client: SkillClient | 'custom';
  scope: SkillScope;
  targetDir: string;
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

function resolveCustomSkillsTarget(projectDir: string, target?: string): string {
  const resolved = target
    ? isAbsolute(target)
      ? resolve(target)
      : resolve(projectDir, target)
    : resolve(projectDir, SKILL_CLIENT_TARGETS.agents.project);
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
    client: item.client,
    scope: item.scope,
    source: item.source,
    target: item.target,
    reason: item.reason,
    dryRun,
  };
}

function normalizeSkillClient(value?: string): SkillClientSelection {
  const client = (value ?? DEFAULT_SKILL_CLIENT).trim().toLowerCase();
  if (client === 'all' || client === 'agents' || client === 'codex' || client === 'claude') {
    return client;
  }
  fail('Unknown skill client.', {
    details: ['Use one of: agents, codex, claude, all.'],
  });
}

function selectedSkillClients(value?: string): SkillClient[] {
  const client = normalizeSkillClient(value);
  return client === 'all' ? ['agents', 'codex', 'claude'] : [client];
}

function resolveSkillTargets(options: SkillInstallOptions | SkillRemoveOptions): { projectDir: string | null; targets: SkillTarget[] } {
  if (options.target) {
    if (options.client) {
      fail('Use either --target or --client, not both.');
    }
    if (options.global) {
      fail('Use either --target or --global, not both.');
    }
    const projectDir = resolveSkillsProjectDir(options.dir);
    return {
      projectDir,
      targets: [{ client: 'custom', scope: 'project', targetDir: resolveCustomSkillsTarget(projectDir, options.target) }],
    };
  }

  const clients = selectedSkillClients(options.client);
  if (options.global) {
    return {
      projectDir: null,
      targets: clients.map((client) => ({
        client,
        scope: 'user',
        targetDir: SKILL_CLIENT_TARGETS[client].user,
      })),
    };
  }

  const projectDir = resolveSkillsProjectDir(options.dir);
  return {
    projectDir,
    targets: clients.map((client) => ({
      client,
      scope: 'project',
      targetDir: resolveCustomSkillsTarget(projectDir, SKILL_CLIENT_TARGETS[client].project),
    })),
  };
}

function summarizeTargets(targets: SkillTarget[]) {
  return targets.map((target) => ({
    client: target.client,
    scope: target.scope,
    targetDir: target.targetDir,
  }));
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
  const installPaths = Object.values(SKILL_CLIENT_TARGETS).map((target) =>
    skillInstallPath(resolveCustomSkillsTarget(projectDir, target.project), entry),
  );
  const value = {
    skill: summarizeEntry(entry),
    sourcePath: skillSourcePath(entry),
    installPath: installPaths[0],
    installPaths,
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
    ['Install paths', installPaths.join(', ')],
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
  const { projectDir, targets } = resolveSkillTargets(options);
  const dryRun = options.dryRun === true;
  const force = options.force === true;
  const plan: SkillPlanItem[] = targets.flatMap((targetSpec) =>
    entries.map((entry) => {
      const source = skillSourcePath(entry);
      const target = skillInstallPath(targetSpec.targetDir, entry);
      if (projectDir) assertNoSymlinkEscape(projectDir, target, `Skill target for ${entry.id}`);
      if (existsSync(target) && !force) {
        return { id: entry.id, source, target, ...targetSpec, action: 'skip', reason: 'exists' };
      }
      return { id: entry.id, source, target, ...targetSpec, action: existsSync(target) ? 'overwrite' : 'install' };
    }),
  );

  if (!dryRun) {
    for (const target of targets) mkdirSync(target.targetDir, { recursive: true });
    for (const item of plan) {
      if (item.action === 'skip') continue;
      if (existsSync(item.target)) rmSync(item.target, { recursive: true, force: true });
      mkdirSync(dirname(item.target), { recursive: true });
      cpSync(item.source, item.target, { recursive: true, force: true });
    }
  }

  const result = {
    projectDir,
    targetDir: targets[0]?.targetDir ?? null,
    targetDirs: summarizeTargets(targets),
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
    const label = item.client === 'custom' ? item.target : `${item.client}:${item.target}`;
    if (item.action === 'skip') printWarning(`Skipped ${item.id} for ${item.client}: ${item.reason}`);
    else if (dryRun) printLine(`  ${item.action === 'overwrite' ? 'Would overwrite' : 'Would install'} ${style.info(item.id)} -> ${label}`);
    else printSuccess(`${item.action === 'overwrite' ? 'Overwritten' : 'Installed'} ${item.id} for ${item.client}`);
  }
  if (plan.length === 0) printMuted('No skills selected.');
  for (const target of targets) printMuted(`Target (${target.client}, ${target.scope}): ${target.targetDir}`);
  if (!dryRun) printMuted('Start a new Codex/Claude session after installing skills; running agents may not hot-reload new SKILL.md files.');
}

export async function skillsRemoveCommand(ids: string[], options: SkillRemoveOptions = {}): Promise<void> {
  const requested = normalizeIds(ids);
  if (requested.length === 0) fail('Skill id is required.');
  const entries = resolveSkillEntries(requested);
  const { projectDir, targets } = resolveSkillTargets(options);
  const dryRun = options.dryRun === true;
  const plan: SkillPlanItem[] = targets.flatMap((targetSpec) =>
    entries.map((entry) => {
      const target = skillInstallPath(targetSpec.targetDir, entry);
      if (projectDir) assertNoSymlinkEscape(projectDir, target, `Skill target for ${entry.id}`);
      return {
        id: entry.id,
        source: skillSourcePath(entry),
        target,
        ...targetSpec,
        action: existsSync(target) ? 'remove' : 'missing',
        reason: existsSync(target) ? undefined : 'missing',
      };
    }),
  );

  if (!dryRun) {
    for (const item of plan) {
      if (item.action === 'remove') rmSync(item.target, { recursive: true, force: true });
    }
  }

  const result = {
    projectDir,
    targetDir: targets[0]?.targetDir ?? null,
    targetDirs: summarizeTargets(targets),
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
    if (item.action === 'missing') printWarning(`Missing ${item.id} for ${item.client}: ${item.reason}`);
    else if (dryRun) printLine(`  Would remove ${style.info(item.id)} from ${item.client}:${item.target}`);
    else printSuccess(`Removed ${item.id} for ${item.client}`);
  }
  for (const target of targets) printMuted(`Target (${target.client}, ${target.scope}): ${target.targetDir}`);
}
