import * as vscode from 'vscode';
import { loadPackageCatalog, loadPluginCatalog, readInstalledPackageIds, type PackageEntry, type PluginEntry } from './catalog';
import { runCommandsInTerminal, runInTerminal } from './cli';
import { FeatherProjectProvider } from './featherPanel';
import { getProjectStatus, resolveProjectDir } from './project';

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

async function registerCommands(
  context: vscode.ExtensionContext,
  provider: FeatherProjectProvider,
): Promise<void> {
  context.subscriptions.push(
    vscode.commands.registerCommand('feather.run', () => {
      const root = requireProjectDir();
      if (!root) return;
      const args = ['run', root];
      const love = featherConfig().get<string>('loveExecutable')?.trim();
      if (love) args.push('--love', love);
      runInTerminal(context, 'Feather: Run', args, root);
    }),
  );

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

  context.subscriptions.push(
    vscode.commands.registerCommand('feather.doctor', () => {
      const root = requireProjectDir();
      if (!root) return;
      runInTerminal(context, 'Feather: Doctor', ['doctor', root], root);
      provider.refresh();
    }),
  );

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
    const provider = new FeatherProjectProvider(() => getProjectStatus(activeProjectDir()));
    vscode.window.registerTreeDataProvider('feather.projectView', provider);

    const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    const updateStatus = () => {
      const status = getProjectStatus(activeProjectDir());
      statusItem.text = status.hasConfig ? '$(zap) Feather' : '$(zap) Feather: Init';
      statusItem.tooltip = status.hasConfig ? 'Run Feather project' : 'Initialize Feather project';
      statusItem.command = status.hasConfig ? 'feather.run' : 'feather.init';
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
        if (event.affectsConfiguration('feather.projectDir')) {
          updateStatus();
          provider.refresh();
        }
      }),
    );

    await registerCommands(context, provider);
  } catch (err) {
    vscode.window.showErrorMessage(`Feather failed to activate: ${(err as Error).message ?? err}`);
    throw err;
  }
}

export function deactivate(): void {}
