import * as vscode from 'vscode';
import { loadPackageCatalog, loadPluginCatalog, readInstalledPackageIds, type PackageEntry, type PluginEntry } from './catalog';
import { runCommandsInTerminal, runInTerminal } from './cli';
import { FeatherProjectProvider } from './featherPanel';
import { getProjectStatus, resolveProjectDir } from './project';
import { openBuildConfigPanel } from './buildConfigPanel';
import { ALL_RUN_TARGETS, vendorPresent, vendorLabel, vendorArg, targetIcon, type RunTarget } from './vendor';

type Pick<T extends string> = vscode.QuickPickItem & { value: T };
type PluginPick = vscode.QuickPickItem & { plugin: PluginEntry };
type PackagePick = vscode.QuickPickItem & { pkg: PackageEntry };

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

function isWatchMode(): boolean {
  return featherConfig().get<boolean>('watchMode') ?? false;
}

function savedTargets(): RunTarget[] {
  return (featherConfig().get<string[]>('runTargets') ?? []) as RunTarget[];
}

function pluginPick(plugin: PluginEntry): PluginPick {
  const caps = plugin.capabilities.length > 0 ? ` · ${plugin.capabilities.join(', ')}` : '';
  return {
    label: plugin.name,
    description: plugin.id,
    detail: `${plugin.description}${caps}`,
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

async function pickPlugins(context: vscode.ExtensionContext, placeHolder: string): Promise<PluginEntry[] | undefined> {
  const catalog = await loadPluginCatalog(context);
  const picked = await vscode.window.showQuickPick(catalog.map(pluginPick), {
    canPickMany: true,
    matchOnDescription: true,
    matchOnDetail: true,
    placeHolder,
  });
  return picked?.map((item) => item.plugin);
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
          for (const t of missingVendors) {
            const arg = vendorArg(t)!;
            runInTerminal(context, `Feather: Vendor (${t})`, ['build', 'vendor', 'add', arg, '--dir', root], root);
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

      const mode = await vscode.window.showQuickPick<Pick<'cli' | 'auto' | 'manual'>>(
        [
          { label: 'CLI mode', description: 'No game-code changes. Use Feather: Run Project.', value: 'cli' },
          { label: 'Auto mode', description: 'Patch main.lua with guarded feather.auto loader.', value: 'auto' },
          { label: 'Manual mode', description: 'Create feather.debugger.lua and guarded loader.', value: 'manual' },
        ],
        { placeHolder: 'Select init mode' },
      );
      if (!mode) return;

      const plugins = await pickPlugins(context, 'Select plugins to install now');
      if (!plugins) return;

      const args = ['init', root, '--mode', mode.value, '--yes', '--allow-insecure-connection'];
      if (plugins.length > 0) args.push('--plugins', plugins.map((plugin) => plugin.id).join(','));
      runInTerminal(context, 'Feather: Init', args, root);
      provider.refresh();
      setTimeout(() => provider.refresh(), 1500);
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
      const commands =
        action.value === 'install'
          ? [
              ...ids.map((id) => ['plugin', 'install', id, '--dir', root]),
              ['config', 'plugins', '--dir', root, '--include', ids.join(',')],
            ]
          : action.value === 'remove'
            ? [
                ...ids.map((id) => ['plugin', 'remove', id, '--dir', root, '--yes']),
                ['config', 'plugins', '--dir', root, '--exclude', ids.join(',')],
              ]
            : ids.map((id) => ['plugin', 'update', id, '--dir', root, '--yes']);

      runCommandsInTerminal(context, `Feather: Plugins ${action.value}`, commands, root);
      provider.refresh();
      setTimeout(() => provider.refresh(), 1500);
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
        matchOnDescription: true,
        matchOnDetail: true,
        placeHolder: 'Select a package',
      });
      if (!selected) return;
      const action = await vscode.window.showQuickPick<Pick<'install' | 'update' | 'remove'>>(
        selected.pkg.installed
          ? [
              { label: 'Update', description: selected.pkg.version, value: 'update' },
              { label: 'Remove', description: 'Delete package files and lockfile entry.', value: 'remove' },
            ]
          : [
              { label: 'Install', description: selected.pkg.version, value: 'install' },
            ],
        { placeHolder: `${selected.pkg.id}: choose action` },
      );
      if (!action) return;

      const command =
        action.value === 'remove'
          ? ['package', 'remove', selected.pkg.id, '--dir', root, '--yes']
          : action.value === 'update'
            ? ['package', 'update', selected.pkg.id, '--dir', root]
            : ['package', 'install', selected.pkg.id, '--dir', root, '--yes'];
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

      runInTerminal(context, 'Feather: Vendor add', ['build', 'vendor', 'add', vendor.value, '--dir', root], root);
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
      provider.refresh();
      setTimeout(() => provider.refresh(), 1500);
    }),
  );

  // ── Update ────────────────────────────────────────────────────────────────
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.update', () => {
      const root = requireProjectDir();
      if (!root) return;
      runInTerminal(context, 'Feather: Update', ['update', root, '--yes'], root);
      provider.refresh();
      setTimeout(() => provider.refresh(), 1500);
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

    context.subscriptions.push(
      statusItem,
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        updateStatus();
        provider.refresh();
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('feather.projectDir') ||
          event.affectsConfiguration('feather.watchMode') ||
          event.affectsConfiguration('feather.runTargets')
        ) {
          updateStatus();
          provider.refresh();
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
