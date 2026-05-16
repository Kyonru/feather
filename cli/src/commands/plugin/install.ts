import {
  fetchManifest,
  getLocalPluginIds,
  getPluginIds,
  installPlugin,
  installPluginsFromLocal,
} from '../../lib/install.js';
import { fail } from '../../lib/command.js';
import { createSpinner } from '../../lib/output.js';
import { resolveLocalLuaRoot } from '../../lib/paths.js';
import { type PluginSourceOptions, resolvePluginProjectDir } from './shared.js';

export async function pluginInstallCommand(pluginId: string, opts: PluginSourceOptions): Promise<void> {
  const projectDir = resolvePluginProjectDir(opts.dir);
  const branch = opts.branch ?? 'main';
  const installDir = opts.installDir ?? 'feather';

  if (!opts.remote) {
    const sourceRoot = resolveLocalLuaRoot(opts);
    const available = getLocalPluginIds(sourceRoot);
    if (!available.includes(pluginId)) {
      fail(`Unknown plugin: ${pluginId}`, { details: ['Available: ' + available.join(', ')] });
    }

    const spinner = createSpinner(`Copying ${pluginId}…`).start();
    try {
      installPluginsFromLocal([pluginId], sourceRoot, projectDir, installDir);
      spinner.succeed(`Installed ${pluginId}`);
    } catch (err) {
      spinner.fail((err as Error).message);
      fail((err as Error).message, { cause: err, silent: true });
    }
    return;
  }

  const spinner = createSpinner('Fetching manifest…').start();
  let entries: Awaited<ReturnType<typeof fetchManifest>>;
  try {
    entries = await fetchManifest(branch);
    spinner.succeed('Manifest loaded');
  } catch (err) {
    spinner.fail((err as Error).message);
    fail((err as Error).message, { cause: err, silent: true });
  }

  const available = getPluginIds(entries);
  if (!available.includes(pluginId)) {
    fail(`Unknown plugin: ${pluginId}`, { details: ['Available: ' + available.join(', ')] });
  }

  const installSpinner = createSpinner(`Installing ${pluginId}…`).start();
  try {
    await installPlugin(pluginId, entries, projectDir, branch, undefined, installDir);
    installSpinner.succeed(`Installed ${pluginId}`);
  } catch (err) {
    installSpinner.fail((err as Error).message);
    fail((err as Error).message, { cause: err, silent: true });
  }
}
