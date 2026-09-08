import { auditLockfile } from '../../lib/package/audit.js';
import { readCompatibleLockfile } from '../../lib/package/compat.js';
import { fail } from '../../lib/command.js';
import {
  createSpinner,
  icon,
  printBlank,
  printDanger,
  printHeading,
  printJson,
  printMuted,
  printStatus,
  printTable,
  style,
} from '../../lib/output.js';
import { resolvePackageProjectDir } from './shared.js';

export type PackageAuditOptions = {
  dir?: string;
  json?: boolean;
};

export async function packageAuditCommand(opts: PackageAuditOptions = {}): Promise<void> {
  const projectDir = resolvePackageProjectDir(opts.dir);
  const lockfile = readCompatibleLockfile(projectDir);

  const entries = Object.values(lockfile.packages);
  if (entries.length === 0) {
    if (opts.json) {
      printJson([]);
      return;
    }
    printMuted('No packages installed.');
    return;
  }

  const spinner = createSpinner('Auditing…').start();
  const results = await auditLockfile(projectDir, lockfile);
  spinner.stop();

  if (opts.json) {
    printJson(results);
    if (results.some((r) => r.status !== 'verified')) fail('', { silent: true });
    return;
  }

  printHeading(`\nAuditing ${entries.length} installed package(s)…\n`);

  printTable({
    columns: [
      {
        key: 'status',
        label: '',
        color: (value, row) =>
          row.status === 'verified' ? style.success(value) : row.status === 'missing' ? style.warning(value) : style.danger(value),
      },
      { key: 'id', label: 'PACKAGE', color: (value) => style.info(value) },
      { key: 'target', label: 'TARGET', color: (value) => style.muted(value) },
      {
        key: 'message',
        label: 'RESULT',
        color: (value, row) =>
          row.status === 'verified' ? style.success(value) : row.status === 'missing' ? style.warning(value) : style.danger(value),
      },
    ],
    rows: results.map((result) => ({
      status: result.status === 'verified' ? icon.success : result.status === 'missing' ? icon.warning : icon.error,
      id: result.id,
      target: result.target,
      message: result.status === 'modified' ? 'MODIFIED  ← SHA-256 mismatch' : result.status,
    })),
  });

  const bad = results.filter((r) => r.status !== 'verified');
  printBlank();
  if (bad.length === 0) {
    printStatus('success', 'All packages verified.');
  } else {
    printDanger(`${bad.length} issue(s) found. Re-install affected packages with \`feather package install <name>\`.`);
    fail('', { silent: true });
  }
  printBlank();
}
