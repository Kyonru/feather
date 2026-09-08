import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, renameSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, resolve } from 'node:path';
import { fail } from '../lib/command.js';
import { buildVendorAddCommand, type BuildVendorCommandOptions } from './build-vendor.js';
import { fetchLatestReleaseTag as fetchLatestGitHubReleaseTag } from '../lib/github.js';
import { isPathInside, isSafeRelativePath, assertSafeProjectTarget } from '../lib/path-safety.js';
import { loadRegistry } from '../lib/package/registry.js';
import {
  printBanner,
  printBlank,
  printHeading,
  printKeyValues,
  printMuted,
  printStatus,
  printWarning,
  style,
} from '../lib/output.js';
import { initCommand, type InitOptions } from './init.js';
import { packageInstallCommand, type PackageInstallOptions } from './package/index.js';
import { pluginInstallCommand } from './plugin/index.js';
import type { PluginSourceOptions } from './plugin/shared.js';
import { chooseCreateOptions } from '../ui/create-workflow.js';

export const DEFAULT_CREATE_TEMPLATE = 'Oval-Tutu/bootstrap-love2d-project';
export const FEATHER_VSCODE_EXTENSION_ID = 'SolenodonteLabs.feather-cli-vscode';

export type CreateCommandOptions = {
  template?: string;
  ref?: string;
  main?: boolean;
  yes?: boolean;
  plugins?: string[];
  packages?: string[];
  vendorTargets?: string[];
  skipPlugins?: boolean;
  skipPackages?: boolean;
  skipVendors?: boolean;
};

export type ResolvedCreateRef = {
  ref: string;
  source: 'latest-release' | 'main' | 'explicit';
};

export type ProjectIdentity = {
  slug: string;
  title: string;
  productId: string;
};

export type ExternalCommandResult = {
  stdout: string;
  stderr: string;
};

export type ExternalCommandRunner = (
  command: string,
  args: string[],
  options?: { cwd?: string },
) => Promise<ExternalCommandResult>;

export type CreateCommandDeps = {
  runExternalCommand?: ExternalCommandRunner;
  fetchLatestReleaseTag?: (repo: string) => Promise<string>;
  init?: (dir: string, opts: InitOptions) => Promise<void>;
  installPlugins?: (pluginIds: string | string[], opts: PluginSourceOptions) => Promise<void>;
  installPackages?: (names: string[], opts: PackageInstallOptions) => Promise<void>;
  addVendors?: (targetValues: string[], opts: BuildVendorCommandOptions) => Promise<void>;
};

export interface TemplatePipeline {
  template: string;
  cleanTemplate(context: CreatePipelineContext): Promise<void>;
  configureProject(context: CreatePipelineContext): Promise<void>;
}

export type CreatePipelineContext = {
  projectName: string;
  projectDir: string;
  gameDir: string;
  template: string;
  repoUrl: string;
  resolvedRef: ResolvedCreateRef;
  identity: ProjectIdentity;
  options: Required<Pick<CreateCommandOptions, 'plugins' | 'packages' | 'vendorTargets'>>;
  deps: Required<CreateCommandDeps>;
};

class ExternalCommandError extends Error {
  stdout: string;
  stderr: string;
  exitCode?: number | string;

  constructor(command: string, args: string[], stdout: string, stderr: string, exitCode?: number | string) {
    super(`${command} ${args.join(' ')} failed${exitCode === undefined ? '' : ` (${exitCode})`}`);
    this.name = 'ExternalCommandError';
    this.stdout = stdout;
    this.stderr = stderr;
    this.exitCode = exitCode;
  }
}

export async function runExternalCommand(
  command: string,
  args: string[],
  options: { cwd?: string } = {},
): Promise<ExternalCommandResult> {
  return new Promise((resolveCommand, rejectCommand) => {
    execFile(
      command,
      args,
      { cwd: options.cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const code =
            typeof err === 'object' && err !== null && 'code' in err
              ? (err as { code?: number | string }).code
              : undefined;
          rejectCommand(new ExternalCommandError(command, args, stdout, stderr, code));
          return;
        }
        resolveCommand({ stdout, stderr });
      },
    );
  });
}

