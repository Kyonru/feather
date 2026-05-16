import { readLockfile } from '../../lib/package/lockfile.js';
import { showAddWizard } from '../../ui/package-add.js';
import { ensurePackageAddInteractive, resolvePackageProjectDir } from './shared.js';

export type PackageAddOptions = {
  dir?: string;
};

export async function packageAddCommand(opts: PackageAddOptions = {}): Promise<void> {
  if (!ensurePackageAddInteractive()) return;

  const projectDir = resolvePackageProjectDir(opts.dir);
  const lockfile = readLockfile(projectDir);
  await showAddWizard({ projectDir, lockfile });
}

