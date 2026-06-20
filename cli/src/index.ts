#!/usr/bin/env node
import { Command, Option } from 'commander';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import packageJson from '../package.json' with { type: 'json' };
import { runCliAction } from './lib/command.js';
import { createCommand, DEFAULT_CREATE_TEMPLATE } from './commands/create.js';
import { runCommand } from './commands/run.js';
import { initCommand } from './commands/init.js';
import { removeCommand } from './commands/remove.js';
import { doctorCommand } from './commands/doctor.js';
import { updateCommand } from './commands/update.js';
import { buildCommand } from './commands/build.js';
import { releaseInitCommand, releaseRunCommand } from './commands/release.js';
import { replayInitCommand } from './commands/replay.js';
import { mcpCommand } from './commands/mcp.js';
import { skillsInfoCommand, skillsInstallCommand, skillsListCommand, skillsRemoveCommand } from './commands/skills.js';
import { watchCommand } from './commands/watch.js';
import { buildVendorAddCommand, buildVendorListCommand } from './commands/build-vendor.js';
import { buildTargets } from './lib/build/config.js';
import { uploadCommand } from './commands/upload.js';
import { configHotReloadCommand, configManagedCommand, configPluginsCommand } from './commands/config.js';
import {
  pluginListCommand,
  pluginInstallCommand,
  pluginRemoveCommand,
  pluginUpdateCommand,
  pluginWorkflowCommand,
} from './commands/plugin.js';
import {
  packageSearchCommand,
  packageListCommand,
  packageInfoCommand,
  packageInstallCommand,
  packageUpdateCommand,
  packageRemoveCommand,
  packageAuditCommand,
  packageAddCommand,
} from './commands/package.js';
import type { InitMode } from './ui/init/index.js';

const initModes = new Set(['cli', 'auto', 'manual']);
const cliVersion = packageJson.version;

function parseInitMode(value: string): InitMode {
  if (!initModes.has(value)) {
    throw new Error('Mode must be one of: cli, auto, manual');
  }
  return value as InitMode;
}