function defaultDeps(): Required<CreateCommandDeps> {
  return {
    runExternalCommand,
    fetchLatestReleaseTag: fetchLatestGitHubReleaseTag,
    init: initCommand,
    installPlugins: pluginInstallCommand,
    installPackages: packageInstallCommand,
    addVendors: buildVendorAddCommand,
  };
}

export function deriveProjectIdentity(projectName: string): ProjectIdentity {
  const slug =
    projectName
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'game';
  const title =
    slug
      .split('-')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || 'Game';
  const productSlug = slug.replace(/[^a-z0-9]+/g, '') || 'game';
  return {
    slug,
    title,
    productId: `com.feather.${productSlug}`,
  };
}

export function resolveCreateTarget(projectName: string, cwd = process.cwd()): string {
  if (!projectName.trim()) {
    fail('Project name is required.');
  }
  if (projectName !== basename(projectName) || projectName.includes('/') || projectName.includes('\\')) {
    fail('Project name must be a single new directory name, not a path.');
  }
  if (isAbsolute(projectName) || projectName === '.' || projectName === '..' || !isSafeRelativePath(projectName)) {
    fail(`Unsafe project name: ${projectName}`);
  }

  const target = resolve(cwd, projectName);
  if (!isPathInside(cwd, target) || target === resolve(cwd)) {
    fail(`Project target must stay inside the current directory: ${projectName}`);
  }
  if (existsSync(target) && readdirSync(target).length > 0) {
    fail(`Target directory already exists and is not empty: ${target}`);
  }
  return target;
}

export function normalizeCreateTemplate(template = DEFAULT_CREATE_TEMPLATE): string {
  if (template.toLowerCase() !== DEFAULT_CREATE_TEMPLATE.toLowerCase()) {
    fail(`Unsupported template: ${template}`, {
      details: [`V1 supports only ${DEFAULT_CREATE_TEMPLATE}.`],
    });
  }
  return DEFAULT_CREATE_TEMPLATE;
}

export async function resolveCreateRef(
  template: string,
  opts: Pick<CreateCommandOptions, 'main' | 'ref'>,
  fetchLatestReleaseTag: (repo: string) => Promise<string>,
): Promise<ResolvedCreateRef> {
  if (opts.main && opts.ref) {
    fail('Use either --main or --ref <tag-or-branch>, not both.');
  }
  if (opts.ref?.trim()) {
    return { ref: opts.ref.trim(), source: 'explicit' };
  }
  if (opts.main) {
    return { ref: 'main', source: 'main' };
  }

  try {
    return { ref: await fetchLatestReleaseTag(template), source: 'latest-release' };
  } catch (err) {
    fail(`Could not resolve the latest release for ${template}.`, {
      details: [(err as Error).message, 'Retry with --main or --ref <tag>.'],
    });
  }
}

function gitHubRepoUrl(template: string): string {
  return `https://github.com/${template}.git`;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function runGit(
  context: CreatePipelineContext,
  args: string[],
  cwd = context.projectDir,
): Promise<ExternalCommandResult> {
  return context.deps.runExternalCommand('git', args, { cwd });
}

function isGitIdentityError(err: unknown): boolean {
  const text =
    err instanceof ExternalCommandError
      ? `${err.stdout}\n${err.stderr}\n${err.message}`
      : err instanceof Error
        ? err.message
        : String(err);
  return /author identity unknown|please tell me who you are|unable to auto-detect email address/i.test(text);
}

function printCommitRecovery(context: CreatePipelineContext, message: string): void {
  printWarning(`Git commit skipped because git user identity is not configured: ${message}`);
  printMuted('Configure git identity and create the commit manually:');
  printMuted(`  cd ${shellQuote(context.projectName)}`);
  printMuted('  git config user.name "Your Name"');
  printMuted('  git config user.email "you@example.com"');
  printMuted('  git add .');
  printMuted(`  git commit -m ${shellQuote(message)}`);
}

async function commitAll(context: CreatePipelineContext, message: string): Promise<void> {
  await runGit(context, ['add', '.']);
  try {
    await runGit(context, ['commit', '-m', message]);
  } catch (err) {
    if (isGitIdentityError(err)) {
      printCommitRecovery(context, message);
      return;
    }
    throw err;
  }
}

function phase(label: string, detail?: string): void {
  printStatus('info', label);
  if (detail) printMuted(`  ${detail}`);
}

async function runPhase<T>(label: string, detail: string | undefined, action: () => Promise<T>): Promise<T> {
  phase(label, detail);
  const result = await action();
  printStatus('success', label);
  return result;
}

function safeTarget(projectDir: string, relativePath: string, label: string): string {
  return assertSafeProjectTarget(projectDir, relativePath, label);
}

function escapeEnvValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function rewriteEnvFile(path: string, values: Record<string, string>): void {
  const existing = existsSync(path) ? readFileSync(path, 'utf8').split(/\r?\n/) : [];
  const seen = new Set<string>();
  const lines = existing.map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match || values[match[1]] === undefined) return line;
    const key = match[1];
    seen.add(key);
    return `${key}="${escapeEnvValue(values[key]!)}"`;
  });

  for (const [key, value] of Object.entries(values)) {
    if (!seen.has(key)) lines.push(`${key}="${escapeEnvValue(value)}"`);
  }

  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  writeFileSync(path, `${lines.join('\n')}\n`);
}

