import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  fetchManifest,
  getLocalPluginIds,
  getPluginIds,
  installPlugin,
  installPluginsFromLocal,
} from '../../lib/install.js';
import { fail } from '../../lib/command.js';
import { createSpinner, printMuted } from '../../lib/output.js';
import { resolveLocalLuaRoot } from '../../lib/paths.js';
import { assertValidPluginId, pluginIdToSourceDir } from '../../lib/plugin-utils.js';
import { choosePluginUpdateWorkflow } from '../../ui/plugin-workflow.js';
import { getInstalledPluginIds, pluginsDir, resolveManaged, resolvePluginProjectDir, warnDangerousPlugin } from './shared.js';

export async function pluginUpdateCommand(
  pluginId: string | undefined,
  opts: { dir?: string; branch?: string; installDir?: string; remote?: boolean; localSrc?: string; yes?: boolean; managed?: string },
): Promise<void> {
  const projectDir = resolvePluginProjectDir(opts.dir);
  const branch = opts.branch ?? 'main';
  const installDir = opts.installDir ?? 'feather';

  if (resolveManaged(projectDir, installDir, opts.managed) === 'cli') {
    printMuted('CLI-managed project: plugins are bundled in the Feather CLI binary. Update the CLI to get the latest plugins.');
    return;
  }
  const dirPath = pluginsDir(projectDir, installDir);
  if (pluginId) {
    try {
      assertValidPluginId(pluginId);
    } catch (err) {
      fail((err as Error).message);
    }
  }

  const hasExplicitSource = opts.remote === true || !!opts.localSrc || opts.yes === true;
  if (!pluginId && process.stdin.isTTY && !hasExplicitSource) {
    const installedIds = getInstalledPluginIds(projectDir, installDir);
    if (installedIds.length === 0) {
      printMuted('No plugins installed.');
      return;
    }

    const result = await choosePluginUpdateWorkflow({
      installedIds,
      defaultBranch: branch,
    });

    if (result.action === 'cancel') return;
    if (result.action !== 'update' || result.pluginIds.length === 0) {
      printMuted('No plugins selected.');
      return;
    }

    for (const id of result.pluginIds) {
      await pluginUpdateCommand(id, {
        dir: projectDir,
        branch: result.branch,
        installDir,
        remote: result.source === 'remote',
        localSrc: opts.localSrc,
        yes: true,
      });
    }
    return;
  }

  if (!opts.remote) {
    const sourceRoot = resolveLocalLuaRoot(opts);
    const available = getLocalPluginIds(sourceRoot);
    const ids = pluginId ? [pluginId] : available.filter((id) => existsSync(join(dirPath, id.replace(/\./g, '/'))));
    if (pluginId && !available.includes(pluginId) && !existsSync(join(sourceRoot, 'plugins', pluginIdToSourceDir(pluginId)))) {
      fail(`Unknown plugin: ${pluginId}`, { details: ['Available: ' + available.join(', ')] });
    }

    for (const id of ids) {
      const s = createSpinner(`Updating ${id}…`).start();
      try {
        installPluginsFromLocal([id], sourceRoot, projectDir, installDir);
        s.succeed(`Updated ${id}`);
        warnDangerousPlugin(id);
      } catch (err) {
        s.fail(`${id}: ${(err as Error).message}`);
        if (pluginId) fail((err as Error).message, { cause: err, silent: true });
      }
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

  const ids = pluginId ? [pluginId] : getPluginIds(entries).filter((id) =>
    existsSync(join(dirPath, id.replace(/\./g, '/')))
  );

  for (const id of ids) {
    const s = createSpinner(`Updating ${id}…`).start();
    try {
      await installPlugin(id, entries, projectDir, branch, undefined, installDir);
      s.succeed(`Updated ${id}`);
      warnDangerousPlugin(id);
    } catch (err) {
      s.fail(`${id}: ${(err as Error).message}`);
      if (pluginId) fail((err as Error).message, { cause: err, silent: true });
    }
  }
}
