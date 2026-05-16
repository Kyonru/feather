import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import chalk from 'chalk';
import { icon, statusLine, style } from '../../lib/output.js';
import { confirmAction } from '../../ui/confirm.js';
import { pluginsDir, resolvePluginProjectDir } from './shared.js';

export async function pluginRemoveCommand(
  pluginId: string,
  opts: { dir?: string; installDir?: string; yes?: boolean },
): Promise<void> {
  const projectDir = resolvePluginProjectDir(opts.dir);
  const pluginDir = join(pluginsDir(projectDir, opts.installDir), pluginId.replace(/\./g, '/'));

  if (!existsSync(pluginDir)) {
    console.error(statusLine('error', `Plugin not found: ${pluginId}`));
    process.exit(1);
  }

  if (!opts.yes && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    console.log(style.danger(`Refusing to remove "${pluginId}" without --yes in non-interactive mode.`));
    process.exitCode = 1;
    return;
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
      console.log(chalk.dim('Plugin remove cancelled.'));
      return;
    }
  }

  rmSync(pluginDir, { recursive: true, force: true });
  console.log(`${icon.success} Removed ${pluginId}`);
}