function replaceTextIfExists(path: string, replacements: Array<[RegExp, string]>): void {
  if (!existsSync(path)) return;
  let text = readFileSync(path, 'utf8');
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  writeFileSync(path, text);
}

function mergeVsCodeRecommendations(projectDir: string): void {
  const path = safeTarget(projectDir, '.vscode/extensions.json', 'VS Code recommendations');
  mkdirSync(resolve(projectDir, '.vscode'), { recursive: true });
  let data: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  const recommendations = Array.isArray(data.recommendations)
    ? data.recommendations.filter((item): item is string => typeof item === 'string')
    : [];
  if (!recommendations.includes(FEATHER_VSCODE_EXTENSION_ID)) {
    recommendations.push(FEATHER_VSCODE_EXTENSION_ID);
  }
  writeFileSync(path, `${JSON.stringify({ ...data, recommendations }, null, 2)}\n`);
}

function writeMakefile(projectDir: string): void {
  const path = safeTarget(projectDir, 'Makefile', 'Makefile');
  writeFileSync(
    path,
    `run:
\tfeather run game

doctor:
\tfeather doctor game

plugins:
\tfeather plugin list game

packages:
\tfeather package list --installed --dir game

vendor-list:
\tfeather build vendor list --dir game

.PHONY: run doctor plugins packages vendor-list
`,
  );
}

function mergePackageJsonScripts(projectDir: string): void {
  const path = safeTarget(projectDir, 'package.json', 'package.json');
  if (!existsSync(path)) return;
  const data = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const scripts =
    typeof data.scripts === 'object' && data.scripts !== null && !Array.isArray(data.scripts)
      ? (data.scripts as Record<string, unknown>)
      : {};
  const nextScripts = {
    ...scripts,
    'feather:run': scripts['feather:run'] ?? 'feather run game',
    'feather:doctor': scripts['feather:doctor'] ?? 'feather doctor game',
    'feather:plugins': scripts['feather:plugins'] ?? 'feather plugin list game',
    'feather:packages': scripts['feather:packages'] ?? 'feather package list --installed --dir game',
    'feather:vendor:list': scripts['feather:vendor:list'] ?? 'feather build vendor list --dir game',
  };
  writeFileSync(path, `${JSON.stringify({ ...data, scripts: nextScripts }, null, 2)}\n`);
}

