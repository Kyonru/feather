import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, renameSync, writeFileSync } from 'node:fs';
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
import { chooseCreateAppId, chooseCreateLanguage, chooseCreateOptions, type CreateLanguage } from '../ui/create-workflow.js';

export const DEFAULT_CREATE_TEMPLATE = 'Oval-Tutu/bootstrap-love2d-project';
export const OVAL_TUTU_CREATE_TEMPLATE = DEFAULT_CREATE_TEMPLATE;
export const BUILT_IN_CREATE_TEMPLATE = 'feather';
export const FEATHER_VSCODE_EXTENSION_ID = 'SolenodonteLabs.feather-cli-vscode';
export const TUA_VSCODE_EXTENSION_ID = 'SolenodonteLabs.tua';

export type CreateCommandOptions = {
  template?: string;
  language?: string;
  appId?: string;
  allowInsecureConnection?: boolean;
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
  source: 'built-in' | 'latest-release' | 'main' | 'explicit';
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
  sourceDir: string;
  template: string;
  repoUrl: string;
  resolvedRef: ResolvedCreateRef;
  identity: ProjectIdentity;
  language: CreateLanguage;
  appId?: string;
  allowInsecureConnection: boolean;
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
  if (template.toLowerCase() === OVAL_TUTU_CREATE_TEMPLATE.toLowerCase()) return OVAL_TUTU_CREATE_TEMPLATE;
  if (template.toLowerCase() === BUILT_IN_CREATE_TEMPLATE) return BUILT_IN_CREATE_TEMPLATE;
  fail(`Unsupported template: ${template}`, {
    details: [`Choose ${OVAL_TUTU_CREATE_TEMPLATE} or ${BUILT_IN_CREATE_TEMPLATE}.`],
  });
}

export function normalizeCreateLanguage(language = 'lua'): CreateLanguage {
  const normalized = language.trim().toLowerCase();
  if (normalized === 'lua' || normalized === 'tua') return normalized;
  fail(`Unsupported project language: ${language}`, { details: ['Choose lua or tua.'] });
}

