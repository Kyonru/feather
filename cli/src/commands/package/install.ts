import { auditLockfile } from '../../lib/package/audit.js';
import { installFromUrl, restorePackage } from '../../lib/package/install.js';
import { readLockfile, writeLockfile } from '../../lib/package/lockfile.js';
import { resolveMany } from '../../lib/package/resolve.js';
import { fail } from '../../lib/command.js';
import {
  createSpinner,
  icon,
  printBlank,
  printDanger,
  printKeyValues,
  printLine,
  printMuted,
  printStatus,
  printSuccess,
  printWarning,
  style,
} from '../../lib/output.js';
import { trustBadge } from '../../lib/trust.js';
import { confirmAction } from '../../ui/confirm.js';
import { showInstallProgress } from '../../ui/package-progress.js';
import { loadRegistryOrExit, resolvePackageProjectDir } from './shared.js';

export type PackageInstallOptions = {
  dryRun?: boolean;
  allowUntrusted?: boolean;
  target?: string;
  fromUrl?: string;
  dir?: string;
  offline?: boolean;
  yes?: boolean;
  registryUrl?: string;
};

export async function packageInstallCommand(names: string[], opts: PackageInstallOptions = {}): Promise<void> {
  const projectDir = resolvePackageProjectDir(opts.dir);

  if (opts.fromUrl) {
    if (!opts.target) {
      printBlank();
      printStatus('error', '--target <path> is required with --from-url');
      fail('', { silent: true });
    }

    if (!opts.allowUntrusted) {
      printBlank();
      printWarning('Installing from untrusted URL');
      printKeyValues([
        ['URL', opts.fromUrl],
        ['Target', opts.target],
        ['Trust', 'experimental; not reviewed by the Feather team'],
      ]);

      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        printBlank();
        printDanger('Use --allow-untrusted to confirm this source in non-interactive mode.');
        fail('', { silent: true });
      }

      const confirmed = await confirmAction({
        title: 'feather package install',
        label: 'Install this unreviewed URL?',
        hint: 'Only continue if you trust the source and target path.',
        danger: true,
        rows: [`URL: ${opts.fromUrl}`, `Target: ${opts.target}`],
      });
      if (!confirmed) {
        printMuted('Install cancelled.');
        return;
      }
    }

    const spinner = createSpinner(`Fetching ${opts.fromUrl}…`).start();
    const lockfile = readLockfile(projectDir);
    const result = await installFromUrl(lockfile, {
      projectDir,
      url: opts.fromUrl,
      target: opts.target,
      dryRun: opts.dryRun,
    });

    if (!result.ok) {
      spinner.fail(result.error ?? 'Install failed');
      fail(result.error ?? 'Install failed', { silent: true });
    }

    if (opts.dryRun) {
      spinner.stop();
      printBlank();
      printWarning('Dry run: no files written');
      printKeyValues([
        ['URL', opts.fromUrl],
        ['SHA-256', result.sha256],
        ['Size', `${result.size} bytes`],
        ['Target', result.target],
        ['Trust', 'experimental; not reviewed'],
      ]);
      return;
    }

    spinner.succeed('Installed from URL (experimental)');
    printBlank();
    printKeyValues([
      ['SHA-256', result.sha256],
      ['Target', result.target],
      ['Trust', style.warning('experimental; not reviewed by the Feather team')],
    ]);
    writeLockfile(projectDir, lockfile);
    return;
  }

  if (names.length === 0) {
    const lockfile = readLockfile(projectDir);
    const entries = Object.entries(lockfile.packages).filter(([, e]) => !e.parent);

    if (entries.length === 0) {
      printMuted('feather.lock.json is empty. Run `feather package install <name>` to add packages.');
      return;
    }

    printBlank();
    const auditResults = await auditLockfile(projectDir, lockfile);
    const broken = new Set(auditResults.filter((r) => r.status !== 'verified').map((r) => r.id));

    if (broken.size === 0) {
      printSuccess(`✔ All ${entries.length} package(s) already up to date.`);
      return;
    }

    let failed = false;
    for (const [id, entry] of entries) {
      if (!broken.has(id)) {
        printMuted(`  ${id} @ ${entry.version} — up to date`);
        continue;
      }
      const spinner = createSpinner(`  ${id} @ ${entry.version}`).start();
      const result = await restorePackage(id, entry, { projectDir, dryRun: opts.dryRun });
      if (result.ok) {
        spinner.succeed(`  ${id} @ ${entry.version}`);
      } else {
        spinner.fail(`  ${id}: ${result.error}`);
        failed = true;
      }
    }

    printBlank();
    if (failed) fail('', { silent: true });
    return;
  }

  const registry = await loadRegistryOrExit({ offline: opts.offline, registryUrl: opts.registryUrl });
  if (!registry) return;

  const lockfile = readLockfile(projectDir);
  const { resolved, errors } = resolveMany(names, registry);

  if (errors.length) {
    for (const e of errors) printLine(`  ${icon.error} ${style.danger(e)}`);
    fail('', { silent: true });
  }

  const toInstall = resolved.filter((pkg) => {
    if (pkg.versionOverride) return true;
    const existing = lockfile.packages[pkg.id];
    if (existing && existing.version === pkg.entry.source.tag) {
      printMuted(`  ${pkg.id} is already installed at ${existing.version}`);
      return false;
    }
    return true;
  });

  if (toInstall.length === 0) return;

  for (const pkg of toInstall) {
    if (pkg.entry.trust === 'experimental' && !opts.allowUntrusted) {
      fail(`"${pkg.id}" requires --allow-untrusted (trust: experimental)`);
    }
    if (pkg.versionOverride && !opts.allowUntrusted) {
      fail(`"${pkg.id}@${pkg.versionOverride}" requires --allow-untrusted — this version has not been reviewed by Feather`);
    }
  }

  if (opts.dryRun) {
    printBlank();
    for (const pkg of toInstall) {
      const displayVersion = pkg.versionOverride ?? pkg.entry.source.tag;
      printLine(`  ${style.heading(pkg.id)}  ${trustBadge(pkg.versionOverride ? 'experimental' : pkg.entry.trust)}`);
      printLine(`  Source:  github.com/${pkg.entry.source.repo}  Version: ${displayVersion}`);
      for (const f of pkg.files) {
        printLine(`    ${style.muted(f.name)}  →  ${f.target}`);
      }
      printBlank();
    }
    printWarning('Dry run — no files written.');
    return;
  }

  const results = await showInstallProgress({ packages: toInstall, lockfile, projectDir, targetOverride: opts.target });
  if (results.every((r) => r.ok)) {
    writeLockfile(projectDir, lockfile);
  } else {
    fail('', { silent: true });
  }
}