async function cleanOvalTutuTemplate(context: CreatePipelineContext): Promise<void> {
  const mainTemplatePath = safeTarget(context.projectDir, 'game/main.template.lua', 'Template main.lua');
  const mainPath = safeTarget(context.projectDir, 'game/main.lua', 'Game main.lua');
  if (existsSync(mainTemplatePath)) {
    rmSync(mainPath, { force: true });
    renameSync(mainTemplatePath, mainPath);
  }
  rmSync(safeTarget(context.projectDir, 'game/eyes', 'Sample eyes directory'), { recursive: true, force: true });

  rewriteEnvFile(safeTarget(context.projectDir, 'game/product.env', 'Product config'), {
    PRODUCT_NAME: context.identity.title,
    PRODUCT_ID: context.identity.productId,
    PRODUCT_DESC: 'A Love2D game made with Feather',
    PRODUCT_COPYRIGHT: `Copyright (c) ${new Date().getFullYear()} ${context.identity.title}`,
    PRODUCT_COMPANY: context.identity.title,
    PRODUCT_WEBSITE: 'https://kyonru.github.io/feather',
    PRODUCT_UUID: randomUUID(),
  });

  const replacements: Array<[RegExp, string]> = [
    [/ovaltutu/g, context.identity.slug],
    [/Oval Tutu/g, context.identity.title],
    [/Template/g, context.identity.title],
    [/template/g, context.identity.slug],
  ];
  replaceTextIfExists(safeTarget(context.projectDir, 'Workspace.code-workspace', 'Workspace settings'), replacements);
  replaceTextIfExists(safeTarget(context.projectDir, '.vscode/settings.json', 'VS Code settings'), replacements);
  replaceTextIfExists(safeTarget(context.projectDir, '.vscode/launch.json', 'VS Code launch settings'), replacements);
  replaceTextIfExists(safeTarget(context.projectDir, '.vscode/tasks.json', 'VS Code tasks'), replacements);
  mergeVsCodeRecommendations(context.projectDir);
}

async function configureOvalTutuProject(context: CreatePipelineContext): Promise<void> {
  await context.deps.init(context.gameDir, {
    mode: 'cli',
    yes: true,
    sessionName: context.identity.title,
  });
  writeMakefile(context.projectDir);
  mergePackageJsonScripts(context.projectDir);
}

export const ovalTutuPipeline: TemplatePipeline = {
  template: DEFAULT_CREATE_TEMPLATE,
  cleanTemplate: cleanOvalTutuTemplate,
  configureProject: configureOvalTutuProject,
};

function resolvePipeline(template: string): TemplatePipeline {
  if (template === DEFAULT_CREATE_TEMPLATE) return ovalTutuPipeline;
  fail(`Unsupported template: ${template}`);
}

function mergeExplicitAndInteractive(cliValues: string[] | undefined, interactiveValues: string[]): string[] {
  return [...new Set([...(cliValues ?? []), ...interactiveValues].map((item) => item.trim()).filter(Boolean))];
}

async function maybeChooseInteractiveOptions(
  opts: CreateCommandOptions,
): Promise<Required<Pick<CreateCommandOptions, 'plugins' | 'packages' | 'vendorTargets'>>> {
  if (
    opts.yes ||
    !process.stdin.isTTY ||
    !process.stdout.isTTY ||
    (opts.skipPlugins && opts.skipPackages && opts.skipVendors)
  ) {
    return {
      plugins: opts.plugins ?? [],
      packages: opts.packages ?? [],
      vendorTargets: opts.vendorTargets ?? [],
    };
  }

  const registry = await loadRegistry({ offline: true });
  const selected = await chooseCreateOptions({
    registry,
    skipPlugins: opts.skipPlugins,
    skipPackages: opts.skipPackages,
    skipVendors: opts.skipVendors,
  });

  return {
    plugins: opts.skipPlugins ? [] : mergeExplicitAndInteractive(opts.plugins, selected.plugins),
    packages: opts.skipPackages ? [] : mergeExplicitAndInteractive(opts.packages, selected.packages),
    vendorTargets: opts.skipVendors ? [] : mergeExplicitAndInteractive(opts.vendorTargets, selected.vendorTargets),
  };
}

function validateSkipConflicts(opts: CreateCommandOptions): void {
  if (opts.skipPlugins && opts.plugins && opts.plugins.length > 0)
    fail('Use either --plugins or --skip-plugins, not both.');
  if (opts.skipPackages && opts.packages && opts.packages.length > 0)
    fail('Use either --packages or --skip-packages, not both.');
  if (opts.skipVendors && opts.vendorTargets && opts.vendorTargets.length > 0)
    fail('Use either --vendor-targets or --skip-vendors, not both.');
}

async function runOptionalStep(label: string, recoveryCommand: string, action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (err) {
    printWarning(`${label} failed: ${(err as Error).message}`);
    printMuted('The project is still usable. Retry with:');
    printMuted(`  ${recoveryCommand}`);
  }
}

