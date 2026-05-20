import * as vscode from 'vscode';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadPackageCatalog, loadPluginCatalog, readInstalledPackageIds, type PackageEntry, type PluginEntry } from './catalog';
import { runCommandsInTerminal, runInTerminal } from './cli';
import { FeatherProjectProvider } from './featherPanel';
import { getProjectStatus, resolveProjectDir } from './project';
import { openBuildConfigPanel } from './buildConfigPanel';
import { ALL_RUN_TARGETS, vendorPresent, vendorLabel, vendorArg, targetIcon, type RunTarget } from './vendor';

type Pick<T extends string> = vscode.QuickPickItem & { value: T };
type PluginPick = vscode.QuickPickItem & { plugin: PluginEntry };
type PackagePick = vscode.QuickPickItem & { pkg: PackageEntry };
type InitModeValue = 'cli' | 'auto' | 'manual';
type InitSecurityMode = 'appId' | 'insecure' | 'unset';
type InitSourceMode = 'bundled' | 'remote' | 'local';
type InitPluginMode = 'default' | 'select' | 'none';

interface InitCommandPlan {
  args: string[];
}

const DEFAULT_INIT_PLUGIN_IDS = new Set(['particle-system-playground', 'shader-graph']);
const DEFAULT_INIT_PLUGIN_ID_LIST = [...DEFAULT_INIT_PLUGIN_IDS];

function workspaceRoots(): string[] {
  return vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
}

function featherConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('feather');
}

function activeProjectDir(): string | undefined {
  return resolveProjectDir(featherConfig().get<string>('projectDir'), workspaceRoots());
}

function requireProjectDir(): string | undefined {
  const root = activeProjectDir();
  if (!root) {
    vscode.window.showErrorMessage('No workspace open.');
    return undefined;
  }
  return root;
}

function ensureGitignoreEntry(dir: string, entry: string): void {
  const gitignorePath = join(dir, '.gitignore');
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, 'utf8') : '';
  const lines = existing.split('\n').map((l) => l.trimEnd());
  if (lines.some((l) => l === entry)) return;
  const updated = existing.endsWith('\n') || existing === ''
    ? existing + entry + '\n'
    : existing + '\n' + entry + '\n';
  writeFileSync(gitignorePath, updated, 'utf8');
}

function isWatchMode(): boolean {
  return featherConfig().get<boolean>('watchMode') ?? false;
}

function savedTargets(): RunTarget[] {
  return (featherConfig().get<string[]>('runTargets') ?? []) as RunTarget[];
}

function refreshProjectUi(provider: FeatherProjectProvider, updateStatus: () => void): void {
  updateStatus();
  provider.refresh();
}

function registerRefreshWatcher(
  context: vscode.ExtensionContext,
  pattern: string,
  provider: FeatherProjectProvider,
  updateStatus: () => void,
): void {
  const watcher = vscode.workspace.createFileSystemWatcher(pattern);
  context.subscriptions.push(
    watcher,
    watcher.onDidCreate(() => refreshProjectUi(provider, updateStatus)),
    watcher.onDidChange(() => refreshProjectUi(provider, updateStatus)),
    watcher.onDidDelete(() => refreshProjectUi(provider, updateStatus)),
  );
}

function pluginPick(plugin: PluginEntry, picked = false): PluginPick {
  const caps = plugin.capabilities.length > 0 ? ` · ${plugin.capabilities.join(', ')}` : '';
  return {
    label: plugin.name,
    description: plugin.id,
    detail: `${plugin.description}${caps}`,
    picked,
    plugin,
  };
}

function packagePick(pkg: PackageEntry): PackagePick {
  return {
    label: pkg.id,
    description: `${pkg.version} · ${pkg.trust}${pkg.installed ? ' · installed' : ''}`,
    detail: pkg.description,
    pkg,
  };
}

async function pickPlugins(
  context: vscode.ExtensionContext,
  placeHolder: string,
  defaultPickedIds: ReadonlySet<string> = new Set(),
): Promise<PluginEntry[] | undefined> {
  const catalog = await loadPluginCatalog(context);
  const picked = await vscode.window.showQuickPick(catalog.map((plugin) => pluginPick(plugin, defaultPickedIds.has(plugin.id))), {
    canPickMany: true,
    matchOnDescription: true,
    matchOnDetail: true,
    placeHolder,
  });
  return picked?.map((item) => item.plugin);
}