function parseCommaList(value: unknown): string[] | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createProgram(): Command {
  const program = new Command();

  program
    .name('feather')
    .description('Run and debug Love2D games with Feather — zero game-side changes required')
    .version(cliVersion);

  program
    .command('create <project-name>')
    .description('Create a new Love2D project configured for Feather')
    .option('--template <owner/repo>', 'Template repository to use', DEFAULT_CREATE_TEMPLATE)
    .option('--ref <tag-or-branch>', 'Template ref to clone')
    .option('--main', 'Use the template main branch instead of the latest release')
    .option('-y, --yes', 'Skip prompts and use defaults')
    .option('--plugins <ids>', 'Comma-separated extra plugin IDs to include')
    .option('--packages <ids>', 'Comma-separated package IDs to install')
    .option('--vendor-targets <targets>', 'Comma-separated build vendor targets to set up')
    .option('--skip-plugins', 'Skip extra plugin selection/setup')
    .option('--skip-packages', 'Skip package selection/setup')
    .option('--skip-vendors', 'Skip build vendor selection/setup')
    .action((projectName: string, opts) =>
      runCliAction(() =>
        createCommand(projectName, {
          template: opts.template as string | undefined,
          ref: opts.ref as string | undefined,
          main: opts.main as boolean | undefined,
          yes: opts.yes as boolean | undefined,
          plugins: parseCommaList(opts.plugins as string | undefined),
          packages: parseCommaList(opts.packages as string | undefined),
          vendorTargets: parseCommaList(opts.vendorTargets as string | undefined),
          skipPlugins: opts.skipPlugins as boolean | undefined,
          skipPackages: opts.skipPackages as boolean | undefined,
          skipVendors: opts.skipVendors as boolean | undefined,
        }),
      ),
    );

  program
    .command('run [game-path] [game-args...]')
    .description('Inject Feather into a Love2D game and run it')
    .option('--target <target>', 'Run target: desktop, web, android, ios, or steamos', 'desktop')
    .option('--device <id>', 'Android device serial or iOS simulator UDID')
    .option('--build-config <path>', 'Path to feather.build.json for web/mobile run')
    .option('--out-dir <path>', 'Build output directory for web/mobile run')
    .option('--clean', 'Remove the output directory before web/mobile build')
    .option('--no-cache', 'Disable Android/iOS dev native build cache')
    .option('--verbose', 'Show web/mobile build commands and native tool output')
    .option('--web-host <host>', 'Host for web run static server', '127.0.0.1')
    .option('--web-port <port>', 'Port for web run static server', (value) => Number(value), 8000)
    .option('--no-adb-reverse', 'Skip adb reverse setup for Android mobile run')
    .option('--port <port>', 'Feather desktop port for Android adb reverse', (value) => Number(value))
    .option('--love <path>', 'Path to the love2d binary (overrides auto-detect)')
    .option('--session-name <name>', 'Custom session name shown in the desktop app')
    .option('--no-plugins', 'Disable plugin loading (feather core only)')
    .option('--no-debugger', 'Run without Feather debugger injection')
    .option('--disable-debugger', 'Alias for --no-debugger')
    .option('--config <path>', 'Path to feather.config.lua')
    .option('--config-path <path>', 'Alias for --config')
    .option('--configPath <path>', 'Alias for --config')
    .option('--feather-path <path>', 'Use a local feather install instead of the bundled one')
    .option('--plugins-dir <path>', 'Use a custom plugins directory instead of the bundled one')
    .action((gamePath: string | undefined, gameArgs: string[], opts) =>
      runCliAction(() =>
        runCommand(gamePath, {
          love: opts.love as string | undefined,
          target: opts.target as 'desktop' | 'web' | 'android' | 'ios' | 'steamos' | undefined,
          device: opts.device as string | undefined,
          buildConfig: opts.buildConfig as string | undefined,
          outDir: opts.outDir as string | undefined,
          clean: opts.clean as boolean | undefined,
          noCache: opts.cache === false,
          verbose: opts.verbose as boolean | undefined,
          webHost: opts.webHost as string | undefined,
          webPort: opts.webPort as number | undefined,
          adbReverse: opts.adbReverse as boolean | undefined,
          port: opts.port as number | undefined,
          sessionName: opts.sessionName as string | undefined,
          noPlugins: opts.plugins === false,
          debugger: opts.debugger !== false && !opts.disableDebugger,
          config: (opts.config ?? opts.configPath) as string | undefined,
          featherPath: opts.featherPath as string | undefined,
          pluginsDir: opts.pluginsDir as string | undefined,
          gameArgs,
        }),
      ),
    );

  program
    .command('init [dir]')
    .description('Initialize Feather in a Love2D project directory (default: current directory)')
    .option('--remote', 'Download from GitHub instead of copying the local/bundled Lua runtime')
    .option('--branch <branch>', 'GitHub branch to download from when using --remote', 'main')
    .option('--local-src <path>', 'Copy Lua runtime from a local src-lua style directory')
    .option('--install-dir <path>', 'Install directory for auto/manual modes', 'feather')
    .option('--no-plugins', 'Skip plugin installation')
    .option('--plugins <ids>', 'Comma-separated list of plugins to install')
    .option('--hot-reload-allow <modules>', 'Comma-separated Lua module names to allow for hot reload')
    .option('--session-name <name>', 'Session name shown in the Feather desktop app')
    .option('--app-id <id>', 'Desktop App ID allowed to send commands to this game')
    .option('--mode <mode>', 'Setup mode: cli, auto, or manual', parseInitMode)
    .option('-y, --yes', 'Skip confirmation prompts')
    .option(
      '--allow-insecure-connection',
      'Set __DANGEROUS_INSECURE_CONNECTION__ in feather.config.lua (required with --yes if appId is not configured)',
    )
    .action((dir: string | undefined, opts) =>
      runCliAction(() =>
        initCommand(dir ?? '.', {
          branch: opts.branch as string,
          remote: opts.remote as boolean | undefined,
          localSrc: opts.localSrc as string | undefined,
          installDir: opts.installDir as string,
          noPlugins: opts.plugins === false,
          plugins: parseCommaList(opts.plugins as string | undefined),
          hotReloadAllow: parseCommaList(opts.hotReloadAllow as string | undefined),
          mode: opts.mode as InitMode | undefined,
          yes: opts.yes as boolean,
          allowInsecureConnection: opts.allowInsecureConnection as boolean | undefined,
          appId: opts.appId as string | undefined,
          sessionName: opts.sessionName as string | undefined,
        }),
      ),
    );

  program
    .command('remove [dir]')
    .description('Remove Feather files and init markers from a Love2D project')
    .option('--install-dir <path>', 'Feather install directory override')
    .option('--dry-run', 'Show what would be removed without changing files')
    .option('--keep-config', 'Keep feather.config.lua')
    .option('--keep-main', 'Keep main.lua FEATHER-INIT markers')
    .option('--keep-manual', 'Keep feather.debugger.lua')
    .option('--keep-runtime', 'Keep installed Feather runtime/plugins')
    .option('-y, --yes', 'Skip interactive confirmation')
    .action((dir: string | undefined, opts) =>
      runCliAction(() =>
        removeCommand(dir ?? '.', {
          installDir: opts.installDir as string | undefined,
          dryRun: opts.dryRun as boolean | undefined,
          keepConfig: opts.keepConfig as boolean | undefined,
          keepMain: opts.keepMain as boolean | undefined,
          keepManual: opts.keepManual as boolean | undefined,
          keepRuntime: opts.keepRuntime as boolean | undefined,
          yes: opts.yes as boolean | undefined,
        }),
      ),
    );

  program
    .command('doctor [dir]')
    .description('Check the environment and project setup')
    .option('--install-dir <path>', 'Feather install directory override')
    .option('--host <host>', 'Host to check for the Feather desktop WebSocket')
    .option('--port <port>', 'Port to check for the Feather desktop WebSocket', (value) => Number(value))
    .option('--json', 'Print machine-readable diagnostics')
    .option('--production', 'Fail when project settings are unsafe for production builds')
    .option('--security', 'Print security-focused diagnostics; use with --json for automation')
    .option('--target <target>', 'Check dependencies for a build target')
    .option('--build-target <target>', 'Alias for --target')
    .option('--upload-target <target>', 'Check dependencies for an upload target')
    .option('--release', 'Include mobile release build checks with --target')
    .action((dir: string | undefined, opts) =>
      runCliAction(() =>
        doctorCommand(dir, {
          installDir: opts.installDir as string | undefined,
          host: opts.host as string | undefined,
          port: opts.port as number | undefined,
          json: opts.json as boolean | undefined,
          production: opts.production as boolean | undefined,
          security: opts.security as boolean | undefined,
          buildTarget: (opts.target ?? opts.buildTarget) as string | undefined,
          uploadTarget: opts.uploadTarget as string | undefined,
          release: opts.release as boolean | undefined,
        }),
      ),
    );

  program
    .command('mcp')
    .description('Run a local Model Context Protocol server for Feather desktop sessions')
    .option('--transport <transport>', 'MCP transport: stdio or http', 'stdio')
    .option('--host <host>', 'Host for HTTP transport', '127.0.0.1')
    .option('--port <port>', 'Port for HTTP transport', (value) => Number(value), 4006)
    .option('--desktop-url <url>', 'Feather desktop MCP bridge URL', 'http://127.0.0.1:4005')
    .option('--token <token>', 'MCP bridge and HTTP bearer token')
    .action((opts) =>
      runCliAction(() =>
        mcpCommand({
          transport: opts.transport as 'stdio' | 'http' | undefined,
          host: opts.host as string | undefined,
          port: opts.port as number | undefined,
          desktopUrl: opts.desktopUrl as string | undefined,
          token: opts.token as string | undefined,
        }),
      ),
    );

  const skills = program.command('skills').description('Install Feather agent skills into the current project');

  skills
    .command('list')
    .description('List bundled Feather agent skills')
    .option('--json', 'Output machine-readable JSON')
    .action((opts) =>
      runCliAction(() =>
        skillsListCommand({
          json: opts.json as boolean | undefined,
        }),
      ),
    );

  skills
    .command('info <id>')
    .description('Show metadata for a bundled Feather agent skill')
    .option('--json', 'Output machine-readable JSON')
    .action((id: string, opts) =>
      runCliAction(() =>
        skillsInfoCommand(id, {
          json: opts.json as boolean | undefined,
        }),
      ),
    );

  skills
    .command('install [ids...]')
    .description('Install bundled Feather agent skills into .agents/skills')
    .option('--all', 'Install all bundled Feather skills')
    .option('--dir <path>', 'Project directory (default: current project)')
    .option('--target <path>', 'Skills directory inside the project (default: .agents/skills)')
    .option('--force', 'Overwrite existing installed skills')
    .option('--dry-run', 'Show planned skill installs without writing files')
    .option('--json', 'Output machine-readable JSON')
    .action((ids: string[], opts) =>
      runCliAction(() =>
        skillsInstallCommand(ids ?? [], {
          all: opts.all as boolean | undefined,
          dir: opts.dir as string | undefined,
          target: opts.target as string | undefined,
          force: opts.force as boolean | undefined,
          dryRun: opts.dryRun as boolean | undefined,
          json: opts.json as boolean | undefined,
        }),
      ),
    );

  skills
    .command('remove <ids...>')
    .description('Remove installed Feather agent skills from .agents/skills')
    .option('--dir <path>', 'Project directory (default: current project)')
    .option('--dry-run', 'Show planned skill removals without deleting files')
    .option('--json', 'Output machine-readable JSON')
    .action((ids: string[], opts) =>
      runCliAction(() =>
        skillsRemoveCommand(ids, {
          dir: opts.dir as string | undefined,
          dryRun: opts.dryRun as boolean | undefined,
          json: opts.json as boolean | undefined,
        }),
      ),
    );

  const config = program.command('config').description('Update Feather configuration values');

  const replay = program.command('replay').description('Scaffold and manage Session Replay adapters');

  replay
    .command('init')
    .description('Create a centralized Session Replay adapter file')
    .option('--dir <path>', 'Project directory (default: current directory)')
    .option('--path <path>', 'Adapter path inside the project', 'dev/replay.lua')
    .option('--force', 'Overwrite an existing adapter file')
    .option('--no-config', 'Do not update feather.config.lua to include session-replay')
    .action((opts) =>
      runCliAction(() =>
        replayInitCommand({
          dir: opts.dir as string | undefined,
          path: opts.path as string | undefined,
          force: opts.force as boolean | undefined,
          config: opts.config as boolean | undefined,
        }),
      ),
    );

  config
    .command('plugins')
    .description('Update feather.config.lua plugin include/exclude settings and capability allowlist')
    .option('--dir <path>', 'Project directory (default: current directory)')
    .option('--include <ids>', 'Comma-separated plugin IDs to include and enable')
    .option('--exclude <ids>', 'Comma-separated plugin IDs to exclude')
    .action((opts) =>
      runCliAction(() =>
        configPluginsCommand({
          dir: opts.dir as string | undefined,
          include: opts.include as string | undefined,
          exclude: opts.exclude as string | undefined,
        }),
      ),
    );

  config
    .command('managed <mode>')
    .description('Set the managed mode in feather.config.lua (cli, auto, manual)')
    .option('--dir <path>', 'Project directory (default: current directory)')
    .action((mode, opts) =>
      runCliAction(() =>
        configManagedCommand(mode as string, {
          dir: opts.dir as string | undefined,
        }),
      ),
    );

  config
    .command('hot-reload')
    .description('Enable hot reload config and set its module allowlist')
    .option('--dir <path>', 'Project directory (default: current directory)')
    .option('--allow <modules>', 'Comma-separated Lua module names to allow')
    .action((opts) =>
      runCliAction(() =>
        configHotReloadCommand({
          dir: opts.dir as string | undefined,
          allow: opts.allow as string | undefined,
        }),
      ),
    );

  const build = program
    .command('build')
    .description('Build a LÖVE game package, web bundle, mobile dev app, or desktop installer');

  function addBuildTargetCommand(target: string): void {
    build
      .command(target)
      .description(`Build a LÖVE game for ${target}`)
      .option('--dir <path>', 'Project directory (default: current directory)')
      .option('--config <path>', 'Path to feather.build.json')
      .option('--build-config <path>', 'Alias for --config')
      .option('--runtime-config <path>', 'Path to feather.config.lua for mobile debugger embedding')
      .option('--config-path <path>', 'Alias for --runtime-config')
      .option('--configPath <path>', 'Alias for --runtime-config')
      .option('--out-dir <path>', 'Build output directory')
      .option('--name <name>', 'Build product name')
      .option('--version <version>', 'Build product version')
      .option('--clean', 'Remove the output directory before building')
      .option('--dry-run', 'Show the build plan without writing artifacts')
      .option('--json', 'Output machine-readable JSON')
      .option('--allow-unsafe', 'Allow production-unsafe Feather config during build')
      .option('--release', 'Build signed/store-oriented mobile release artifacts')
      .option('--no-cache', 'Disable Android/iOS dev native build cache')
      .option('--no-debugger', 'Build mobile dev artifacts without Feather debugger embedding')
      .option('--disable-debugger', 'Alias for --no-debugger')
      .option('--verbose', 'Show Android/iOS build commands and native tool output')
      .action((opts) =>
        runCliAction(() =>
          buildCommand(target, {
            dir: opts.dir as string | undefined,
            config: buildConfigOption(opts.config as string | undefined, opts.buildConfig as string | undefined),
            runtimeConfig: runtimeConfigOption(
              opts.config as string | undefined,
              opts.runtimeConfig as string | undefined,
              opts.configPath as string | undefined,
            ),
            outDir: opts.outDir as string | undefined,
            name: opts.name as string | undefined,
            version: opts.version as string | undefined,
            clean: opts.clean as boolean | undefined,
            dryRun: opts.dryRun as boolean | undefined,
            json: opts.json as boolean | undefined,
            allowUnsafe: opts.allowUnsafe as boolean | undefined,
            release: opts.release as boolean | undefined,
            noCache: opts.cache === false,
            debugger: opts.debugger !== false && !opts.disableDebugger,
            verbose: opts.verbose as boolean | undefined,
          }),
        ),
      );
  }

  function looksLikeRuntimeConfig(path: string | undefined): boolean {
    return Boolean(path && (/\.lua$/i.test(path) || path.endsWith('.featherrc')));
  }

  function buildConfigOption(config: string | undefined, buildConfig: string | undefined): string | undefined {
    if (buildConfig) return buildConfig;
    return looksLikeRuntimeConfig(config) ? undefined : config;
  }

  function runtimeConfigOption(
    config: string | undefined,
    runtimeConfig: string | undefined,
    configPath: string | undefined,
  ): string | undefined {
    return runtimeConfig ?? configPath ?? (looksLikeRuntimeConfig(config) ? config : undefined);
  }

  for (const target of buildTargets) {
    addBuildTargetCommand(target);
  }

  const buildVendor = build.command('vendor').description('Fetch and inspect local build vendor templates');

  buildVendor
    .command('add [targets...]')
    .description('Fetch build vendors: web, android, ios, mobile, desktop, or all')
    .allowUnknownOption()
    .option('--target <targets...>', 'Vendor target(s) to add')
    .option('--dir <path>', 'Project directory (default: current directory)')
    .option('--config <path>', 'Path to feather.build.json')
    .option('--vendor-dir <path>', 'Vendor directory inside the project', 'vendor')
    .option('--ref <ref>', 'LÖVE version/tag/ref for all vendors')
    .option('--web-ref <ref>', 'love.js vendor branch/tag/ref override')
    .option('--android-ref <ref>', 'Android vendor branch/tag/ref override')
    .option('--ios-ref <ref>', 'iOS vendor branch/tag/ref override')
    .option('--force', 'Replace existing vendor directories or conflicting config paths')
    .option('--dry-run', 'Show planned vendor changes without writing files')
    .option('--json', 'Output machine-readable JSON')
    .addHelpText('after', '\n  --no-config              Do not update feather.build.json')
    .action((targets: string[], opts) =>
      runCliAction(() =>
        buildVendorAddCommand(
          [...targets.filter((target) => target !== '--no-config'), ...((opts.target as string[] | undefined) ?? [])],
          {
            dir: opts.dir as string | undefined,
            config: opts.config as string | undefined,
            vendorDir: opts.vendorDir as string | undefined,
            ref: opts.ref as string | undefined,
            webRef: opts.webRef as string | undefined,
            androidRef: opts.androidRef as string | undefined,
            iosRef: opts.iosRef as string | undefined,
            force: opts.force as boolean | undefined,
            dryRun: opts.dryRun as boolean | undefined,
            json: opts.json as boolean | undefined,
            configUpdate: !process.argv.includes('--no-config'),
          },
        ),
      ),
    );

  buildVendor
    .command('list')
    .description('List configured build vendors')
    .option('--dir <path>', 'Project directory (default: current directory)')
    .option('--config <path>', 'Path to feather.build.json')
    .option('--vendor-dir <path>', 'Vendor directory inside the project', 'vendor')
    .option('--json', 'Output machine-readable JSON')
    .action((opts) =>
      runCliAction(() =>
        buildVendorListCommand({
          dir: opts.dir as string | undefined,
          config: opts.config as string | undefined,
          vendorDir: opts.vendorDir as string | undefined,
          json: opts.json as boolean | undefined,
        }),
      ),
    );

  const release = program.command('release').description('Run Fastlane-backed mobile release lanes');

  release
    .command('init')
    .description('Create editable Fastlane release files')
    .option('--dir <path>', 'Project directory (default: current directory)')
    .option('--config <path>', 'Path to feather.build.json')
    .option('--dry-run', 'Show planned files without writing them')
    .option('--json', 'Output machine-readable JSON')
    .action((opts) =>
      runCliAction(() =>
        releaseInitCommand({
          dir: opts.dir as string | undefined,
          config: opts.config as string | undefined,
          dryRun: opts.dryRun as boolean | undefined,
          json: opts.json as boolean | undefined,
        }),
      ),
    );

  function addReleaseTargetCommand(target: 'ios' | 'android'): void {
    release
      .command(`${target} [lane]`)
      .description(`Run a Fastlane ${target} release lane: beta, production, metadata, or screenshots`)
      .option('--dir <path>', 'Project directory (default: current directory)')
      .option('--config <path>', 'Path to feather.build.json')
      .option('--out-dir <path>', 'Build output directory')
      .option('--name <name>', 'Build product name')
      .option('--version <version>', 'Build product version')
      .option('--dry-run', 'Show the release plan without running Fastlane')
      .option('--json', 'Output machine-readable JSON')
      .option('--clean', 'Remove the output directory before release build')
      .option('--no-cache', 'Disable Android/iOS native build cache during release build')
      .option('--verbose', 'Show build/Fastlane command output')
      .option('--skip-build', 'Run the Fastlane lane using existing build artifacts')
      .action((lane: string | undefined, opts) =>
        runCliAction(() =>
          releaseRunCommand(target, lane, {
            dir: opts.dir as string | undefined,
            config: opts.config as string | undefined,
            outDir: opts.outDir as string | undefined,
            name: opts.name as string | undefined,
            version: opts.version as string | undefined,
            dryRun: opts.dryRun as boolean | undefined,
            json: opts.json as boolean | undefined,
            clean: opts.clean as boolean | undefined,
            noCache: opts.cache === false,
            verbose: opts.verbose as boolean | undefined,
            skipBuild: opts.skipBuild as boolean | undefined,
          }),
        ),
      );
  }

  addReleaseTargetCommand('ios');
  addReleaseTargetCommand('android');

  program
    .command('upload [target] [build-target]')
    .description('Upload built artifacts to itch.io or registered store targets')
    .option('--dir <path>', 'Project directory (default: current directory)')
    .option('--config <path>', 'Path to feather.build.json')
    .option('--build-dir <path>', 'Directory containing feather-build-manifest.json')
    .option('--project <name>', 'Upload project override, for example user/game')
    .option('--channel <name>', 'Upload channel override')
    .option('--user-version <version>', 'Store-facing version override')
    .option('--dry-run', 'Show the upload plan without running the uploader')
    .option('--if-changed', 'Pass --if-changed to supported uploaders')
    .option('--hidden', 'Pass --hidden to supported uploaders')
    .option('--json', 'Output machine-readable JSON')
    .option('-y, --yes', 'Skip upload confirmation in non-interactive mode')
    .option('--build', 'Build the selected target before uploading')
    .option('--out-dir <path>', 'Build output directory when used with --build')
    .option('--release', 'Deprecated for upload builds; mobile upload builds always use release mode')
    .option('--allow-unsafe', 'Rejected with --build; upload builds always run production safety checks')
    .option('--clean', 'Remove the output directory before --build')
    .option('--no-cache', 'Disable Android/iOS dev native build cache during --build')
    .option('--verbose', 'Show build command output when used with --build')
    .option(
      '--allow-feather-runtime',
      'Allow uploading existing artifacts that include or may include Feather runtime files',
    )
    .action((target: string, buildTarget: string | undefined, opts) =>
      runCliAction(() =>
        uploadCommand(target, buildTarget, {
          dir: opts.dir as string | undefined,
          config: opts.config as string | undefined,
          buildDir: opts.buildDir as string | undefined,
          project: opts.project as string | undefined,
          channel: opts.channel as string | undefined,
          userVersion: opts.userVersion as string | undefined,
          dryRun: opts.dryRun as boolean | undefined,
          ifChanged: opts.ifChanged as boolean | undefined,
          hidden: opts.hidden as boolean | undefined,
          json: opts.json as boolean | undefined,
          yes: opts.yes as boolean | undefined,
          build: opts.build as boolean | undefined,
          outDir: opts.outDir as string | undefined,
          release: opts.release as boolean | undefined,
          allowUnsafe: opts.allowUnsafe as boolean | undefined,
          clean: opts.clean as boolean | undefined,
          noCache: opts.cache === false,
          verbose: opts.verbose as boolean | undefined,
          allowFeatherRuntime: opts.allowFeatherRuntime as boolean | undefined,
        }),
      ),
    );

  program
    .command('update [dir]')
    .description('Update the Feather core library in a project (default: current directory)')
    .option('--remote', 'Download from GitHub instead of copying the local/bundled Lua runtime')
    .option('--branch <branch>', 'GitHub branch to download from when using --remote', 'main')
    .option('--local-src <path>', 'Copy Lua runtime from a local src-lua style directory')
    .option('--install-dir <path>', 'Feather install directory', 'feather')
    .option('-y, --yes', 'Skip interactive confirmation and use the selected/default source')
    .action((dir: string | undefined, opts) =>
      runCliAction(() =>
        updateCommand(dir ?? '.', {
          branch: opts.branch as string,
          remote: opts.remote as boolean | undefined,
          localSrc: opts.localSrc as string | undefined,
          installDir: opts.installDir as string,
          yes: opts.yes as boolean | undefined,
        }),
      ),
    );

  const plugin = program
    .command('plugin')
    .description('Manage Feather plugins')
    .option('--dir <path>', 'Project directory (default: current directory)')
    .option('--remote', 'Download from GitHub instead of copying the local/bundled Lua runtime')
    .option('--branch <branch>', 'GitHub branch to download from when using --remote', 'main')
    .option('--local-src <path>', 'Copy plugins from a local src-lua style directory')
    .option('--install-dir <path>', 'Feather install directory', 'feather')
    .option('--managed <mode>', 'Override managed mode detection (cli, auto, manual)')
    .action((opts) =>
      runCliAction(() =>
        pluginWorkflowCommand({
          dir: opts.dir as string | undefined,
          branch: opts.branch as string,
          installDir: opts.installDir as string,
          remote: opts.remote as boolean | undefined,
          localSrc: opts.localSrc as string | undefined,
        }),
      ),
    );

  const pluginCommandOptions = (opts: Record<string, unknown>) => ({ ...opts, ...plugin.opts() });

  plugin
    .command('list [dir]')
    .description('List installed plugins')
    .option('--install-dir <path>', 'Feather install directory', 'feather')
    .option('--managed <mode>', 'Override managed mode detection (cli, auto, manual)')
    .action((dir: string | undefined, opts) =>
      runCliAction(() => {
        const merged = pluginCommandOptions(opts);
        return pluginListCommand(
          dir ?? (merged.dir as string | undefined),
          merged.installDir as string,
          merged.managed as string | undefined,
        );
      }),
    );

  plugin
    .command('install <ids...>')
    .description('Install one or more plugins from the Feather registry')
    .option('--dir <path>', 'Project directory (default: current directory)')
    .option('--remote', 'Download from GitHub instead of copying the local/bundled Lua runtime')
    .option('--branch <branch>', 'GitHub branch to download from when using --remote', 'main')
    .option('--local-src <path>', 'Copy plugins from a local src-lua style directory')
    .option('--install-dir <path>', 'Feather install directory', 'feather')
    .option('--managed <mode>', 'Override managed mode detection (cli, auto, manual)')
    .option('--force', 'Overwrite already-installed plugins without prompting')
    .action((ids: string[], opts) =>
      runCliAction(() => {
        const merged = pluginCommandOptions(opts);
        return pluginInstallCommand(ids, {
          dir: merged.dir as string | undefined,
          branch: merged.branch as string,
          installDir: merged.installDir as string,
          remote: merged.remote as boolean | undefined,
          localSrc: merged.localSrc as string | undefined,
          managed: merged.managed as string | undefined,
          force: merged.force as boolean | undefined,
        });
      }),
    );

  plugin
    .command('remove <id>')
    .description('Remove an installed plugin')
    .option('--dir <path>', 'Project directory (default: current directory)')
    .option('--install-dir <path>', 'Feather install directory', 'feather')
    .option('-y, --yes', 'Skip interactive confirmation')
    .option('--managed <mode>', 'Override managed mode detection (cli, auto, manual)')
    .action((id: string, opts) =>
      runCliAction(() => {
        const merged = pluginCommandOptions(opts);
        return pluginRemoveCommand(id, {
          dir: merged.dir as string | undefined,
          installDir: merged.installDir as string,
          yes: merged.yes as boolean | undefined,
          managed: merged.managed as string | undefined,
        });
      }),
    );

  plugin
    .command('update [id]')
    .description('Update a plugin (or all installed plugins if no id given)')
    .option('--dir <path>', 'Project directory (default: current directory)')
    .option('--remote', 'Download from GitHub instead of copying the local/bundled Lua runtime')
    .option('--branch <branch>', 'GitHub branch to download from when using --remote', 'main')
    .option('--local-src <path>', 'Copy plugins from a local src-lua style directory')
    .option('--install-dir <path>', 'Feather install directory', 'feather')
    .option('-y, --yes', 'Skip interactive selection and update all installed plugins when no id is given')
    .option('--managed <mode>', 'Override managed mode detection (cli, auto, manual)')
    .action((id: string | undefined, opts) =>
      runCliAction(() => {
        const merged = pluginCommandOptions(opts);
        return pluginUpdateCommand(id, {
          dir: merged.dir as string | undefined,
          branch: merged.branch as string,
          installDir: merged.installDir as string,
          remote: merged.remote as boolean | undefined,
          localSrc: merged.localSrc as string | undefined,
          yes: merged.yes as boolean | undefined,
          managed: merged.managed as string | undefined,
        });
      }),
    );

  const pkg = program.command('package').description('Install and manage LÖVE packages from the Feather catalog');

  pkg
    .command('add')
    .description('Interactively install a custom dependency from URL(s)')
    .option('--dir <path>', 'Project directory')
    .action((opts) => runCliAction(() => packageAddCommand({ dir: opts.dir as string | undefined })));

  pkg
    .command('search [query]')
    .description('Search the package catalog')
    .option('--offline', 'Use bundled registry snapshot')
    .option('--registry <url>', 'Override registry URL')
    .action((query: string | undefined, opts) =>
      runCliAction(() =>
        packageSearchCommand(query, {
          offline: opts.offline as boolean | undefined,
          registryUrl: opts.registry as string | undefined,
        }),
      ),
    );

  pkg
    .command('list')
    .description('List all available packages (--installed for installed only)')
    .option('--installed', 'Show only installed packages')
    .option('--offline', 'Use bundled registry snapshot')
    .option('--refresh', 'Force a fresh registry fetch ignoring cache')
    .option('--dir <path>', 'Project directory')
    .option('--registry <url>', 'Override registry URL')
    .action((opts) =>
      runCliAction(() =>
        packageListCommand({
          installed: opts.installed as boolean | undefined,
          offline: opts.offline as boolean | undefined,
          refresh: opts.refresh as boolean | undefined,
          dir: opts.dir as string | undefined,
          registryUrl: opts.registry as string | undefined,
        }),
      ),
    );

  pkg
    .command('info <name>')
    .description('Show package details')
    .option('--offline', 'Use bundled registry snapshot')
    .option('--dir <path>', 'Project directory')
    .option('--registry <url>', 'Override registry URL')
    .action((name: string, opts) =>
      runCliAction(() =>
        packageInfoCommand(name, {
          offline: opts.offline as boolean | undefined,
          dir: opts.dir as string | undefined,
          registryUrl: opts.registry as string | undefined,
        }),
      ),
    );

  pkg
    .command('install [names...]')
    .description('Install one or more packages')
    .option('--dry-run', 'Show what would be installed without writing files')
    .option('--allow-untrusted', 'Allow installing experimental packages')
    .option('--allow-non-lua-files', 'Allow installing non-Lua files (e.g. shaders, images)')
    .option('--flat-dir <dir>', 'Flatten catalog package files into a directory')
    .option('--target-path <path>', 'Destination path for --from-url installs')
    .option('--install-dir <dir>', 'Install catalog package files under a custom base directory')
    .option('--save-install-dir', 'Save --install-dir in feather.lock.json for future installs and updates')
    .option('--include-licenses', 'Install catalog-declared license files alongside packages')
    .option('--from-url <url>', 'Install a single file from an arbitrary URL (requires --allow-untrusted)')
    .addOption(new Option('--target <path>', 'Deprecated alias for --target-path with --from-url or --flat-dir for catalog installs').hideHelp())
    .option('--offline', 'Use bundled registry snapshot')
    .option('--dir <path>', 'Project directory')
    .option('-y, --yes', 'Skip confirmation prompts')
    .option('--registry <url>', 'Override registry URL')
    .action((names: string[], opts) =>
      runCliAction(() =>
        packageInstallCommand(names, {
          dryRun: opts.dryRun as boolean | undefined,
          allowUntrusted: opts.allowUntrusted as boolean | undefined,
          allowNonLuaFiles: opts.allowNonLuaFiles as boolean | undefined,
          flatDir: (opts.flatDir ?? (!opts.fromUrl ? opts.target : undefined)) as string | undefined,
          targetPath: (opts.targetPath ?? (opts.fromUrl ? opts.target : undefined)) as string | undefined,
          installDir: opts.installDir as string | undefined,
          saveInstallDir: opts.saveInstallDir as boolean | undefined,
          includeLicenses: opts.includeLicenses as boolean | undefined,
          fromUrl: opts.fromUrl as string | undefined,
          offline: opts.offline as boolean | undefined,
          dir: opts.dir as string | undefined,
          yes: opts.yes as boolean | undefined,
          registryUrl: opts.registry as string | undefined,
        }),
      ),
    );

  pkg
    .command('update [name]')
    .description('Update an installed package (or all if no name given)')
    .option('--dry-run', 'Show what would change without writing files')
    .option('--offline', 'Use bundled registry snapshot')
    .option('--dir <path>', 'Project directory')
    .option('--registry <url>', 'Override registry URL')
    .action((name: string | undefined, opts) =>
      runCliAction(() =>
        packageUpdateCommand(name, {
          dryRun: opts.dryRun as boolean | undefined,
          offline: opts.offline as boolean | undefined,
          dir: opts.dir as string | undefined,
          registryUrl: opts.registry as string | undefined,
        }),
      ),
    );

  pkg
    .command('remove <name>')
    .description('Remove an installed package')
    .option('--dir <path>', 'Project directory')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action((name: string, opts) =>
      runCliAction(() =>
        packageRemoveCommand(name, {
          dir: opts.dir as string | undefined,
          yes: opts.yes as boolean | undefined,
        }),
      ),
    );

  pkg
    .command('audit')
    .description('Verify SHA-256 checksums of all installed packages')
    .option('--dir <path>', 'Project directory')
    .option('--json', 'Output machine-readable JSON')
    .action((opts) =>
      runCliAction(() =>
        packageAuditCommand({
          dir: opts.dir as string | undefined,
          json: opts.json as boolean | undefined,
        }),
      ),
    );

  program
    .command('watch [game-path]')
    .description(
      'Watch project files and restart desktop LÖVE or push game.love to a connected mobile device on change',
    )
    .option('--target <target>', 'Watch target: desktop, android, ios, or steamos', 'desktop')
    .option('--love <path>', 'Path to love executable for desktop watch')
    .option('--device <id>', 'Android device serial or iOS simulator UDID')
    .option('--debounce <ms>', 'Debounce delay in milliseconds', (value) => Number(value), 500)
    .option('--no-restart', 'Push game.love without restarting the app')
    .option('--build-config <path>', 'Path to feather.build.json')
    .option('--out-dir <path>', 'Build output directory')
    .option('--no-plugins', 'Disable plugin loading (feather core only)')
    .option('--no-debugger', 'Run desktop watch without Feather debugger injection')
    .option('--disable-debugger', 'Alias for --no-debugger')
    .option('--no-adb-reverse', 'Skip adb reverse setup for Android')
    .option('--port <port>', 'Feather port for Android adb reverse', (value) => Number(value))
    .option('--feather-path <path>', 'Use a local feather install instead of the bundled one')
    .option('--plugins-dir <path>', 'Use a custom plugins directory instead of the bundled one')
    .option('--runtime-config <path>', 'Path to feather.config.lua for debugger embedding')
    .option('--verbose', 'Show build commands and native tool output')
    .action((gamePath: string | undefined, opts) =>
      runCliAction(() =>
        watchCommand(gamePath, {
          target: opts.target as 'desktop' | 'android' | 'ios' | 'steamos' | undefined,
          love: opts.love as string | undefined,
          debugger: opts.debugger !== false && !opts.disableDebugger,
          device: opts.device as string | undefined,
          debounce: opts.debounce as number | undefined,
          restart: opts.restart as boolean | undefined,
          buildConfig: opts.buildConfig as string | undefined,
          outDir: opts.outDir as string | undefined,
          noPlugins: opts.plugins === false,
          adbReverse: opts.adbReverse as boolean | undefined,
          port: opts.port as number | undefined,
          featherPath: opts.featherPath as string | undefined,
          pluginsDir: opts.pluginsDir as string | undefined,
          runtimeConfig: opts.runtimeConfig as string | undefined,
          verbose: opts.verbose as boolean | undefined,
        }),
      ),
    );

  return program;
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  const previousExitCode = process.exitCode;
  process.exitCode = undefined;
  const program = createProgram();
  program.exitOverride();

  try {
    await program.parseAsync(argv, { from: 'user' });
  } catch (err) {
    if (err && typeof err === 'object' && 'exitCode' in err) {
      process.exitCode = Number((err as { exitCode: number }).exitCode);
    } else {
      throw err;
    }
  }

  const exitCode = typeof process.exitCode === 'number' ? process.exitCode : 0;
  process.exitCode = previousExitCode;
  return exitCode;
}

function isCliEntrypoint(): boolean {
  if (!process.argv[1]) return false;
  try {
    return import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
  } catch {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  }
}

if (isCliEntrypoint()) {
  const exitCode = await runCli();
  process.exitCode = exitCode;
}