async function runOptionalSetup(context: CreatePipelineContext): Promise<void> {
  if (context.options.plugins.length > 0) {
    await runOptionalStep(
      'Plugin setup',
      `feather plugin install ${context.options.plugins.join(' ')} --dir game --managed cli`,
      () =>
        context.deps.installPlugins(context.options.plugins, {
          dir: context.gameDir,
          installDir: 'feather',
          managed: 'cli',
        }),
    );
  }

  if (context.options.packages.length > 0) {
    await runOptionalStep(
      'Package setup',
      `feather package install ${context.options.packages.join(' ')} --dir game`,
      () =>
        context.deps.installPackages(context.options.packages, {
          dir: context.gameDir,
          yes: true,
        }),
    );
  }

  if (context.options.vendorTargets.length > 0) {
    await runOptionalStep(
      'Vendor setup',
      `feather build vendor add ${context.options.vendorTargets.join(' ')} --dir game`,
      () =>
        context.deps.addVendors(context.options.vendorTargets, {
          dir: context.gameDir,
        }),
    );
  }
}

function printNextSteps(context: CreatePipelineContext): void {
  printBlank();
  printHeading('Next steps');
  printMuted(`  cd ${shellQuote(context.projectName)}`);
  printMuted('  make run');
  printMuted('  code Workspace.code-workspace');
  if (context.options.plugins.length === 0) {
    printMuted('  feather plugin list game');
  }
  if (context.options.packages.length === 0) {
    printMuted('  feather package list --dir game');
  }
  if (context.options.vendorTargets.length === 0) {
    printMuted('  feather build vendor list --dir game');
  }
}

export async function runCreatePipeline(
  projectName: string,
  opts: CreateCommandOptions = {},
  depsInput: CreateCommandDeps = {},
): Promise<void> {
  printBanner();
  validateSkipConflicts(opts);
  const deps = { ...defaultDeps(), ...depsInput };
  const template = normalizeCreateTemplate(opts.template);
  const pipeline = resolvePipeline(template);
  const projectDir = resolveCreateTarget(projectName);
  const identity = deriveProjectIdentity(projectName);
  const options = await maybeChooseInteractiveOptions(opts);
  const resolvedRef = await runPhase('Resolve template ref', template, () =>
    resolveCreateRef(template, opts, deps.fetchLatestReleaseTag),
  );
  const repoUrl = gitHubRepoUrl(template);
  const context: CreatePipelineContext = {
    projectName,
    projectDir,
    gameDir: resolve(projectDir, 'game'),
    template,
    repoUrl,
    resolvedRef,
    identity,
    options,
    deps,
  };

  await runPhase('Clone template', `${repoUrl} @ ${resolvedRef.ref}`, () =>
    deps.runExternalCommand('git', ['clone', '--depth=1', '--branch', resolvedRef.ref, repoUrl, projectDir]),
  );
  await runPhase('Clean template', 'Remove sample content and apply project identity.', () =>
    pipeline.cleanTemplate(context),
  );
  await runPhase('Reset git repository', 'Initialize a fresh project history.', async () => {
    rmSync(safeTarget(projectDir, '.git', 'Git metadata'), { recursive: true, force: true });
    await runGit(context, ['init']);
  });
  await runPhase('Create template commit', 'Commit cleaned template files.', () =>
    commitAll(context, 'feather: init template'),
  );
  await runPhase('Configure Feather', 'Initialize CLI-managed Feather project files.', () =>
    pipeline.configureProject(context),
  );
  await runPhase('Run optional setup', 'Plugins, packages, and vendors selected for this project.', () =>
    runOptionalSetup(context),
  );
  await runPhase('Create Feather commit', 'Commit Feather configuration and helpers.', () =>
    commitAll(context, 'feather: configure feather'),
  );

  printBlank();
  printStatus('success', `Created ${style.heading(projectName)} from ${template}@${resolvedRef.ref}`);
  printKeyValues([
    ['Project', projectDir],
    ['Game', context.gameDir],
    ['Template', template],
    ['Ref', `${resolvedRef.ref} (${resolvedRef.source})`],
  ]);
  printNextSteps(context);
}

export async function createCommand(projectName: string, opts: CreateCommandOptions = {}): Promise<void> {
  await runCreatePipeline(projectName, opts);
}
