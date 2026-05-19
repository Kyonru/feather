import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  fetchManifest,
  getLocalPluginIds,
  getPluginIds,
  installPlugin,
  installPluginsFromLocal,
  normalizeInstallDir,
} from '../../lib/install.js';
import { fail } from '../../lib/command.js';
import { createSpinner, printMuted, printWarning } from '../../lib/output.js';
import { resolveLocalLuaRoot } from '../../lib/paths.js';
import { assertValidPluginId, pluginIdToSourceDir } from '../../lib/plugin-utils.js';
import { configPluginsCommand } from '../config.js';
import { confirmAction } from '../../ui/confirm.js';
import { type PluginSourceOptions, resolveManaged, resolvePluginProjectDir, warnDangerousPlugin } from './shared.js';

async function offerOverride(skipped: string[], label: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    printWarning(`${skipped.length} plugin(s) already installed: ${skipped.join(', ')}. Use --force to overwrite.`);
    return false;
  }
  return confirmAction({
    title: 'feather plugin install',
    label: `${skipped.length} plugin(s) already installed. Overwrite?`,
    hint: `Pass --force to skip this prompt. ${label}`,
    rows: skipped,
    defaultYes: false,
  });
}

export async function pluginInstallCommand(pluginIds: string | string[], opts: PluginSourceOptions): Promise<void> {
  const projectDir = resolvePluginProjectDir(opts.dir);
  const branch = opts.branch ?? 'main';
  const installDir = normalizeInstallDir(opts.installDir);
  const force = opts.force === true;
  const ids = (Array.isArray(pluginIds) ? pluginIds : [pluginIds]).flatMap((value) =>
    value.split(',').map((id) => id.trim()).filter(Boolean),
  );
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) {
    fail('Plugin id is required.');
  }
  for (const pluginId of uniqueIds) {
    try {
      assertValidPluginId(pluginId);
    } catch (err) {
      fail((err as Error).message);
    }
  }

  // CLI mode: plugin Lua files live in the bundled CLI runtime; only feather.config.lua
  // `include` list needs updating. `--managed cli` overrides auto-detection.
  if (resolveManaged(projectDir, installDir, opts.managed) === 'cli') {
    await configPluginsCommand({ dir: projectDir, include: uniqueIds.join(',') });
    for (const pluginId of uniqueIds) {
      warnDangerousPlugin(pluginId);
    }
    return;
  }

  if (!opts.remote) {
    const sourceRoot = resolveLocalLuaRoot(opts);
    const available = getLocalPluginIds(sourceRoot);
    for (const pluginId of uniqueIds) {
      const sourceExists = existsSync(join(sourceRoot, 'plugins', pluginIdToSourceDir(pluginId)));
      if (!available.includes(pluginId) && !sourceExists) {
        fail(`Unknown plugin: ${pluginId}`, { details: ['Available: ' + available.join(', ')] });
      }
    }

    const spinner = createSpinner(`Copying ${uniqueIds.join(', ')}…`).start();
    let result: { installed: string[]; skipped: string[] };
    try {
      result = installPluginsFromLocal(uniqueIds, sourceRoot, projectDir, installDir, undefined, force);
    } catch (err) {
      spinner.fail((err as Error).message);
      fail((err as Error).message, { cause: err, silent: true });
    }
    const { installed, skipped } = result!;
    if (installed.length > 0) {
      spinner.succeed(`Installed ${installed.join(', ')}`);
      for (const pluginId of installed) {
        warnDangerousPlugin(pluginId);
      }
    } else {
      spinner.stop();
    }
    if (skipped.length > 0) {
      const shouldOverride = await offerOverride(skipped, 'Local source.');
      if (shouldOverride) {
        const overwriteSpinner = createSpinner(`Overwriting ${skipped.join(', ')}…`).start();
        try {
          const overwriteResult = installPluginsFromLocal(skipped, sourceRoot, projectDir, installDir, undefined, true);
          overwriteSpinner.succeed(`Overwritten: ${overwriteResult.installed.join(', ')}`);
          for (const pluginId of overwriteResult.installed) {
            warnDangerousPlugin(pluginId);
          }
        } catch (err) {
          overwriteSpinner.fail((err as Error).message);
          fail((err as Error).message, { cause: err, silent: true });
        }
      } else if (process.stdin.isTTY) {
        printMuted(`Skipped: ${skipped.join(', ')}`);
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

  const available = getPluginIds(entries);
  for (const pluginId of uniqueIds) {
    if (!available.includes(pluginId)) {
      fail(`Unknown plugin: ${pluginId}`, { details: ['Available: ' + available.join(', ')] });
    }
  }

  const skippedRemote: string[] = [];
  for (const pluginId of uniqueIds) {
    const installSpinner = createSpinner(`Installing ${pluginId}…`).start();
    try {
      const result = await installPlugin(pluginId, entries, projectDir, branch, undefined, installDir, force);
      if (result.skipped) {
        installSpinner.stop();
        skippedRemote.push(pluginId);
      } else {
        installSpinner.succeed(`Installed ${pluginId}`);
        warnDangerousPlugin(pluginId);
      }
    } catch (err) {
      installSpinner.fail((err as Error).message);
      fail((err as Error).message, { cause: err, silent: true });
    }
  }

  if (skippedRemote.length > 0) {
    const shouldOverride = await offerOverride(skippedRemote, 'Remote source.');
    if (shouldOverride) {
      for (const pluginId of skippedRemote) {
        const overwriteSpinner = createSpinner(`Overwriting ${pluginId}…`).start();
        try {
          await installPlugin(pluginId, entries, projectDir, branch, undefined, installDir, true);
          overwriteSpinner.succeed(`Overwritten: ${pluginId}`);
          warnDangerousPlugin(pluginId);
        } catch (err) {
          overwriteSpinner.fail((err as Error).message);
          fail((err as Error).message, { cause: err, silent: true });
        }
      }
    } else if (process.stdin.isTTY) {
      printMuted(`Skipped: ${skippedRemote.join(', ')}`);
    }
  }
}
