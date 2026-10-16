import * as vscode from 'vscode';
import { loadPluginCatalog, type PluginEntry } from '../catalog';
import { pluginsPlan, type PluginAction } from '../plans';
import { hotReloadModuleName } from '../settings';
import { register, type Pick, type Services } from './context';

type PluginPick = vscode.QuickPickItem & { plugin: PluginEntry };

export async function pickPlugins(
  services: Services,
  placeHolder: string,
  preselected: ReadonlySet<string> = new Set(),
  only?: ReadonlySet<string>,
): Promise<PluginEntry[] | undefined> {
  const catalog = loadPluginCatalog(services.context.extensionPath).filter((plugin) => !only || only.has(plugin.id));
  const picked = await vscode.window.showQuickPick<PluginPick>(
    catalog.map((plugin) => ({
      label: plugin.name,
      description: plugin.id,
      detail: `${plugin.description}${plugin.capabilities.length > 0 ? ` · ${plugin.capabilities.join(', ')}` : ''}`,
      picked: preselected.has(plugin.id),
      plugin,
    })),
    { canPickMany: true, matchOnDescription: true, matchOnDetail: true, placeHolder },
  );
  return picked?.map((item) => item.plugin);
}

export async function pickHotReloadAllowlist(root: string): Promise<string[] | undefined> {
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
    void vscode.window.showWarningMessage('Select Lua files inside the project folder for hot reload.');
    return undefined;
  }
  return modules;
}

export function registerPluginWorkflow(services: Services): void {
  register(services, 'feather.plugins', async () => {
    const root = await services.project.requireRoot();
    if (!root) return;
    // The managed mode is what the CLI resolved (`plugin list --json`), not a
    // regex over feather.config.lua.
    const state = services.project.state?.root === root ? services.project.state : undefined;
    const managed = state?.plugins.ok ? state.plugins.value.managed : undefined;
    const installed = new Set(state?.plugins.ok ? state.plugins.value.ids : []);
    const cliManaged = managed === 'cli';

    const action = await vscode.window.showQuickPick<Pick<PluginAction>>(
      [
        {
          label: 'Install plugins',
          description: cliManaged ? 'Include bundled plugins in feather.config.lua.' : 'Copy plugins into the project and include them in config.',
          value: 'install',
        },
        { label: 'Update plugins', description: 'Refresh installed plugin files from the bundled runtime.', value: 'update' },
        {
          label: 'Remove plugins',
          description: cliManaged ? 'Remove plugins from the feather.config.lua include list.' : 'Delete plugin folders and exclude them in config.',
          value: 'remove',
        },
      ],
      { placeHolder: 'Plugin action' },
    );
    if (!action) return;

    const plugins = await pickPlugins(
      services,
      `Select plugins to ${action.value}`,
      new Set(),
      action.value === 'install' || installed.size === 0 ? undefined : installed,
    );
    if (!plugins || plugins.length === 0) return;
    const ids = plugins.map((plugin) => plugin.id);

    let hotReloadAllow: string[] = [];
    if (action.value === 'install' && ids.includes('hot-reload')) {
      const allow = await pickHotReloadAllowlist(root);
      if (!allow) return;
      hotReloadAllow = allow;
    }
    return services.jobs.run(pluginsPlan(root, action.value, ids, managed, hotReloadAllow), root);
  });
}
