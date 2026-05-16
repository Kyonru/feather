import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { findLoveBinary, getLoveVersion } from '../../lib/love.js';
import { loadConfig } from '../../lib/config.js';
import { normalizeInstallDir } from '../../lib/install.js';
import { fail } from '../../lib/command.js';
import { printJson } from '../../lib/output.js';
import { findSymlinkEscapes } from '../../lib/path-safety.js';
import {
  buildTargets,
  isBuildTarget,
  isSupportedBuildTarget,
  isUploadTarget,
  loadBuildConfig,
  outDirWritableDetail,
  uploadTargets,
} from '../../lib/build/config.js';
import { auditLockfile } from '../../lib/package/audit.js';
import { readLockfile } from '../../lib/package/lockfile.js';
import { lockfileEntrySourceSummary, lockfileUrlFindings } from '../../lib/package/provenance.js';
import { loadRegistry } from '../../lib/package/registry.js';
import { classifyPluginTrust, dangerousPluginIds, parseManagedValue, findInstalledPluginDirs, pluginTrustLabel, readPluginManifest, type PluginTrust } from '../../lib/plugin-utils.js';
import { pluginCatalog } from '../../generated/plugin-catalog.js';
import {
  add,
  buildPluginIndex,
  commandVersion,
  configArrayValues,
  hasConfigArrayValue,
  isLanHost,
  isLoopbackHost,
  isWildcardHost,
  isWeakApiKey,
  luaBoolEnabled,
  luaStringValue,
  portReachable,
  readIfExists,
  shellArg,
  uncommentedLua,
  type DoctorCheck,
  type DoctorOptions,
} from './checks.js';
import { renderReport } from './report.js';
import { buildSecurityReport, securityChecks, type SecurityPackageReport, type SecurityPluginReport } from './security.js';

export type { DoctorOptions } from './checks.js';

