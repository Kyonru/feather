import { readCompatibleLockfile } from '../../lib/package/compat.js';
import { loadRegistry } from '../../lib/package/registry.js';
import { commitPackageRemoval, planPackageRemoval, preservedFileMessage } from '../../lib/package/remove.js';
import { fail } from '../../lib/command.js';
import { icon, printJson, printLine, printMuted, printWarning, style } from '../../lib/output.js';
import { confirmAction } from '../../ui/confirm.js';
import { resolvePackageProjectDir } from './shared.js';

export type PackageRemoveOptions = {
  dir?: string;
  yes?: boolean;
  json?: boolean;
  /** Also remove every installed package that depends on this one. */
  cascade?: boolean;
};

export async function packageRemoveCommand(name: string, opts: PackageRemoveOptions = {}): Promise<void> {
  const projectDir = resolvePackageProjectDir(opts.dir);
  const lockfile = readCompatibleLockfile(projectDir);

  if (!lockfile.packages[name]) {
    fail(`"${name}" is not installed.`);
  }

  // Older lockfiles did not record dependencies; the bundled catalog fills them in without network.
  let registry;
  try {
    registry = await loadRegistry({ offline: true });
  } catch {
    registry = undefined;
  }
  const planned = planPackageRemoval(projectDir, lockfile, name, { cascade: opts.cascade, registry });
  if (!planned.ok) fail(planned.error);
  const { plan } = planned;

  if (!opts.yes && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    fail(`Refusing to remove "${name}" without --yes in non-interactive mode.`);
  }

  if (!opts.yes) {
    const confirmed = await confirmAction({
      title: 'feather package remove',
      label: plan.ids.length > 1 ? `Remove ${plan.ids.join(', ')}?` : `Remove package "${name}"?`,
      hint: 'This deletes unchanged installed files and updates feather.lock.json. Locally modified files are kept.',
      danger: true,
      rows: [
        ...plan.deletes.map((file) => file.target),
        ...plan.preserved.map((file) => `${file.target} (kept: ${file.reason})`),
        'feather.lock.json',
      ],
    });
    if (!confirmed) {
      printMuted('Package remove cancelled.');
      return;
    }
  }

  const result = commitPackageRemoval(projectDir, lockfile, plan);
  if (!result.ok) fail(result.error);

  const entry = lockfile.packages[name]!;
  if (opts.json) {
    printJson({
      projectDir,
      removed: {
        id: name,
        files: entry.files.map((file) => file.target),
        existingFiles: plan.deletes.filter((file) => file.id === name).map((file) => file.target),
      },
      cascaded: plan.ids.filter((id) => id !== name),
      preserved: plan.preserved,
    });
    return;
  }

  for (const file of plan.deletes) printMuted(`  removed ${file.target}`);
  for (const file of plan.preserved) printWarning(`  ${preservedFileMessage(file)}`);
  for (const id of plan.ids) printLine(`  ${icon.success} ${style.heading(id)} removed.`);
}
