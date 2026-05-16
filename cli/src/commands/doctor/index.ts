import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findLoveBinary, getLoveVersion } from '../../lib/love.js';
import { loadConfig } from '../../lib/config.js';
import { normalizeInstallDir } from '../../lib/install.js';
import { fail } from '../../lib/command.js';
import { printJson } from '../../lib/output.js';
import { auditLockfile } from '../../lib/package/audit.js';
import { readLockfile } from '../../lib/package/lockfile.js';
import { parseManagedValue, findInstalledPluginDirs, readPluginManifest } from '../../lib/plugin-utils.js';
import {
  add,
  commandVersion,
  hasConfigArrayValue,
  isWeakApiKey,
  luaBoolEnabled,
  portReachable,
  readIfExists,
  uncommentedLua,
  type DoctorCheck,
  type DoctorOptions,
} from './checks.js';
import { renderReport } from './report.js';

export type { DoctorOptions } from './checks.js';

export async function doctorCommand(gamePath?: string, opts: DoctorOptions = {}): Promise<void> {
  const projectDir = gamePath ? resolve(gamePath) : process.cwd();
  const installDir = normalizeInstallDir(opts.installDir ?? 'feather');
  const checks: DoctorCheck[] = [];

  const nodeVersion = process.versions.node;
  const [major] = nodeVersion.split('.').map(Number);
  add(
    checks,
    'Environment',
    'Node.js',
    major >= 18 ? 'pass' : 'fail',
    `v${nodeVersion}`,
    major >= 18 ? undefined : 'Install Node.js 18 or newer.',
  );

  const npmVersion = commandVersion('npm', ['--version']);
  add(
    checks,
    'Environment',
    'npm',
    npmVersion ? 'pass' : 'warn',
    npmVersion ? `v${npmVersion}` : 'not found',
    npmVersion ? undefined : 'Install npm if you want to use npm run feather or global CLI installs.',
  );

  try {
    const lovePath = findLoveBinary();
    const ver = getLoveVersion(lovePath);
    add(checks, 'Environment', 'LÖVE binary', 'pass', `${lovePath}  (${ver})`);
  } catch {
    add(
      checks,
      'Environment',
      'LÖVE binary',
      'fail',
      'not found',
      'Install from https://love2d.org or set LOVE_BIN to the executable path.',
    );
  }

  add(checks, 'Environment', 'Platform', 'info', `${process.platform} ${process.arch}`);

  const hasProjectDir = existsSync(projectDir);
  add(
    checks,
    'Project',
    'Project directory',
    hasProjectDir ? 'pass' : 'fail',
    projectDir,
    hasProjectDir ? undefined : 'Pass the game directory to `feather doctor <dir>`.',
  );

  const mainPath = join(projectDir, 'main.lua');
  const mainSource = readIfExists(mainPath);
  const hasMain = mainSource !== null;
  add(
    checks,
    'Project',
    'main.lua',
    hasMain ? 'pass' : 'fail',
    hasMain ? mainPath : 'missing',
    hasMain ? undefined : 'Run doctor from a LÖVE project root or pass the project directory.',
  );

  const configPath = join(projectDir, 'feather.config.lua');
  const configSource = readIfExists(configPath);
  let config: ReturnType<typeof loadConfig> = null;
  if (configSource) {
    try {
      config = loadConfig(projectDir);
      add(checks, 'Project', 'feather.config.lua', 'pass', configPath);
    } catch (err) {
      add(checks, 'Project', 'feather.config.lua', 'fail', (err as Error).message);
    }
  } else {
    add(checks, 'Project', 'feather.config.lua', 'warn', 'missing', 'Run `feather init` to create a shared config.');
  }

  const managedMode = configSource ? parseManagedValue(configSource, 'mode') : null;
  const managedInstallDir = configSource ? parseManagedValue(configSource, 'installDir') : null;
  const effectiveInstallDir = normalizeInstallDir(opts.installDir ?? managedInstallDir ?? installDir);
  if (managedMode) {
    add(checks, 'Project', 'Managed init metadata', 'pass', `mode=${managedMode}, installDir=${managedInstallDir ?? effectiveInstallDir}`);
  } else if (configSource) {
    add(checks, 'Project', 'Managed init metadata', 'info', 'not present', 'New `feather init` configs include metadata for `feather remove`.');
  }

  const runtimeDir = join(projectDir, effectiveInstallDir);
  const hasRuntime = existsSync(join(runtimeDir, 'init.lua'));
  const configOnlyMode = managedMode === 'cli';
  add(
    checks,
    'Runtime',
    'Embedded Feather runtime',
    hasRuntime ? 'pass' : configOnlyMode ? 'info' : 'warn',
    hasRuntime ? runtimeDir : configOnlyMode ? 'not needed for cli mode' : 'missing',
    hasRuntime || configOnlyMode ? undefined : 'Run `feather init --mode auto` for embedded/device workflows.',
  );

  if (hasRuntime) {
    for (const file of ['auto.lua', 'lib/ws.lua', 'plugin_manager.lua']) {
      const path = join(runtimeDir, file);
      add(
        checks,
        'Runtime',
        file,
        existsSync(path) ? 'pass' : 'fail',
        existsSync(path) ? undefined : 'missing',
        existsSync(path) ? undefined : `Reinstall runtime with \`feather init --mode auto --install-dir ${effectiveInstallDir}\`.`,
      );
    }

    const initSource = readIfExists(join(runtimeDir, 'init.lua'));
    const runtimeVersion = initSource?.match(/FEATHER_VERSION_NAME\s*=\s*"([^"]+)"/)?.[1] ?? 'unknown';
    add(checks, 'Runtime', 'Runtime version', runtimeVersion === 'unknown' ? 'warn' : 'pass', runtimeVersion);
  }

  const runtimePluginRoot = join(runtimeDir, 'plugins');
  const sourceTreePluginRoot = join(projectDir, 'plugins');
  const pluginRoot = existsSync(runtimePluginRoot) ? runtimePluginRoot : sourceTreePluginRoot;
  const pluginDirs = findInstalledPluginDirs(pluginRoot);
  if (hasRuntime) {
    add(
      checks,
      'Plugins',
      'Plugin directory',
      existsSync(pluginRoot) ? 'pass' : 'info',
      existsSync(pluginRoot) ? pluginRoot : 'not installed',
      existsSync(pluginRoot) ? undefined : 'Core-only installs are valid; run `feather plugin` to manage plugins.',
    );
    add(checks, 'Plugins', 'Installed plugins', pluginDirs.length > 0 ? 'pass' : 'info', `${pluginDirs.length}`);
    const malformed = pluginDirs.filter((dir) => !readPluginManifest(dir)?.id);
    if (malformed.length > 0) {
      add(checks, 'Plugins', 'Plugin manifests', 'warn', `${malformed.length} missing id`, 'Reinstall affected plugins with `feather plugin update`.');
    } else if (pluginDirs.length > 0) {
      add(checks, 'Plugins', 'Plugin manifests', 'pass', 'all installed plugins declare an id');
    }
  }

  if (mainSource) {
    const hasUseDebugger = mainSource.includes('USE_DEBUGGER');
    const hasInitMarkers = mainSource.includes('FEATHER-INIT-BEGIN') && mainSource.includes('FEATHER-INIT-END');
    add(
      checks,
      'Safety',
      'USE_DEBUGGER guard',
      hasUseDebugger || configOnlyMode ? 'pass' : 'warn',
      hasUseDebugger ? 'present' : configOnlyMode ? 'not needed for cli mode' : 'not found',
      hasUseDebugger || configOnlyMode ? undefined : 'Guard Feather imports so production builds can skip debugger code.',
    );
    add(
      checks,
      'Safety',
      'FEATHER-INIT markers',
      hasInitMarkers || configOnlyMode ? 'pass' : 'info',
      hasInitMarkers ? 'present' : 'not present',
      hasInitMarkers || configOnlyMode ? undefined : '`feather remove` works best when init markers are present.',
    );
  }

  if (configSource) {
    const activeConfigSource = uncommentedLua(configSource);
    const insecureConnection = luaBoolEnabled(activeConfigSource, '__DANGEROUS_INSECURE_CONNECTION__');
    add(
      checks,
      'Safety',
      '__DANGEROUS_INSECURE_CONNECTION__',
      insecureConnection ? 'warn' : 'pass',
      insecureConnection ? 'enabled' : 'disabled',
      insecureConnection ? 'Set a desktop App ID in feather.config.lua before sharing or shipping this project.' : undefined,
    );

    const captureScreenshot = luaBoolEnabled(activeConfigSource, 'captureScreenshot');
    add(
      checks,
      'Safety',
      'captureScreenshot',
      captureScreenshot ? 'warn' : 'pass',
      captureScreenshot ? 'enabled' : 'disabled',
      captureScreenshot ? 'Enable only when you need visual error context; it can affect performance.' : undefined,
    );

    const hotReloadEnabled = /hotReload\s*=\s*\{[\s\S]*?enabled\s*=\s*true/.test(activeConfigSource);
    const hotReloadPluginIncluded = hasConfigArrayValue(activeConfigSource, 'include', 'hot-reload') || pluginDirs.some((dir) => readPluginManifest(dir)?.id === 'hot-reload');
    const persistToDisk = /hotReload\s*=\s*\{[\s\S]*?persistToDisk\s*=\s*true/.test(activeConfigSource);
    const broadHotReload = /allow\s*=\s*\{[\s\S]*["'][^"']+\.\*["']/.test(activeConfigSource);
    add(
      checks,
      'Safety',
      'Hot reload',
      hotReloadEnabled ? 'warn' : 'pass',
      hotReloadEnabled ? 'enabled' : 'disabled',
      hotReloadEnabled ? 'Hot reload is development-only remote code execution; keep allowlists narrow and never ship with it on.' : undefined,
    );
    if (hotReloadEnabled && broadHotReload) {
      add(checks, 'Safety', 'Hot reload allowlist', 'warn', 'contains wildcard', 'Prefer exact module names while editing.');
    }
    if (hotReloadEnabled && !hotReloadPluginIncluded) {
      add(
        checks,
        'Safety',
        'Hot reload plugin',
        'warn',
        'not included',
        'Install and include the opt-in `hot-reload` plugin, or remove debugger.hotReload.',
      );
    }
    if (hotReloadEnabled && persistToDisk) {
      add(checks, 'Safety', 'Hot reload persistence', 'warn', 'persistToDisk=true', 'Persisted patches survive app restarts until restored or cleared.');
    }

    const consoleIncluded = hasConfigArrayValue(activeConfigSource, 'include', 'console') || pluginDirs.some((dir) => readPluginManifest(dir)?.id === 'console');
    if (consoleIncluded) {
      const apiKey = config?.apiKey;
      add(
        checks,
        'Safety',
        'Console API key',
        isWeakApiKey(apiKey) ? 'warn' : 'pass',
        isWeakApiKey(apiKey) ? 'missing or weak' : 'configured',
        isWeakApiKey(apiKey) ? 'Set a strong per-session or config API key when using Console.' : undefined,
      );
    }

    const debuggerEnabled = luaBoolEnabled(activeConfigSource, 'debugger');
    add(
      checks,
      'Safety',
      'Step debugger',
      debuggerEnabled ? 'warn' : 'pass',
      debuggerEnabled ? 'enabled' : 'disabled',
      debuggerEnabled ? 'Enable only for trusted development sessions.' : undefined,
    );

    const writeToDisk = luaBoolEnabled(activeConfigSource, 'writeToDisk');
    add(
      checks,
      'Safety',
      'Disk logging',
      writeToDisk ? 'warn' : 'pass',
      writeToDisk ? 'enabled' : 'disabled',
      writeToDisk ? 'Review generated log files before committing or sharing the project.' : undefined,
    );
  }

  const lockfilePath = join(projectDir, 'feather.lock.json');
  if (existsSync(lockfilePath)) {
    try {
      const lockfile = readLockfile(projectDir);
      const auditResults = await auditLockfile(projectDir, lockfile);
      const badPackages = new Set(auditResults.filter((result) => result.status !== 'verified').map((result) => result.id));
      add(
        checks,
        'Packages',
        'Package lockfile',
        'pass',
        `${Object.keys(lockfile.packages).length} package(s)`,
        undefined,
      );
      add(
        checks,
        'Packages',
        'Package file integrity',
        badPackages.size === 0 ? 'pass' : 'warn',
        badPackages.size === 0 ? 'all verified' : `${badPackages.size} package(s) need attention`,
        badPackages.size === 0 ? undefined : 'Run `feather package audit`, then `feather package install` to restore missing or modified files.',
      );
    } catch (err) {
      add(checks, 'Packages', 'Package lockfile', 'fail', (err as Error).message, 'Fix or delete feather.lock.json and reinstall packages.');
    }
  } else {
    add(checks, 'Packages', 'Package lockfile', 'info', 'not present', 'Run `feather package install <name>` to add project dependencies.');
  }

  const configuredPort = opts.port ?? (typeof config?.port === 'number' ? config.port : 4004);
  const configuredHost = opts.host ?? '127.0.0.1';
  const mode = typeof config?.mode === 'string' ? config.mode : 'socket';
  if (mode === 'disk') {
    add(checks, 'Connectivity', 'WebSocket mode', 'info', 'disk mode', 'Desktop WebSocket connectivity is not used in disk mode.');
  } else {
    const desktopUp = await portReachable(configuredPort, configuredHost);
    add(
      checks,
      'Connectivity',
      `Feather desktop (${configuredHost}:${configuredPort})`,
      desktopUp ? 'pass' : 'warn',
      desktopUp ? 'reachable' : 'not reachable',
      desktopUp ? undefined : 'Start the Feather desktop app, or pass --host/--port if checking a custom endpoint.',
    );
  }

  const failures = checks.filter((check) => check.severity === 'fail');
  const warnings = checks.filter((check) => check.severity === 'warn');

  if (opts.json) {
    printJson({ projectDir, installDir: effectiveInstallDir, failures: failures.length, warnings: warnings.length, checks });
  } else {
    renderReport(checks, projectDir);
  }

  if (failures.length > 0) {
    fail('', { silent: true });
  }
}