export async function resolveCreateRef(
  template: string,
  opts: Pick<CreateCommandOptions, 'main' | 'ref'>,
  fetchLatestReleaseTag: (repo: string) => Promise<string>,
): Promise<ResolvedCreateRef> {
  if (template === BUILT_IN_CREATE_TEMPLATE) {
    if (opts.main || opts.ref) fail('--main and --ref can only be used with a repository template.');
    return { ref: 'bundled', source: 'built-in' };
  }
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

function printCommitRecovery(context: CreatePipelineContext, message: string, reason: string, identityMissing: boolean): void {
  printWarning(`Git commit skipped: ${reason}`);
  printMuted('Create the commit manually after fixing your Git configuration:');
  printMuted(`  cd ${shellQuote(context.projectName)}`);
  if (identityMissing) {
    printMuted('  git config user.name "Your Name"');
    printMuted('  git config user.email "you@example.com"');
  }
  printMuted('  git add .');
  printMuted(`  git commit -m ${shellQuote(message)}`);
}

async function commitAll(context: CreatePipelineContext, message: string): Promise<boolean> {
  await runGit(context, ['add', '.']);
  try {
    await runGit(context, ['commit', '-m', message]);
    return true;
  } catch (err) {
    if (err instanceof ExternalCommandError) {
      const detail = err.stderr.trim().split(/\r?\n/).filter(Boolean).at(-1);
      const identityMissing = isGitIdentityError(err);
      const reason = identityMissing
        ? 'git user identity is not configured'
        : detail || err.message;
      printCommitRecovery(context, message, reason, identityMissing);
      return false;
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

function mergeVsCodeRecommendations(projectDir: string, additions = [FEATHER_VSCODE_EXTENSION_ID]): void {
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
  for (const extension of additions) {
    if (!recommendations.includes(extension)) recommendations.push(extension);
  }
  writeFileSync(path, `${JSON.stringify({ ...data, recommendations }, null, 2)}\n`);
}

function writeMakefile(
  projectDir: string,
  language: CreateLanguage = 'lua',
  runtimeDir = language === 'tua' ? 'build' : 'game',
  vendorDir = '.',
): void {
  const path = safeTarget(projectDir, 'Makefile', 'Makefile');
  const gameDir = runtimeDir;
  const sourceDir = language === 'tua' ? 'src' : 'game';
  const compile = language === 'tua' ? 'compile:\n\ttua build\n\ncheck:\n\ttua check\n\n' : '';
  const runPrerequisite = language === 'tua' ? ' compile' : '';
  writeFileSync(
    path,
    `.DEFAULT_GOAL := help

help:
\t@echo "${language === 'tua' ? 'TUA + ' : ''}Feather project commands"
\t@echo "  make run      Build if needed and launch with Feather"
\t@echo "  make doctor   Check the generated LOVE project"
${language === 'tua' ? '\t@echo "  make check    Type-check TUA source"\n' : ''}

${compile}run:${runPrerequisite}
\tfeather run ${gameDir}

doctor:${runPrerequisite}
\tfeather doctor ${gameDir}

plugins:
\tfeather plugin list ${sourceDir}

packages:
\tfeather package list --installed --dir ${sourceDir}

vendor-list:
\tfeather build vendor list --dir ${vendorDir}

.PHONY: help ${language === 'tua' ? 'compile check ' : ''}run doctor plugins packages vendor-list
`,
  );
}

function writeProjectFile(projectDir: string, relativePath: string, contents: string, label: string): void {
  const path = safeTarget(projectDir, relativePath, label);
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, contents);
}

function starterMain(title: string, typed: boolean): string {
  const number = typed ? ': number' : '';
  return `local elapsed${number} = 0

function love.load()
  love.graphics.setBackgroundColor(0.035, 0.045, 0.07)
end

function love.update(dt${number})
  elapsed = elapsed + dt
end

function love.draw()
  local width, height = love.graphics.getDimensions()
  local pulse = 0.5 + math.sin(elapsed * 2) * 0.08

  love.graphics.setColor(0.35, 0.82, 0.95, 1)
  love.graphics.circle("fill", width / 2, height / 2 - 54, 22 + pulse * 6)
  love.graphics.setColor(0.93, 0.96, 1, 1)
  love.graphics.printf(${JSON.stringify(title)}, 0, height / 2, width, "center")
  love.graphics.setColor(0.58, 0.65, 0.76, 1)
  love.graphics.printf("Ready to make something lovely.", 0, height / 2 + 30, width, "center")
  love.graphics.printf("Run with Feather: make run", 0, height / 2 + 62, width, "center")
end

function love.keypressed(key${typed ? ': string' : ''})
  if key == "escape" then love.event.quit() end
end
`;
}

function starterConf(title: string, productId: string): string {
  return `function love.conf(t)
  t.identity = ${JSON.stringify(productId)}
  t.window.title = ${JSON.stringify(title)}
  t.window.width = 960
  t.window.height = 540
  t.window.resizable = true
  t.window.vsync = 1
end
`;
}

function starterReadme(context: CreatePipelineContext): string {
  const isTua = context.language === 'tua';
  const runtimeDir = basename(context.gameDir);
  const featherConfigPath = isTua ? 'src/feather.config.lua' : 'game/feather.config.lua';
  const connection = context.appId || context.allowInsecureConnection
    ? ''
    : `## Connect Feather\n\nBefore the first run, copy the Desktop App ID from **Feather → Settings → Security** into \`appId\` in \`${featherConfigPath}\`. Feather keeps this explicit so a generated game never accepts remote-control connections by default.\n\n`;
  return `# ${context.identity.title}

A ${isTua ? '[TUA](https://github.com/Kyonru/tua-lang) and ' : ''}[LÖVE](https://love2d.org/) project created with [Feather](https://kyonru.github.io/feather/).

## Start developing

\`\`\`sh
make run
\`\`\`

${isTua ? `Edit \`src/*.tua\`. \`make run\` compiles source into the generated \`${runtimeDir}/\` LÖVE directory before launching Feather.\n\n` : 'Edit files in `game/`; the starter runs directly with LÖVE through Feather.\n\n'}Useful commands:

\`\`\`sh
make doctor
${isTua ? 'make check\n' : ''}make plugins
make packages
\`\`\`

${connection}
Open the Feather desktop app before \`make run\` to inspect logs, performance, variables, assets, and plugins.
`;
}

function writeVsCodeTasks(context: CreatePipelineContext): void {
  const tasks = {
    version: '2.0.0',
    tasks: [
      {
        label: 'Feather: Run',
        type: 'shell',
        command: 'make run',
        group: { kind: 'build', isDefault: true },
        problemMatcher: [],
      },
      {
        label: 'Feather: Doctor',
        type: 'shell',
        command: 'make doctor',
        problemMatcher: [],
      },
      ...(context.language === 'tua'
        ? [{ label: 'TUA: Check', type: 'shell', command: 'tua check', problemMatcher: [] }]
        : []),
    ],
  };
  writeProjectFile(context.projectDir, '.vscode/tasks.json', `${JSON.stringify(tasks, null, 2)}\n`, 'VS Code tasks');
}

async function cleanBuiltInTemplate(context: CreatePipelineContext): Promise<void> {
  mkdirSync(context.projectDir, { recursive: true });
  writeProjectFile(context.projectDir, 'README.md', starterReadme(context), 'Project README');
  writeProjectFile(
    context.projectDir,
    '.gitignore',
    context.language === 'tua'
      ? '.DS_Store\n/build/\n/builds/\n.feather-cache/\n'
      : '.DS_Store\n/builds/\n.feather-cache/\n',
    'Git ignore file',
  );
  writeProjectFile(
    context.projectDir,
    '.editorconfig',
    'root = true\n\n[*]\ncharset = utf-8\nend_of_line = lf\ninsert_final_newline = true\nindent_style = space\nindent_size = 2\ntrim_trailing_whitespace = true\n',
    'Editor config',
  );
  writeProjectFile(
    context.projectDir,
    'feather.build.json',
    `${JSON.stringify({ name: context.identity.slug, sourceDir: context.language === 'tua' ? 'build' : 'game', outDir: 'builds' }, null, 2)}\n`,
    'Feather build config',
  );

  if (context.language === 'tua') {
    writeProjectFile(
      context.projectDir,
      'tua.toml',
      'source = "src"\nout = "build"\nmain = "main.tua"\ntarget = "love11-luajit"\nextension = "tua"\nemit_maps = true\n',
      'TUA project config',
    );
    writeProjectFile(context.projectDir, 'src/main.tua', starterMain(context.identity.title, true), 'TUA main source');
    writeProjectFile(
      context.projectDir,
      'src/conf.tua',
      starterConf(context.identity.title, context.identity.productId),
      'TUA LOVE config',
    );
    // Seed the ignored output so Feather can initialize without requiring TUA to be installed first.
    writeProjectFile(context.projectDir, 'build/main.lua', starterMain(context.identity.title, false), 'Generated LOVE entrypoint');
    writeProjectFile(
      context.projectDir,
      'build/conf.lua',
      starterConf(context.identity.title, context.identity.productId),
      'Generated LOVE config',
    );
  } else {
    writeProjectFile(context.projectDir, 'game/main.lua', starterMain(context.identity.title, false), 'LOVE entrypoint');
    writeProjectFile(
      context.projectDir,
      'game/conf.lua',
      starterConf(context.identity.title, context.identity.productId),
      'LOVE config',
    );
  }

  mergeVsCodeRecommendations(
    context.projectDir,
    context.language === 'tua'
      ? ['editorconfig.editorconfig', FEATHER_VSCODE_EXTENSION_ID, TUA_VSCODE_EXTENSION_ID]
      : ['editorconfig.editorconfig', 'JohnnyMorganz.stylua', FEATHER_VSCODE_EXTENSION_ID],
  );
  writeVsCodeTasks(context);
  writeMakefile(context.projectDir, context.language);
}

async function configureBuiltInProject(context: CreatePipelineContext): Promise<void> {
  await context.deps.init(context.gameDir, {
    mode: 'cli',
    yes: true,
    sessionName: context.identity.title,
    appId: context.appId,
    allowInsecureConnection: context.allowInsecureConnection,
  });

  if (context.language === 'tua') {
    const generatedConfig = safeTarget(context.gameDir, 'feather.config.lua', 'Generated Feather config');
    const sourceConfig = safeTarget(context.sourceDir, 'feather.config.lua', 'TUA Feather config source');
    copyFileSync(generatedConfig, sourceConfig);
  }
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

function writeOvalWorkspace(context: CreatePipelineContext): void {
  const folders = [
    { name: context.language === 'tua' ? 'Source' : 'Game', path: context.language === 'tua' ? './src' : './game' },
    { name: 'Game Output', path: './game' },
    { name: 'Tools', path: './tools' },
    { name: 'Resources', path: './resources' },
    { name: 'Builds', path: './builds' },
    { name: 'Root', path: '.' },
  ].filter((folder, index, all) => all.findIndex((candidate) => candidate.path === folder.path) === index);
  writeProjectFile(
    context.projectDir,
    'Workspace.code-workspace',
    `${JSON.stringify({ folders, settings: { 'cSpell.words': ['Feather', 'LÖVE', context.identity.slug] } }, null, 2)}\n`,
    'Workspace settings',
  );
}

function cleanOvalUsageGuide(context: CreatePipelineContext): void {
  const path = safeTarget(context.projectDir, 'USAGE.md', 'Build guide');
  if (!existsSync(path)) return;
  let text = readFileSync(path, 'utf8');
  const replacements: Array<[RegExp, string]> = [
    [/^# Development & Build Guide for LÖVE Game Template/m, `# Development & Build Guide for ${context.identity.title}`],
    [/using this template system/g, 'in this project'],
    [/directories in the template/g, 'directories in the project'],
    [/This template includes/g, 'This project includes'],
    [/The template includes/g, 'The project includes'],
    [/this template project/g, 'this project'],
    [/PRODUCT_ID="com\.oval-tutu\.game"/g, `PRODUCT_ID="${context.identity.productId}"`],
    [/ITCH_USER="ovaltutu"/g, 'ITCH_USER="<your-itch-user>"'],
    [/PRODUCT_NAME="Template"/g, `PRODUCT_NAME="${context.identity.title}"`],
    [/PRODUCT_ID="com\.ovaltutu\.template"/g, `PRODUCT_ID="${context.identity.productId}"`],
    [/PRODUCT_DESC="A template game made with LÖVE"/g, `PRODUCT_DESC="A LÖVE game made with Feather"`],
    [/PRODUCT_COPYRIGHT="Copyright \(c\) 2025 Oval Tutu"/g, `PRODUCT_COPYRIGHT="Copyright (c) ${new Date().getFullYear()} ${context.identity.title}"`],
    [/PRODUCT_COMPANY="Oval Tutu"/g, `PRODUCT_COMPANY="${context.identity.title}"`],
    [/PRODUCT_WEBSITE="https:\/\/oval-tutu\.com"/g, 'PRODUCT_WEBSITE=""'],
    [/PRODUCT_UUID="3e64d17c-8797-4382-921f-cf488b22073f"/g, 'PRODUCT_UUID="<generate-with-uuidgen>"'],
    [/`ovaltutu\/template`/g, `\`<your-itch-user>/${context.identity.slug}\``],
    [/https:\/\/oval-tutu\.com/g, 'https://example.com'],
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  text = text
    .split(/\r?\n/)
    .filter((line) => !/main\.template\.lua|Example "game" - you can delete this|main\.lau with example/.test(line))
    .join('\n');
  writeFileSync(path, `${text.replace(/\n+$/, '')}\n`);
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
    ITCH_USER: '',
    PRODUCT_NAME: context.identity.title,
    PRODUCT_ID: context.identity.productId,
    PRODUCT_DESC: 'A LÖVE game made with Feather',
    PRODUCT_COPYRIGHT: `Copyright (c) ${new Date().getFullYear()} ${context.identity.title}`,
    PRODUCT_COMPANY: context.identity.title,
    PRODUCT_WEBSITE: '',
    PRODUCT_UUID: randomUUID(),
  });

  rmSync(safeTarget(context.projectDir, '.github/FUNDING.yml', 'Inherited funding config'), { force: true });
  writeOvalWorkspace(context);
  cleanOvalUsageGuide(context);

  if (context.language === 'tua') {
    writeProjectFile(
      context.projectDir,
      'tua.toml',
      'source = "src"\nout = "game"\nmain = "main.tua"\ntarget = "love11-luajit"\nextension = "tua"\nemit_maps = true\n',
      'TUA project config',
    );
    writeProjectFile(context.projectDir, 'src/main.tua', starterMain(context.identity.title, true), 'TUA main source');
    writeProjectFile(context.projectDir, 'game/main.lua', starterMain(context.identity.title, false), 'Generated LOVE entrypoint');
    writeProjectFile(
      context.projectDir,
      'src/conf.lua',
      readFileSync(safeTarget(context.projectDir, 'game/conf.lua', 'LOVE config'), 'utf8'),
      'TUA LOVE config source',
    );
  }

  const readme = `${starterReadme(context)}
## Included build system

The included multi-platform build workflows, native HTTPS runtime, packaging tools, and release configuration remain ready to use. Configure targets and product metadata in \`game/product.env\`, replace \`resources/icon.png\`, and see [USAGE.md](USAGE.md) for platform details.
`;
  writeProjectFile(context.projectDir, 'README.md', readme, 'Project README');
  mergeVsCodeRecommendations(
    context.projectDir,
    context.language === 'tua'
      ? [FEATHER_VSCODE_EXTENSION_ID, TUA_VSCODE_EXTENSION_ID]
      : [FEATHER_VSCODE_EXTENSION_ID],
  );
}

async function configureOvalTutuProject(context: CreatePipelineContext): Promise<void> {
  await context.deps.init(context.gameDir, {
    mode: 'cli',
    yes: true,
    sessionName: context.identity.title,
    appId: context.appId,
    allowInsecureConnection: context.allowInsecureConnection,
  });
  if (context.language === 'tua') {
    copyFileSync(
      safeTarget(context.gameDir, 'feather.config.lua', 'Generated Feather config'),
      safeTarget(context.sourceDir, 'feather.config.lua', 'TUA Feather config source'),
    );
  }
  writeMakefile(context.projectDir, context.language, 'game', 'game');
  mergePackageJsonScripts(context.projectDir);
}

export const ovalTutuPipeline: TemplatePipeline = {
  template: OVAL_TUTU_CREATE_TEMPLATE,
  cleanTemplate: cleanOvalTutuTemplate,
  configureProject: configureOvalTutuProject,
};

export const builtInPipeline: TemplatePipeline = {
  template: BUILT_IN_CREATE_TEMPLATE,
  cleanTemplate: cleanBuiltInTemplate,
  configureProject: configureBuiltInProject,
};

function resolvePipeline(template: string): TemplatePipeline {
  if (template === OVAL_TUTU_CREATE_TEMPLATE) return ovalTutuPipeline;
  if (template === BUILT_IN_CREATE_TEMPLATE) return builtInPipeline;
  fail(`Unsupported template: ${template}`);
}

async function resolveLanguage(opts: CreateCommandOptions): Promise<CreateLanguage> {
  if (opts.language) return normalizeCreateLanguage(opts.language);
  if (opts.yes || !process.stdin.isTTY || !process.stdout.isTTY) return 'lua';
  return chooseCreateLanguage();
}

async function resolveAppId(opts: CreateCommandOptions): Promise<string | undefined> {
  if (opts.appId?.trim()) return opts.appId.trim();
  if (opts.yes || !process.stdin.isTTY || !process.stdout.isTTY) return undefined;
  return (await chooseCreateAppId()).trim() || undefined;
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
  if (opts.appId?.trim() && opts.allowInsecureConnection)
    fail('Use either --app-id or --allow-insecure-connection, not both.');
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
  const sourceArg = context.language === 'tua' ? 'src' : 'game';
  const vendorArg = context.template === BUILT_IN_CREATE_TEMPLATE ? '.' : 'game';
  if (context.options.plugins.length > 0) {
    await runOptionalStep(
      'Plugin setup',
      `feather plugin install ${context.options.plugins.join(' ')} --dir ${sourceArg} --managed cli`,
      () =>
        context.deps.installPlugins(context.options.plugins, {
          dir: context.sourceDir,
          installDir: 'feather',
          managed: 'cli',
        }),
    );
  }

  if (context.options.packages.length > 0) {
    await runOptionalStep(
      'Package setup',
      `feather package install ${context.options.packages.join(' ')} --dir ${sourceArg}`,
      () =>
        context.deps.installPackages(context.options.packages, {
          dir: context.sourceDir,
          yes: true,
        }),
    );
  }

  if (context.options.vendorTargets.length > 0) {
    await runOptionalStep(
      'Vendor setup',
      `feather build vendor add ${context.options.vendorTargets.join(' ')} --dir ${vendorArg}`,
      () =>
        context.deps.addVendors(context.options.vendorTargets, {
          dir: context.template === BUILT_IN_CREATE_TEMPLATE ? context.projectDir : context.gameDir,
        }),
    );
  }
}

function printNextSteps(context: CreatePipelineContext): void {
  printBlank();
  printHeading('Next steps');
  printMuted(`  cd ${shellQuote(context.projectName)}`);
  if (!context.appId && !context.allowInsecureConnection) {
    const configPath = context.language === 'tua' ? 'src/feather.config.lua' : 'game/feather.config.lua';
    printWarning(`  Set appId in ${configPath} from Feather → Settings → Security before the first run.`);
  }
  printMuted('  make run');
  printMuted('  code .');
  if (context.language === 'tua') printMuted(`  # Edit src/*.tua; ${basename(context.gameDir)}/ is generated.`);
  if (context.options.plugins.length === 0) {
    printMuted(`  feather plugin list ${context.language === 'tua' ? 'src' : 'game'}`);
  }
  if (context.options.packages.length === 0) {
    printMuted(`  feather package list --dir ${context.language === 'tua' ? 'src' : 'game'}`);
  }
  if (context.options.vendorTargets.length === 0) {
    printMuted(`  feather build vendor list --dir ${context.template === BUILT_IN_CREATE_TEMPLATE ? '.' : 'game'}`);
  }
}

export async function runCreatePipeline(
  projectName: string,
  opts: CreateCommandOptions = {},
  depsInput: CreateCommandDeps = {},
): Promise<void> {
  if (!opts.yes) printBanner();
  validateSkipConflicts(opts);
  const deps = { ...defaultDeps(), ...depsInput };
  const template = normalizeCreateTemplate(opts.template);
  const language = await resolveLanguage(opts);
  const appId = await resolveAppId(opts);
  const pipeline = resolvePipeline(template);
  const projectDir = resolveCreateTarget(projectName);
  const identity = deriveProjectIdentity(projectName);
  const options = await maybeChooseInteractiveOptions(opts);
  const resolvedRef = await runPhase('Resolve template ref', template, () =>
    resolveCreateRef(template, opts, deps.fetchLatestReleaseTag),
  );
  const repoUrl = template === BUILT_IN_CREATE_TEMPLATE ? 'bundled with Feather' : gitHubRepoUrl(template);
  const gameDir = resolve(projectDir, language === 'tua' && template === BUILT_IN_CREATE_TEMPLATE ? 'build' : 'game');
  const context: CreatePipelineContext = {
    projectName,
    projectDir,
    gameDir,
    sourceDir: resolve(projectDir, language === 'tua' ? 'src' : 'game'),
    template,
    repoUrl,
    resolvedRef,
    identity,
    language,
    appId,
    allowInsecureConnection: opts.allowInsecureConnection === true,
    options,
    deps,
  };

  if (template === BUILT_IN_CREATE_TEMPLATE) {
    await runPhase('Scaffold project', `${language.toUpperCase()} starter owned by Feather.`, () =>
      pipeline.cleanTemplate(context),
    );
  } else {
    await runPhase('Clone template', `${repoUrl} @ ${resolvedRef.ref}`, () =>
      deps.runExternalCommand('git', ['clone', '--depth=1', '--branch', resolvedRef.ref, repoUrl, projectDir]),
    );
    await runPhase('Clean template', 'Remove sample content and apply project identity.', () =>
      pipeline.cleanTemplate(context),
    );
  }
  await runPhase('Reset git repository', 'Initialize a fresh project history.', async () => {
    rmSync(safeTarget(projectDir, '.git', 'Git metadata'), { recursive: true, force: true });
    await runGit(context, ['init']);
  });
  await runPhase('Configure Feather', 'Initialize CLI-managed Feather project files.', () =>
    pipeline.configureProject(context),
  );
  await runPhase('Run optional setup', 'Plugins, packages, and vendors selected for this project.', () =>
    runOptionalSetup(context),
  );
  phase('Create initial commit', 'Commit the ready-to-develop project.');
  const committed = await commitAll(context, 'chore: bootstrap project with Feather');
  printStatus(committed ? 'success' : 'warning', committed ? 'Create initial commit' : 'Project ready; initial commit pending');

  printBlank();
  printStatus('success', `Created ${style.heading(projectName)} from ${template}@${resolvedRef.ref}`);
  printKeyValues([
    ['Project', projectDir],
    ['Game', context.gameDir],
    ['Template', template],
    ['Language', language === 'tua' ? 'TUA' : 'Lua'],
    ['Ref', `${resolvedRef.ref} (${resolvedRef.source})`],
  ]);
  printNextSteps(context);
}

export async function createCommand(projectName: string, opts: CreateCommandOptions = {}): Promise<void> {
  await runCreatePipeline(projectName, opts);
}