function hotReloadModuleName(root: string, filePath: string): string | undefined {
  const rel = relative(root, filePath).replace(/\\/g, '/');
  if (!rel || rel.startsWith('../') || rel === '..' || rel.startsWith('/')) return undefined;
  if (!rel.endsWith('.lua')) return undefined;
  const withoutExt = rel.slice(0, -'.lua'.length);
  const modulePath = withoutExt.endsWith('/init') ? withoutExt.slice(0, -'/init'.length) : withoutExt;
  return modulePath.split('/').filter(Boolean).join('.');
}

async function pickHotReloadAllowlist(root: string): Promise<string[] | undefined> {
  const uris = await vscode.window.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: true,
    defaultUri: vscode.Uri.file(root),
    filters: { Lua: ['lua'] },
    openLabel: 'Allow hot reload',
    title: 'Feather: Select Lua files hot reload may update',
  });
  if (!uris) return undefined;

  const modules = [...new Set(uris.map((uri) => hotReloadModuleName(root, uri.fsPath)).filter((id): id is string => Boolean(id)))];
  if (modules.length === 0) {
    vscode.window.showWarningMessage('Select Lua files inside the project folder for hot reload.');
    return undefined;
  }
  return modules;
}

function nonEmptyInput(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

async function pickInitMode(): Promise<InitModeValue | undefined> {
  const mode = await vscode.window.showQuickPick<Pick<InitModeValue>>(
    [
      { label: 'CLI mode', description: 'No game-code changes. Use Feather: Run Project.', value: 'cli' },
      { label: 'Auto mode', description: 'Patch main.lua with guarded feather.auto loader.', value: 'auto' },
      { label: 'Manual mode', description: 'Create feather.debugger.lua and guarded loader.', value: 'manual' },
    ],
    { placeHolder: 'Select init mode' },
  );
  return mode?.value;
}

async function buildInitCommandPlan(
  context: vscode.ExtensionContext,
  root: string,
  mode: InitModeValue,
): Promise<InitCommandPlan | undefined> {
  const flow = await vscode.window.showQuickPick<Pick<'quick' | 'custom'>>(
    [
      { label: 'Quick init', description: 'Default plugins, bundled runtime, local dev connection.', value: 'quick' },
      { label: 'Customize init', description: 'Choose session name, security, source, install dir, and plugins.', value: 'custom' },
    ],
    { placeHolder: 'Choose init setup' },
  );
  if (!flow) return undefined;

  if (flow.value === 'quick') {
    return {
      args: [
        'init',
        root,
        '--mode',
        mode,
        '--yes',
        '--allow-insecure-connection',
        '--plugins',
        DEFAULT_INIT_PLUGIN_ID_LIST.join(','),
      ],
    };
  }

  const args = ['init', root, '--mode', mode, '--yes'];

  const sessionName = nonEmptyInput(await vscode.window.showInputBox({
    prompt: 'Session name shown in Feather (optional)',
    value: '',
    placeHolder: 'My Game',
  }));
  if (sessionName) args.push('--session-name', sessionName);

  const security = await vscode.window.showQuickPick<Pick<InitSecurityMode>>(
    [
      { label: 'Desktop App ID', description: 'Restrict commands to your Feather desktop app.', value: 'appId' },
      { label: 'Insecure local dev', description: 'Allow any desktop connection. Use only for trusted development.', value: 'insecure' },
      { label: 'Leave unset', description: 'Doctor will warn until appId or insecure mode is configured.', value: 'unset' },
    ],
    { placeHolder: 'Select connection security' },
  );
  if (!security) return undefined;
  if (security.value === 'appId') {
    const appId = nonEmptyInput(await vscode.window.showInputBox({
      prompt: 'Desktop App ID from Feather Settings > Security',
      placeHolder: 'feather-app-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      validateInput: (value) => value.trim() ? undefined : 'App ID cannot be empty',
    }));
    if (!appId) return undefined;
    args.push('--app-id', appId);
  } else if (security.value === 'insecure') {
    args.push('--allow-insecure-connection');
  }

  const source = await vscode.window.showQuickPick<Pick<InitSourceMode>>(
    [
      { label: 'Bundled runtime', description: 'Use the runtime packaged with this extension/CLI.', value: 'bundled' },
      { label: 'GitHub branch or tag', description: 'Download runtime files from GitHub.', value: 'remote' },
      { label: 'Local src-lua folder', description: 'Copy runtime files from a local source checkout.', value: 'local' },
    ],
    { placeHolder: 'Select runtime source' },
  );
  if (!source) return undefined;
  if (source.value === 'remote') {
    const branch = nonEmptyInput(await vscode.window.showInputBox({
      prompt: 'GitHub branch or tag',
      value: 'main',
      validateInput: (value) => value.trim() ? undefined : 'Branch cannot be empty',
    }));
    if (!branch) return undefined;
    args.push('--remote', '--branch', branch);
  } else if (source.value === 'local') {
    const uris = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      defaultUri: vscode.Uri.file(root),
      openLabel: 'Use src-lua',
      title: 'Feather: Select local src-lua folder',
    });
    const localSrc = uris?.[0]?.fsPath;
    if (!localSrc) return undefined;
    args.push('--local-src', localSrc);
  }

  const pluginMode = await vscode.window.showQuickPick<Pick<InitPluginMode>>(
    [
      { label: 'Default creative plugins', description: DEFAULT_INIT_PLUGIN_ID_LIST.join(', '), value: 'default' },
      { label: 'Select plugins', description: 'Choose exactly which plugins init should include.', value: 'select' },
      { label: 'No plugins', description: 'Create Feather config/runtime only.', value: 'none' },
    ],
    { placeHolder: 'Select plugin setup' },
  );
  if (!pluginMode) return undefined;

  let pluginIds = pluginMode.value === 'default' ? DEFAULT_INIT_PLUGIN_ID_LIST : [];
  if (pluginMode.value === 'none') {
    args.push('--no-plugins');
  } else if (pluginMode.value === 'select') {
    const plugins = await pickPlugins(context, 'Select plugins to install now', DEFAULT_INIT_PLUGIN_IDS);
    if (!plugins) return undefined;
    pluginIds = plugins.map((plugin) => plugin.id);
  }

  const hotReloadAllow = pluginIds.includes('hot-reload') ? await pickHotReloadAllowlist(root) : undefined;
  if (pluginIds.includes('hot-reload') && !hotReloadAllow) return undefined;
  if (pluginIds.length > 0) args.push('--plugins', pluginIds.join(','));
  if (hotReloadAllow && hotReloadAllow.length > 0) args.push('--hot-reload-allow', hotReloadAllow.join(','));

  return { args };
}

