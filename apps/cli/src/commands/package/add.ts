import { fail } from '../../lib/command.js';
import { installPackageAddPlan, packageAddPlanFiles } from '../../lib/package/add-plan.js';
import { readCompatibleLockfile } from '../../lib/package/compat.js';
import { createSpinner, printBlank, printKeyValues, printMuted, style } from '../../lib/output.js';
import { showAddWizard } from '../../ui/package/index.js';
import { ensurePackageAddInteractive, resolvePackageProjectDir } from './shared.js';

export type PackageAddOptions = {
  dir?: string;
};

export async function packageAddCommand(opts: PackageAddOptions = {}): Promise<void> {
  if (!ensurePackageAddInteractive()) return;

  const projectDir = resolvePackageProjectDir(opts.dir);
  const lockfile = readCompatibleLockfile(projectDir);
  const plan = await showAddWizard({ projectDir, lockfile });
  if (!plan) {
    printMuted('Package add cancelled.');
    return;
  }

  const spinner = createSpinner(`Installing ${plan.id}…`).start();
  const result = await installPackageAddPlan({
    plan,
    projectDir,
    lockfile,
    onFileStart: (name) => {
      spinner.text = `Installing ${name}…`;
    },
  });

  if (!result.ok) {
    spinner.fail(result.error ?? 'Install failed');
    fail(result.error ?? 'Install failed', { silent: true });
  }

  spinner.succeed(`Installed ${plan.id}`);
  printBlank();
  printKeyValues([
    ['Package', plan.id],
    ['Files', packageAddPlanFiles(plan).map((file) => `${file.name} -> ${file.target}`).join(', ')],
    ['Usage', `local ${plan.id.replace(/[.-]/g, '_')} = require('${plan.requirePath}')`],
    ['Trust', style.warning('experimental; not reviewed by the Feather team')],
  ]);
}