export async function doctorCommand(gamePath?: string, opts: DoctorOptions = {}): Promise<void> {
  const projectDir = gamePath ? resolve(gamePath) : process.cwd();
  const installDir = normalizeInstallDir(opts.installDir ?? 'feather');
  const checks: DoctorCheck[] = [];
  const productionSeverity = (unsafe: boolean): DoctorCheck['severity'] => unsafe ? (opts.production ? 'fail' : 'warn') : 'pass';
  let symlinkEscapeCount = 0;
  let consoleIncluded = false;
  let weakApiKey = true;
  let insecureConnection = false;
  let appIdMissing = true;
  let captureScreenshot = false;
  let hotReloadEnabled = false;
  let broadHotReload = false;
  let hotReloadPersistence = false;
  let debuggerEnabled = false;
  let writeToDisk = false;
  let weakNetworkAuth = true;
  let networkExposure: 'loopback' | 'wildcard' | 'lan' | 'non-loopback' = 'loopback';
  const missingIncludedPlugins: string[] = [];
  const unknownIncludedPlugins: string[] = [];
  const installedPluginReports: SecurityPluginReport[] = [];
  const packageReports: SecurityPackageReport[] = [];
  let packageProvenanceFindings: ReturnType<typeof lockfileUrlFindings> = [];

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

  if (opts.buildTarget) {
    if (!isBuildTarget(opts.buildTarget)) {
      add(
        checks,
        'Build',
        'Build target',
        'fail',
        opts.buildTarget,
        `Use one of: ${buildTargets.join(', ')}.`,
      );
    } else {
      add(
        checks,
        'Build',
        'Build target',
        isSupportedBuildTarget(opts.buildTarget) ? 'pass' : 'warn',
        opts.buildTarget,
        isSupportedBuildTarget(opts.buildTarget)
          ? undefined
          : `${opts.buildTarget} support is planned; use web, windows, macos, linux, or steamos for now.`,
      );
    }
  }

  if (opts.uploadTarget) {
    if (!isUploadTarget(opts.uploadTarget)) {
      add(
        checks,
        'Upload',
        'Upload target',
        'fail',
        opts.uploadTarget,
        `Use one of: ${uploadTargets.join(', ')}.`,
      );
    } else {
      add(
        checks,
        'Upload',
        'Upload target',
        opts.uploadTarget === 'itch' ? 'pass' : 'warn',
        opts.uploadTarget,
        opts.uploadTarget === 'itch' ? undefined : 'Steam upload support is planned; use itch for now.',
      );
    }
  }

  const hasProjectDir = existsSync(projectDir);
  add(
    checks,
    'Project',
    'Project directory',
    hasProjectDir ? 'pass' : 'fail',
    projectDir,
    hasProjectDir ? undefined : 'Pass the game directory to `feather doctor <dir>`.',
  );

  if (hasProjectDir && (opts.buildTarget || opts.uploadTarget)) {
    try {
      const buildConfig = loadBuildConfig({ projectDir });
      const configExists = existsSync(buildConfig.configPath);
      add(
        checks,
        'Build',
        'feather.build.json',
        configExists ? 'pass' : 'warn',
        configExists ? buildConfig.configPath : 'missing',
        configExists ? undefined : 'Create feather.build.json to share local and CI build settings.',
      );
      const writable = outDirWritableDetail(buildConfig.outDir);
      add(
        checks,
        'Build',
        'Build output directory',
        writable.ok ? 'pass' : 'fail',
        writable.detail,
        writable.ok ? undefined : 'Choose a writable outDir in feather.build.json or pass --out-dir.',
      );

      if (opts.buildTarget && isBuildTarget(opts.buildTarget)) {
        if (opts.buildTarget === 'web') {
          const loveJsDir = buildConfig.targets.web?.loveJsDir;
          add(
            checks,
            'Build',
            'love.js player',
            loveJsDir && existsSync(resolve(projectDir, loveJsDir)) ? 'pass' : 'fail',
            loveJsDir ?? 'not configured',
            'Set targets.web.loveJsDir in feather.build.json to a local love.js checkout or build output.',
          );
        } else if (isSupportedBuildTarget(opts.buildTarget)) {
          const loveRelease = commandVersion('love-release', ['--version']);
          add(
            checks,
            'Build',
            'love-release',
            loveRelease ? 'pass' : 'fail',
            loveRelease ? loveRelease : 'not found',
            loveRelease ? undefined : 'Install with `luarocks install love-release` and make sure love-release is on PATH.',
          );
          const luarocks = commandVersion('luarocks', ['--version']);
          add(
            checks,
            'Build',
            'LuaRocks',
            luarocks ? 'pass' : 'warn',
            luarocks ? luarocks : 'not found',
            luarocks ? undefined : 'Install LuaRocks if you need to install love-release locally.',
          );
        }
      }

      if (opts.uploadTarget === 'itch') {
        const itchProject = buildConfig.upload.itch?.project;
        add(
          checks,
          'Upload',
          'Itch project',
          itchProject ? 'pass' : 'fail',
          itchProject ?? 'missing',
          'Set upload.itch.project in feather.build.json, for example "user/game".',
        );
        const butler = commandVersion('butler', ['--version']);
        add(
          checks,
          'Upload',
          'butler',
          butler ? 'pass' : 'fail',
          butler ? butler : 'not found',
          butler ? undefined : 'Install butler from https://itch.io/docs/butler/ and make sure it is on PATH.',
        );
        add(
          checks,
          'Upload',
          'BUTLER_API_KEY',
          process.env.BUTLER_API_KEY ? 'pass' : 'warn',
          process.env.BUTLER_API_KEY ? 'configured' : 'missing',
          process.env.BUTLER_API_KEY ? undefined : 'Set BUTLER_API_KEY in CI or run `butler login` locally.',
        );
      }
    } catch (err) {
      add(checks, 'Build', 'feather.build.json', 'fail', (err as Error).message, 'Fix feather.build.json before building or uploading.');
    }
  }

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
  const activeConfigSource = configSource ? uncommentedLua(configSource) : '';
  const includedPluginIds = configSource ? configArrayValues(activeConfigSource, 'include') : [];
  const excludedPluginIds = new Set(configSource ? configArrayValues(activeConfigSource, 'exclude') : []);
  const activeIncludedPluginIds = [...new Set(includedPluginIds.filter((id) => !excludedPluginIds.has(id)))].sort();
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
  const mode = typeof config?.mode === 'string' ? config.mode : 'socket';
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
  let pluginRootUnsafe = false;
  if (hasProjectDir) {
    const symlinkEscapes = findSymlinkEscapes(projectDir, [runtimeDir, runtimePluginRoot, sourceTreePluginRoot]);
    symlinkEscapeCount = symlinkEscapes.length;
    pluginRootUnsafe = symlinkEscapes.some((escape) => resolve(pluginRoot).startsWith(resolve(escape.path)));
    const seenEscapes = new Set<string>();
    for (const escape of symlinkEscapes) {
      const key = `${escape.path}\0${escape.target}`;
      if (seenEscapes.has(key)) continue;
      seenEscapes.add(key);
      add(
        checks,
        'Safety',
        'Symlink escape',
        'warn',
        `${escape.path} → ${escape.target}`,
        'Remove or replace symlinks that point outside the project before running update/remove or shipping.',
      );
    }
  }
  const pluginDirs = pluginRootUnsafe ? [] : findInstalledPluginDirs(pluginRoot);
  const installedPlugins = buildPluginIndex(pluginDirs);
  const knownPluginIds = new Set(pluginCatalog.map((plugin) => plugin.id));
  const pluginCatalogById = new Map(pluginCatalog.map((plugin) => [plugin.id, plugin]));
  for (const dir of pluginDirs) {
    const manifest = readPluginManifest(dir);
    const trust: PluginTrust = classifyPluginTrust(manifest, manifest?.id ? pluginCatalogById.get(manifest.id) : null);
    installedPluginReports.push({
      id: manifest?.id || dir.split(/[\\/]/).pop() || 'unknown',
      trust,
      dangerous: Boolean(manifest?.id && dangerousPluginIds.has(manifest.id)),
      malformed: trust === 'malformed',
    });
  }
  const projectDirArg = shellArg(projectDir);
  const installDirArg = shellArg(effectiveInstallDir);
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
    const malformed = pluginDirs.filter((dir) => {
      const manifest = readPluginManifest(dir);
      return !manifest?.id || !manifest.version;
    });
    const unknownInstalled = pluginDirs
      .map((dir) => ({ dir, manifest: readPluginManifest(dir) }))
      .filter((plugin) => plugin.manifest?.id && !knownPluginIds.has(plugin.manifest.id));
    if (malformed.length > 0) {
      add(
        checks,
        'Plugins',
        'Plugin manifests',
        'warn',
        `${malformed.length} missing id`,
        `Run \`feather plugin update --dir ${projectDirArg} --install-dir ${installDirArg} --yes\`.`,
      );
    } else if (pluginDirs.length > 0) {
      add(checks, 'Plugins', 'Plugin manifests', 'pass', 'all installed plugins declare an id');
    }
    for (const { dir, manifest } of unknownInstalled) {
      add(
        checks,
        'Plugins',
        `Plugin ${manifest?.id}`,
        'warn',
        `installed with ${pluginTrustLabel(classifyPluginTrust(manifest, null))} trust`,
        `Review ${dir} and remove it with \`feather plugin remove ${manifest?.id} --dir ${projectDirArg} --install-dir ${installDirArg} --yes\` if it should not ship.`,
      );
    }
    for (const dir of pluginDirs) {
      const manifest = readPluginManifest(dir);
      if (!manifest?.id || !knownPluginIds.has(manifest.id)) continue;
      const trust = classifyPluginTrust(manifest, pluginCatalogById.get(manifest.id));
      if (dangerousPluginIds.has(manifest.id)) {
        add(
          checks,
          'Plugins',
          `Plugin ${manifest.id} trust`,
          'warn',
          `${pluginTrustLabel(trust)}; development-only`,
          `Remove before shipping with \`feather plugin remove ${manifest.id} --dir ${projectDirArg} --install-dir ${installDirArg} --yes\`.`,
        );
      } else {
        add(checks, 'Plugins', `Plugin ${manifest.id} trust`, trust === 'bundled-opt-in' ? 'info' : 'pass', pluginTrustLabel(trust));
      }
    }
  }

  for (const id of activeIncludedPluginIds) {
    if (!knownPluginIds.has(id)) {
      unknownIncludedPlugins.push(id);
      add(
        checks,
        'Plugins',
        `Plugin ${id}`,
        'warn',
        'included but unknown',
        `Remove or correct "${id}" in feather.config.lua include.`,
      );
      continue;
    }

    if (!installedPlugins.has(id)) {
      missingIncludedPlugins.push(id);
      add(
        checks,
        'Plugins',
        `Plugin ${id}`,
        'warn',
        'included but not installed',
        `Run \`feather plugin install ${id} --dir ${projectDirArg} --install-dir ${installDirArg}\`.`,
      );
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
    insecureConnection = luaBoolEnabled(activeConfigSource, '__DANGEROUS_INSECURE_CONNECTION__');
    add(
      checks,
      'Safety',
      '__DANGEROUS_INSECURE_CONNECTION__',
      productionSeverity(insecureConnection),
      insecureConnection ? 'enabled' : 'disabled',
      insecureConnection ? 'Set appId in feather.config.lua and remove __DANGEROUS_INSECURE_CONNECTION__ before sharing or shipping.' : undefined,
    );

    const appId = typeof config?.appId === 'string' ? config.appId.trim() : '';
    appIdMissing = mode !== 'disk' && !appId;
    add(
      checks,
      'Safety',
      'Desktop App ID',
      appIdMissing ? (opts.production ? 'fail' : 'warn') : 'pass',
      appIdMissing ? 'missing' : mode === 'disk' ? 'not needed for disk mode' : 'configured',
      appIdMissing ? 'Set appId in feather.config.lua before shipping socket/network builds.' : undefined,
    );

    captureScreenshot = luaBoolEnabled(activeConfigSource, 'captureScreenshot');
    add(
      checks,
      'Safety',
      'captureScreenshot',
      productionSeverity(captureScreenshot),
      captureScreenshot ? 'enabled' : 'disabled',
      captureScreenshot ? 'Set captureScreenshot = false in feather.config.lua unless you need visual error context.' : undefined,
    );

    hotReloadEnabled = /hotReload\s*=\s*\{[\s\S]*?enabled\s*=\s*true/.test(activeConfigSource);
    const hotReloadPluginIncluded = hasConfigArrayValue(activeConfigSource, 'include', 'hot-reload') || pluginDirs.some((dir) => readPluginManifest(dir)?.id === 'hot-reload');
    hotReloadPersistence = /hotReload\s*=\s*\{[\s\S]*?persistToDisk\s*=\s*true/.test(activeConfigSource);
    broadHotReload = /allow\s*=\s*\{[\s\S]*["'][^"']+\.\*["']/.test(activeConfigSource);
    add(
      checks,
      'Safety',
      'Hot reload',
      productionSeverity(hotReloadEnabled),
      hotReloadEnabled ? 'enabled' : 'disabled',
      hotReloadEnabled ? 'Set debugger.hotReload.enabled = false in feather.config.lua before shipping.' : undefined,
    );
    if (hotReloadEnabled && broadHotReload) {
      add(checks, 'Safety', 'Hot reload allowlist', opts.production ? 'fail' : 'warn', 'contains wildcard', 'Replace wildcard hot reload allow entries with exact module names in feather.config.lua.');
    }
    if (hotReloadEnabled && !hotReloadPluginIncluded) {
      add(
        checks,
        'Safety',
        'Hot reload plugin',
        'warn',
        'not included',
        `Run \`feather plugin install hot-reload --dir ${projectDirArg} --install-dir ${installDirArg}\`, or remove debugger.hotReload from feather.config.lua.`,
      );
    }
    if (hotReloadEnabled && hotReloadPersistence) {
      add(checks, 'Safety', 'Hot reload persistence', opts.production ? 'fail' : 'warn', 'persistToDisk=true', 'Set debugger.hotReload.persistToDisk = false in feather.config.lua.');
    }

    consoleIncluded = hasConfigArrayValue(activeConfigSource, 'include', 'console') || pluginDirs.some((dir) => readPluginManifest(dir)?.id === 'console');
    if (consoleIncluded) {
      const apiKey = config?.apiKey;
      weakApiKey = isWeakApiKey(apiKey);
      add(
        checks,
        'Safety',
        'Console API key',
        weakApiKey ? (opts.production ? 'fail' : 'warn') : 'pass',
        weakApiKey ? 'missing or weak' : 'configured',
        weakApiKey ? 'Set apiKey to a strong per-session secret in feather.config.lua when using Console.' : undefined,
      );
    }

    debuggerEnabled = luaBoolEnabled(activeConfigSource, 'debugger') || /debugger\s*=\s*\{[\s\S]*?enabled\s*=\s*true/.test(activeConfigSource);
    add(
      checks,
      'Safety',
      'Step debugger',
      productionSeverity(debuggerEnabled),
      debuggerEnabled ? 'enabled' : 'disabled',
      debuggerEnabled ? 'Set debugger = false in feather.config.lua unless this is a trusted development session.' : undefined,
    );

    writeToDisk = luaBoolEnabled(activeConfigSource, 'writeToDisk');
    add(
      checks,
      'Safety',
      'Disk logging',
      productionSeverity(writeToDisk),
      writeToDisk ? 'enabled' : 'disabled',
      writeToDisk ? 'Set writeToDisk = false in feather.config.lua before committing or sharing the project.' : undefined,
    );
  } else if (mode !== 'disk') {
    add(
      checks,
      'Safety',
      'Desktop App ID',
      opts.production ? 'fail' : 'warn',
      'missing',
      'Create feather.config.lua with a strong appId before shipping socket/network builds.',
    );
  }

  const lockfilePath = join(projectDir, 'feather.lock.json');
  if (existsSync(lockfilePath)) {
    try {
      const lockfile = readLockfile(projectDir);
      const auditResults = await auditLockfile(projectDir, lockfile);
      const badPackages = new Set(auditResults.filter((result) => result.status !== 'verified').map((result) => result.id));
      const registry = await loadRegistry({ offline: true });
      for (const [id, entry] of Object.entries(lockfile.packages).sort(([a], [b]) => a.localeCompare(b))) {
        packageReports.push({
          id,
          version: entry.version,
          trust: entry.trust,
          source: lockfileEntrySourceSummary(id, entry),
        });
      }
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
        badPackages.size === 0 ? undefined : `Run \`feather package install --dir ${projectDirArg}\` to restore missing or modified files.`,
      );
      for (const id of [...badPackages].sort()) {
        const packageResults = auditResults.filter((result) => result.id === id && result.status !== 'verified');
        const missing = packageResults.filter((result) => result.status === 'missing').length;
        const modified = packageResults.filter((result) => result.status === 'modified').length;
        const details = [
          missing > 0 ? `${missing} missing` : '',
          modified > 0 ? `${modified} modified` : '',
        ].filter(Boolean).join(', ');
        add(
          checks,
          'Packages',
          `Package ${id} files`,
          'warn',
          details,
          `Run \`feather package install --dir ${projectDirArg}\`.`,
        );
      }

      packageProvenanceFindings = lockfileUrlFindings(lockfile);
      const provenanceByPackage = new Map<string, typeof packageProvenanceFindings>();
      for (const finding of packageProvenanceFindings) {
        provenanceByPackage.set(finding.id, [...(provenanceByPackage.get(finding.id) ?? []), finding]);
      }
      for (const [id, findings] of [...provenanceByPackage.entries()].sort(([a], [b]) => a.localeCompare(b))) {
        const reasons = [...new Set(findings.map((finding) => finding.reason))].join(', ');
        const targets = [...new Set(findings.map((finding) => finding.target))].slice(0, 3).join(', ');
        add(
          checks,
          'Packages',
          `Package ${id} source`,
          'warn',
          `${findings.length} untrusted URL(s): ${reasons}${targets ? ` (${targets})` : ''}`,
          `Review feather.lock.json; repair only if trusted with \`feather package install --dir ${projectDirArg} --allow-untrusted\`.`,
        );
      }

      for (const [id, entry] of Object.entries(lockfile.packages).sort(([a], [b]) => a.localeCompare(b))) {
        if (entry.trust === 'experimental') continue;

        const registryEntry = registry.packages[id];
        if (!registryEntry) {
          add(
            checks,
            'Packages',
            `Package ${id} registry`,
            'warn',
            'not found in bundled registry',
            `Run \`feather package remove ${id} --dir ${projectDirArg} --yes\`, or reinstall from a trusted source.`,
          );
          continue;
        }

        if (entry.version !== registryEntry.source.tag) {
          add(
            checks,
            'Packages',
            `Package ${id} version`,
            'warn',
            `${entry.version} → ${registryEntry.source.tag}`,
            `Run \`feather package update ${id} --dir ${projectDirArg}\`.`,
          );
        }
      }
    } catch (err) {
      add(checks, 'Packages', 'Package lockfile', 'fail', (err as Error).message, 'Fix or delete feather.lock.json and reinstall packages.');
    }
  } else {
    add(checks, 'Packages', 'Package lockfile', 'info', 'not present', 'Run `feather package install <name>` to add project dependencies.');
  }

  const configuredPort = opts.port ?? (typeof config?.port === 'number' ? config.port : 4004);
  const configuredHost = opts.host ?? (typeof config?.host === 'string' ? config.host : luaStringValue(activeConfigSource, 'host')) ?? '127.0.0.1';
  if (mode !== 'disk') {
    const wildcardHost = isWildcardHost(configuredHost);
    const lanHost = isLanHost(configuredHost);
    const loopbackHost = isLoopbackHost(configuredHost);
    networkExposure = wildcardHost ? 'wildcard' : lanHost ? 'lan' : loopbackHost ? 'loopback' : 'non-loopback';
    weakNetworkAuth = !configSource || luaBoolEnabled(activeConfigSource, '__DANGEROUS_INSECURE_CONNECTION__') || !config?.appId;
    add(
      checks,
      'Safety',
      'Network host exposure',
      wildcardHost || (lanHost && weakNetworkAuth) || (!loopbackHost && opts.production && weakNetworkAuth) ? (opts.production ? 'fail' : 'warn') : 'pass',
      wildcardHost ? configuredHost : lanHost ? `${configuredHost} (LAN)` : loopbackHost ? configuredHost : `${configuredHost} (non-loopback)`,
      wildcardHost
        ? 'Use host = "127.0.0.1" for local development, or configure a strong appId before exposing Feather on a network.'
        : lanHost && weakNetworkAuth
          ? 'Set a strong appId before using a LAN-facing Feather host.'
          : !loopbackHost && weakNetworkAuth
            ? 'Use a loopback host or set a strong appId before shipping.'
            : undefined,
    );
  }

  if ((opts.production || opts.security) && hasRuntime && (!configSource || !managedMode)) {
    add(
      checks,
      'Safety',
      'Managed runtime',
      opts.production ? 'fail' : 'warn',
      'runtime present without managed init metadata',
      'Run `feather init` to regenerate managed metadata, or remove the embedded Feather runtime before shipping.',
    );
  }

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

  const displayedChecks = opts.security ? securityChecks(checks) : checks;
  const failures = displayedChecks.filter((check) => check.severity === 'fail');
  const warnings = displayedChecks.filter((check) => check.severity === 'warn');
  const securityReport = opts.security
    ? buildSecurityReport({
        checks,
        mode,
        installDir: effectiveInstallDir,
        host: configuredHost,
        port: configuredPort,
        appIdMissing,
        consoleIncluded,
        weakApiKey,
        insecureConnection,
        captureScreenshot,
        hotReloadEnabled,
        broadHotReload,
        hotReloadPersistence,
        debuggerEnabled,
        writeToDisk,
        networkExposure,
        weakNetworkAuth,
        runtimeEmbedded: hasRuntime,
        runtimeManaged: Boolean(managedMode),
        symlinkEscapes: symlinkEscapeCount,
        includedPlugins: activeIncludedPluginIds,
        missingIncludedPlugins,
        unknownIncludedPlugins,
        installedPlugins: installedPluginReports,
        packages: packageReports,
        untrustedPackageSources: packageProvenanceFindings,
      })
    : undefined;

  if (opts.json) {
    printJson({
      projectDir,
      installDir: effectiveInstallDir,
      production: Boolean(opts.production),
      security: Boolean(opts.security),
      failures: failures.length,
      warnings: warnings.length,
      checks: displayedChecks,
      ...(securityReport ? { report: securityReport } : {}),
    });
  } else {
    renderReport(displayedChecks, projectDir);
  }

  if (failures.length > 0) {
    fail('', { silent: true });
  }
}
