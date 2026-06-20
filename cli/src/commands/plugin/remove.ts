import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fail } from '../../lib/command.js';
import { normalizeInstallDir } from '../../lib/install.js';
import { icon, printJson, printLine, printMuted } from '../../lib/output.js';
import { assertSafeProjectTarget } from '../../lib/path-safety.js';
import { pluginIdToSourceDir } from '../../lib/plugin-utils.js';
import { confirmAction } from '../../ui/confirm.js';
import { configPluginsCommand } from '../config.js';
import { pluginSummaryJson } from './json.js';
import { resolveManaged, resolvePluginProjectDir } from './shared.js';

export async function pluginRemoveCommand(
  pluginId: string,
  opts: { dir?: string; installDir?: string; yes?: boolean; managed?: string; dryRun?: boolean; json?: boolean },
): Promise<void> {
  const projectDir = resolvePluginProjectDir(opts.dir);
  const installDir = normalizeInstallDir(opts.installDir);

  if (resolveManaged(projectDir, installDir, opts.managed) === 'cli') {
    if (!opts.yes && (!process.stdin.isTTY || !process.stdout.isTTY)) {
      fail(`Refusing to remove "${pluginId}" without --yes in non-interactive mode.`);
    }
    if (!opts.yes) {
      const confirmed = await confirmAction({
        title: 'feather plugin remove',
        label: `Remove plugin "${pluginId}" from include list?`,
        hint: 'This removes the plugin from feather.config.lua (CLI-managed project).',
        danger: false,
        rows: [pluginId],
      });
      if (!confirmed) {
        printMuted('Plugin remove cancelled.');
        return;
      }
    }
    await configPluginsCommand({ dir: projectDir, exclude: pluginId, dryRun: opts.dryRun, json: opts.json });
    return;
  }

  let pluginDir: string;
  try {
    pluginDir = assertSafeProjectTarget(
      projectDir,
      join(installDir, 'plugins', pluginIdToSourceDir(pluginId)),
      'Plugin remove target',
    );
  } catch (err) {
    fail((err as Error).message);
  }

  if (!existsSync(pluginDir)) {
    fail(`Plugin not found: ${pluginId}`);
  }

  if (!opts.yes && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    fail(`Refusing to remove "${pluginId}" without --yes in non-interactive mode.`);
  }

  if (!opts.yes) {
    const confirmed = await confirmAction({
      title: 'feather plugin remove',
      label: `Remove plugin "${pluginId}"?`,
      hint: 'This recursively deletes the installed plugin directory.',
      danger: true,
      rows: [pluginDir],
    });
    if (!confirmed) {
      printMuted('Plugin remove cancelled.');
      return;
    }
  }

  if (!opts.dryRun) rmSync(pluginDir, { recursive: true, force: true });
  if (opts.json) {
    printJson({
      projectDir,
      dryRun: opts.dryRun === true,
      removed: pluginSummaryJson(pluginId),
      target: pluginDir,
    });
    return;
  }
  printLine(`${icon.success} Removed ${pluginId}`);
}
