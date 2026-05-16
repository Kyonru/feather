import { style } from '../../lib/output.js';
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
}): Promise<void> {
  const projectDir = resolvePluginProjectDir(opts.dir);
  const installDir = opts.installDir ?? 'feather';
  const installedIds = getInstalledPluginIds(projectDir, installDir);

  const result = await choosePluginWorkflow({
    installedIds,
    defaultBranch: opts.branch ?? 'main',
  });

  if (result.action === 'cancel') return;
  if (result.action === 'list') {
    await pluginListCommand(projectDir, installDir);
    return;
  }

  if (result.pluginIds.length === 0) {
    console.log(style.muted('No plugins selected.'));
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
      });
    }
    return;
  }

  for (const id of result.pluginIds) {
    await pluginRemoveCommand(id, { dir: projectDir, installDir, yes: true });
  }
}
