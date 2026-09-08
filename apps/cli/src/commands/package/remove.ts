import { existsSync, rmSync } from 'node:fs';
import { readCompatibleLockfile } from '../../lib/package/compat.js';
import { removeFromLockfile, writeLockfile } from '../../lib/package/lockfile.js';
import { fail } from '../../lib/command.js';
import { icon, printJson, printLine, printMuted, style } from '../../lib/output.js';
import { confirmAction } from '../../ui/confirm.js';
import { resolvePackageProjectDir } from './shared.js';
import { resolveProjectTarget } from '../../lib/package/target.js';

export type PackageRemoveOptions = {
  dir?: string;
  yes?: boolean;
  json?: boolean;
};

export async function packageRemoveCommand(name: string, opts: PackageRemoveOptions = {}): Promise<void> {
  const projectDir = resolvePackageProjectDir(opts.dir);
  const lockfile = readCompatibleLockfile(projectDir);

  const entry = lockfile.packages[name];
  if (!entry) {
    fail(`"${name}" is not installed.`);
  }

  const existingFiles = entry.files.filter((file) => {
    const abs = resolveProjectTarget(projectDir, file.target);
    return abs !== null && existsSync(abs);
  });
  if (!opts.yes && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    fail(`Refusing to remove "${name}" without --yes in non-interactive mode.`);
  }

  if (!opts.yes) {
    const confirmed = await confirmAction({
      title: 'feather package remove',
      label: `Remove package "${name}"?`,
      hint: 'This deletes installed files and updates feather.lock.json.',
      danger: true,
      rows: [
        ...existingFiles.map((file) => file.target),
        'feather.lock.json',
      ],
    });
    if (!confirmed) {
      printMuted('Package remove cancelled.');
      return;
    }
  }

  for (const file of entry.files) {
    const abs = resolveProjectTarget(projectDir, file.target);
    if (!abs) {
      fail(`Refusing to remove unsafe package target: ${file.target}`);
    }
    if (existsSync(abs)) {
      rmSync(abs);
      printMuted(`  removed ${file.target}`);
    }
  }

  removeFromLockfile(lockfile, name);
  writeLockfile(projectDir, lockfile);
  if (opts.json) {
    printJson({
      projectDir,
      removed: {
        id: name,
        files: entry.files.map((file) => file.target),
        existingFiles: existingFiles.map((file) => file.target),
      },
    });
    return;
  }
  printLine(`  ${icon.success} ${style.heading(name)} removed.`);
}