async function pickTargets(currentTargets: RunTarget[], watchMode: boolean): Promise<RunTarget[] | undefined> {
  const available = watchMode
    ? ALL_RUN_TARGETS.filter((t) => t !== 'web')
    : ALL_RUN_TARGETS;

  type TargetPick = vscode.QuickPickItem & { target: RunTarget };
  const items: TargetPick[] = available.map((t) => ({
    label: `$(${targetIcon(t)}) ${t}`,
    target: t,
    picked: currentTargets.includes(t),
    description: t === 'web' && watchMode ? 'not available in watch mode' : undefined,
  }));

  const picked = await vscode.window.showQuickPick<TargetPick>(items, {
    canPickMany: true,
    placeHolder: `Select run targets${watchMode ? ' (watch mode — web excluded)' : ''}`,
    title: 'Feather: Select Run Targets',
  });
  return picked?.map((i) => i.target);
}

async function registerCommands(
  context: vscode.ExtensionContext,
  provider: FeatherProjectProvider,
  updateStatus: () => void,
): Promise<void> {
  // ── Run / Watch ───────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.run', async () => {
      const root = requireProjectDir();
      if (!root) return;

      const cfg = featherConfig();
      let targets = savedTargets();

      if (targets.length === 0) {
        const picked = await pickTargets([], isWatchMode());
        if (!picked || picked.length === 0) return;
        targets = picked;
        await cfg.update('runTargets', targets, vscode.ConfigurationTarget.Workspace);
        updateStatus();
        provider.refresh();
      }

      // Vendor check
      const missingVendors = targets.filter((t) => !vendorPresent(root, t));
      if (missingVendors.length > 0) {
        const names = missingVendors.map(vendorLabel).join(', ');
        const action = await vscode.window.showWarningMessage(
          `Missing vendor files for: ${names}.`,
          { modal: false },
          'Fetch Vendors',
          'Run Anyway',
          'Change Targets',
        );
        if (!action) return;
        if (action === 'Change Targets') {
          await vscode.commands.executeCommand('feather.selectTargets');
          return;
        }
        if (action === 'Fetch Vendors') {
          const savedVendorDir = featherConfig().get<string>('vendorDir')?.trim() ?? root;
          for (const t of missingVendors) {
            const arg = vendorArg(t)!;
            runInTerminal(context, `Feather: Vendor (${t})`, ['build', 'vendor', 'add', arg, '--dir', savedVendorDir], savedVendorDir);
          }
          return;
        }
        // 'Run Anyway' falls through
      }

      const watchMode = isWatchMode();
      const love = cfg.get<string>('loveExecutable')?.trim();
      for (const target of targets) {
        const label = targets.length > 1 ? ` (${target})` : '';
        if (watchMode) {
          if (target === 'web') {
            vscode.window.showInformationMessage('Watch mode does not support web — skipping web target.');
            continue;
          }
          const args = ['watch', '--target', target, root];
          if (love && target === 'desktop') args.push('--love', love);
          runInTerminal(context, `Feather: Watch${label}`, args, root);
        } else {
          const args = ['run', '--target', target, root];
          if (love && target === 'desktop') args.push('--love', love);
          runInTerminal(context, `Feather: Run${label}`, args, root);
        }
      }
    }),
  );

  // ── Select targets ────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.selectTargets', async () => {
      const picked = await pickTargets(savedTargets(), isWatchMode());
      if (!picked) return;
      await featherConfig().update('runTargets', picked, vscode.ConfigurationTarget.Workspace);
      updateStatus();
      provider.refresh();
    }),
  );

  // ── Toggle watch ──────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.toggleWatch', async () => {
      const next = !isWatchMode();
      await featherConfig().update('watchMode', next, vscode.ConfigurationTarget.Workspace);
      updateStatus();
      provider.refresh();
    }),
  );

  // ── Configure ─────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.configure', async () => {
      const cfg = featherConfig();
      const projectDir = cfg.get<string>('projectDir') || '';
      const loveExec = cfg.get<string>('loveExecutable') || '';
      const uploadTarget = cfg.get<string>('defaultUploadTarget') || 'itch';
      const uploadChannel = cfg.get<string>('defaultUploadChannel') || '';
      const watchMode = cfg.get<boolean>('watchMode') ?? false;

      type SettingPick = vscode.QuickPickItem & { key: string };
      const setting = await vscode.window.showQuickPick<SettingPick>(
        [
          {
            label: '$(folder) Project directory',
            description: projectDir || '(workspace root)',
            detail: 'Folder containing main.lua and feather.config.lua',
            key: 'projectDir',
          },
          {
            label: '$(terminal) LÖVE executable',
            description: loveExec || '(auto-detect)',
            detail: 'Path to the love2d binary',
            key: 'loveExecutable',
          },
          {
            label: '$(cloud-upload) Upload target',
            description: uploadTarget,
            detail: 'Default target for Feather: Upload Build (e.g. itch, steam)',
            key: 'defaultUploadTarget',
          },
          {
            label: '$(tag) Upload channel',
            description: uploadChannel || '(none)',
            detail: 'Default channel passed to uploads',
            key: 'defaultUploadChannel',
          },
          {
            label: watchMode ? '$(eye) Watch mode: ON' : '$(eye-closed) Watch mode: OFF',
            description: 'Toggle between run and watch when clicking Run Project',
            key: 'watchMode',
          },
        ],
        { placeHolder: 'Select a setting to configure', matchOnDescription: true, matchOnDetail: true },
      );
      if (!setting) return;

      if (setting.key === 'projectDir') {
        const uris = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          openLabel: 'Select project directory',
          title: 'Feather: Select LÖVE project directory',
        });
        if (!uris || uris.length === 0) return;
        await cfg.update('projectDir', uris[0].fsPath, vscode.ConfigurationTarget.Workspace);
      } else if (setting.key === 'loveExecutable') {
        const choice = await vscode.window.showQuickPick<Pick<'browse' | 'clear'>>(
          [
            { label: '$(folder-opened) Browse…', value: 'browse' },
            { label: '$(trash) Clear (use auto-detect)', value: 'clear' },
          ],
          { placeHolder: loveExec || 'Select action' },
        );
        if (!choice) return;
        if (choice.value === 'clear') {
          await cfg.update('loveExecutable', '', vscode.ConfigurationTarget.Workspace);
        } else {
          const uris = await vscode.window.showOpenDialog({
            canSelectFolders: false,
            canSelectFiles: true,
            canSelectMany: false,
            openLabel: 'Select LÖVE executable',
            title: 'Feather: Select LÖVE executable',
          });
          if (!uris || uris.length === 0) return;
          await cfg.update('loveExecutable', uris[0].fsPath, vscode.ConfigurationTarget.Workspace);
        }
      } else if (setting.key === 'defaultUploadTarget') {
        const target = await vscode.window.showInputBox({
          prompt: 'Upload target (e.g. itch, steam)',
          value: uploadTarget,
          validateInput: (v) => v.trim() ? undefined : 'Target cannot be empty',
        });
        if (target === undefined) return;
        await cfg.update('defaultUploadTarget', target.trim(), vscode.ConfigurationTarget.Workspace);
      } else if (setting.key === 'defaultUploadChannel') {
        const channel = await vscode.window.showInputBox({
          prompt: 'Upload channel (leave empty to unset)',
          value: uploadChannel,
        });
        if (channel === undefined) return;
        await cfg.update('defaultUploadChannel', channel || '', vscode.ConfigurationTarget.Workspace);
      } else if (setting.key === 'watchMode') {
        await cfg.update('watchMode', !watchMode, vscode.ConfigurationTarget.Workspace);
      }

      updateStatus();
      provider.refresh();
    }),
  );

  // ── Build config panel ────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.buildConfig', () => {
      const root = requireProjectDir();
      if (!root) return;
      openBuildConfigPanel(context, root);
    }),
  );

  // ── Init ──────────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.init', async () => {
      const root = requireProjectDir();
      if (!root) return;

      const mode = await pickInitMode();
      if (!mode) return;

      const plan = await buildInitCommandPlan(context, root, mode);
      if (!plan) return;

      runInTerminal(context, 'Feather: Init', plan.args, root);
      refreshProjectUi(provider, updateStatus);
      setTimeout(() => refreshProjectUi(provider, updateStatus), 1500);
    }),
  );

  // ── Doctor ────────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.doctor', () => {
      const root = requireProjectDir();
      if (!root) return;
      runInTerminal(context, 'Feather: Doctor', ['doctor', root], root);
      provider.refresh();
    }),
  );

  // ── Plugins ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.plugins', async () => {
      const root = requireProjectDir();
      if (!root) return;
      const action = await vscode.window.showQuickPick<Pick<'install' | 'update' | 'remove'>>(
        [
          { label: 'Install plugins', description: 'Copy plugins into the project and include them in config.', value: 'install' },
          { label: 'Update plugins', description: 'Refresh installed plugin files from the bundled runtime.', value: 'update' },
          { label: 'Remove plugins', description: 'Delete plugin folders and exclude them in config.', value: 'remove' },
        ],
        { placeHolder: 'Plugin action' },
      );
      if (!action) return;

      const plugins = await pickPlugins(context, `Select plugins to ${action.value}`);
      if (!plugins || plugins.length === 0) return;
      const ids = plugins.map((plugin) => plugin.id);
      const hotReloadAllow = action.value === 'install' && ids.includes('hot-reload')
        ? await pickHotReloadAllowlist(root)
        : undefined;
      if (action.value === 'install' && ids.includes('hot-reload') && !hotReloadAllow) return;
      const commands =
        action.value === 'install'
          ? [
              ['plugin', 'install', ...ids, '--dir', root],
              ['config', 'plugins', '--dir', root, '--include', ids.join(',')],
              ...(hotReloadAllow && hotReloadAllow.length > 0
                ? [['config', 'hot-reload', '--dir', root, '--allow', hotReloadAllow.join(',')]]
                : []),
            ]
          : action.value === 'remove'
            ? [
                ...ids.map((id) => ['plugin', 'remove', id, '--dir', root, '--yes']),
                ['config', 'plugins', '--dir', root, '--exclude', ids.join(',')],
              ]
            : ids.map((id) => ['plugin', 'update', id, '--dir', root, '--yes']);

      runCommandsInTerminal(context, `Feather: Plugins ${action.value}`, commands, root);
      refreshProjectUi(provider, updateStatus);
      setTimeout(() => refreshProjectUi(provider, updateStatus), 1500);
    }),
  );

  // ── Packages ──────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.packages', async () => {
      const root = requireProjectDir();
      if (!root) return;
      const installedIds = readInstalledPackageIds(root);
      const packages = loadPackageCatalog(context, installedIds);
      const selected = await vscode.window.showQuickPick(packages.map(packagePick), {
        canPickMany: true,
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: 'Select package(s)',
      });
      if (!selected || selected.length === 0) return;

      if (selected.length > 1) {
        const ids = selected.map((item) => item.pkg.id);
        runInTerminal(context, 'Feather: Package install', ['package', 'install', ...ids, '--dir', root, '--yes'], root);
        provider.refresh();
        setTimeout(() => provider.refresh(), 1500);
        return;
      }

      const pkg = selected[0].pkg;
      const action = await vscode.window.showQuickPick<Pick<'install' | 'update' | 'remove'>>(
        pkg.installed
          ? [
              { label: 'Update', description: pkg.version, value: 'update' },
              { label: 'Remove', description: 'Delete package files and lockfile entry.', value: 'remove' },
            ]
          : [
              { label: 'Install', description: pkg.version, value: 'install' },
            ],
        { placeHolder: `${pkg.id}: choose action` },
      );
      if (!action) return;

      const command =
        action.value === 'remove'
          ? ['package', 'remove', pkg.id, '--dir', root, '--yes']
          : action.value === 'update'
            ? ['package', 'update', pkg.id, '--dir', root]
            : ['package', 'install', pkg.id, '--dir', root, '--yes'];
      runInTerminal(context, `Feather: Package ${action.value}`, command, root);
      provider.refresh();
      setTimeout(() => provider.refresh(), 1500);
    }),
  );

  // ── Vendor ────────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.vendor', async () => {
      const root = requireProjectDir();
      if (!root) return;
      const action = await vscode.window.showQuickPick<Pick<'add' | 'list'>>(
        [
          { label: 'Add vendor templates', description: 'Fetch build vendor templates into the project.', value: 'add' },
          { label: 'List vendors', description: 'Show configured build vendors.', value: 'list' },
        ],
        { placeHolder: 'Vendor action' },
      );
      if (!action) return;

      if (action.value === 'list') {
        runInTerminal(context, 'Feather: Vendor list', ['build', 'vendor', 'list', root], root);
        return;
      }

      const vendor = await vscode.window.showQuickPick<Pick<'all' | 'web' | 'android' | 'ios' | 'desktop'>>(
        [
          { label: 'All vendors', value: 'all' },
          { label: 'Web', value: 'web' },
          { label: 'Android', value: 'android' },
          { label: 'iOS', value: 'ios' },
          { label: 'Desktop (Windows, macOS, Linux)', value: 'desktop' },
        ],
        { placeHolder: 'Select vendor targets to fetch' },
      );
      if (!vendor) return;

      const cfg = featherConfig();
      const savedVendorDir = cfg.get<string>('vendorDir')?.trim();

      let vendorDir: string;
      if (savedVendorDir) {
        vendorDir = savedVendorDir;
      } else {
        const defaultUri = vscode.Uri.file(root);
        const dirUris = await vscode.window.showOpenDialog({
          canSelectFolders: true,
          canSelectFiles: false,
          canSelectMany: false,
          defaultUri,
          openLabel: 'Install vendors here',
          title: 'Select vendor installation directory',
        });
        vendorDir = dirUris?.[0]?.fsPath ?? root;
        await cfg.update('vendorDir', vendorDir, vscode.ConfigurationTarget.Workspace);
      }

      ensureGitignoreEntry(vendorDir, '/vendor');
      runInTerminal(context, 'Feather: Vendor add', ['build', 'vendor', 'add', vendor.value, '--dir', vendorDir], vendorDir);
    }),
  );

  // ── Upload ────────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.upload', async () => {
      const root = requireProjectDir();
      if (!root) return;
      const dryRun = await vscode.window.showQuickPick<Pick<'dry' | 'upload'>>(
        [
          { label: 'Dry run', description: 'Show the upload plan without running the uploader.', value: 'dry' },
          { label: 'Upload', description: 'Run the uploader after confirmation.', value: 'upload' },
        ],
        { placeHolder: 'Upload mode' },
      );
      if (!dryRun) return;

      if (dryRun.value === 'upload') {
        const confirmed = await vscode.window.showWarningMessage('Upload this build?', { modal: true }, 'Upload');
        if (confirmed !== 'Upload') return;
      }

      const build = await vscode.window.showQuickPick<Pick<'none' | 'web' | 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'steamos'>>(
        [
          { label: 'Use existing build', description: 'Upload from feather-build-manifest.json.', value: 'none' },
          { label: 'Build web first', value: 'web' },
          { label: 'Build Windows first', value: 'windows' },
          { label: 'Build macOS first', value: 'macos' },
          { label: 'Build Linux first', value: 'linux' },
          { label: 'Build Android first', value: 'android' },
          { label: 'Build iOS first', value: 'ios' },
          { label: 'Build SteamOS first', value: 'steamos' },
        ],
        { placeHolder: 'Build before upload?' },
      );
      if (!build) return;

      const target = featherConfig().get<string>('defaultUploadTarget')?.trim() || 'itch';
      const channel = featherConfig().get<string>('defaultUploadChannel')?.trim();
      const args = ['upload', target];
      if (build.value !== 'none') args.push(build.value, '--build');
      args.push('--dir', root, '--yes');
      if (dryRun.value === 'dry') args.push('--dry-run');
      if (channel) args.push('--channel', channel);
      runInTerminal(context, 'Feather: Upload', args, root);
    }),
  );

  // ── Remove ────────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.remove', async () => {
      const root = requireProjectDir();
      if (!root) return;
      const confirmed = await vscode.window.showWarningMessage('Remove Feather from this project?', { modal: true }, 'Remove');
      if (confirmed !== 'Remove') return;
      runInTerminal(context, 'Feather: Remove', ['remove', root, '--yes'], root);
      refreshProjectUi(provider, updateStatus);
      setTimeout(() => refreshProjectUi(provider, updateStatus), 1500);
    }),
  );

  // ── Update ────────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.update', () => {
      const root = requireProjectDir();
      if (!root) return;
      runInTerminal(context, 'Feather: Update', ['update', root, '--yes'], root);
      refreshProjectUi(provider, updateStatus);
      setTimeout(() => refreshProjectUi(provider, updateStatus), 1500);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('feather.refreshProjectView', () => provider.refresh()),
  );
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  try {
    const provider = new FeatherProjectProvider(() => ({
      status: getProjectStatus(activeProjectDir()),
      watchMode: isWatchMode(),
      targets: savedTargets(),
    }));
    vscode.window.registerTreeDataProvider('feather.projectView', provider);

    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    const updateStatus = () => {
      const status = getProjectStatus(activeProjectDir());
      const watchMode = isWatchMode();
      const targets = savedTargets();
      const targetStr = targets.length > 0 ? ` · ${targets.join(', ')}` : '';
      if (!status.hasConfig) {
        statusItem.text = '$(zap) Feather: Init';
        statusItem.tooltip = 'Initialize Feather project';
        statusItem.command = 'feather.init';
      } else if (watchMode) {
        statusItem.text = `$(eye) Feather Watch${targetStr}`;
        statusItem.tooltip = `Watching (${targets.join(', ') || 'no targets'}) — click to run`;
        statusItem.command = 'feather.run';
      } else {
        statusItem.text = `$(zap) Feather${targetStr}`;
        statusItem.tooltip = `Run Feather (${targets.join(', ') || 'no target selected'})`;
        statusItem.command = 'feather.run';
      }
    };
    updateStatus();
    statusItem.show();
    registerRefreshWatcher(context, '**/feather.config.lua', provider, updateStatus);
    registerRefreshWatcher(context, '**/.featherrc.lua', provider, updateStatus);
    registerRefreshWatcher(context, '**/feather.lock.json', provider, updateStatus);
    registerRefreshWatcher(context, '**/feather/plugins/**', provider, updateStatus);

    context.subscriptions.push(
      statusItem,
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        refreshProjectUi(provider, updateStatus);
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('feather.projectDir') ||
          event.affectsConfiguration('feather.watchMode') ||
          event.affectsConfiguration('feather.runTargets')
        ) {
          refreshProjectUi(provider, updateStatus);
        }
      }),
    );

    await registerCommands(context, provider, updateStatus);
  } catch (err) {
    vscode.window.showErrorMessage(`Feather failed to activate: ${(err as Error).message ?? err}`);
    throw err;
  }
}

export function deactivate(): void {}
