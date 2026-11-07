import { printMuted } from '../../lib/output.js';
import { choosePluginWorkflow } from '../../ui/plugin-workflow.js';
import { pluginInstallCommand } from './install.js';
import { pluginListCommand } from './list.js';
import { pluginRemoveCommand } from './remove.js';
import { getInstalledPluginIds, resolvePluginProjectDir } from './shared.js';
import { pluginUpdateCommand } from './update.js';

export async function pluginWorkflowCommand(opts: {
  dir?: string;
  branch?: string;
  installDir?: string;
  remote?: boolean;
  localSrc?: string;
  managed?: string;
  chooseWorkflow?: typeof choosePluginWorkflow;
}): Promise<void> {
  const projectDir = resolvePluginProjectDir(opts.dir);
  const installDir = opts.installDir ?? 'feather';
  const installedIds = getInstalledPluginIds(projectDir, installDir);

  const result = await (opts.chooseWorkflow ?? choosePluginWorkflow)({
    installedIds,
    defaultBranch: opts.branch ?? 'main',
  });

  if (result.action === 'cancel') return;
  if (result.action === 'list') {
    await pluginListCommand(projectDir, installDir, opts.managed);
    return;
  }

  if (result.pluginIds.length === 0) {
    printMuted('No plugins selected.');
    return;
  }

  if (result.action === 'install') {
    for (const id of result.pluginIds) {
      await pluginInstallCommand(id, {
        dir: projectDir,
        branch: result.branch,
        installDir,
        remote: result.source === 'remote',
        localSrc: opts.localSrc,
        managed: opts.managed,
      });
    }
    return;
  }

  if (result.action === 'update') {
    for (const id of result.pluginIds) {
      await pluginUpdateCommand(id, {
        dir: projectDir,
        branch: result.branch,
        installDir,
        remote: result.source === 'remote',
        localSrc: opts.localSrc,
        managed: opts.managed,
      });
    }
    return;
  }

  for (const id of result.pluginIds) {
    await pluginRemoveCommand(id, { dir: projectDir, installDir, yes: true, managed: opts.managed });
  }
}
