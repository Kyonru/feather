import chalk from 'chalk';
import ora from 'ora';
import { auditLockfile } from '../../lib/package/audit.js';
import { installFromUrl, restorePackage } from '../../lib/package/install.js';
import { readLockfile, writeLockfile } from '../../lib/package/lockfile.js';
import { resolveMany } from '../../lib/package/resolve.js';
import { keyValueRows, statusLine, style } from '../../lib/output.js';
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
      console.log();
      console.log(statusLine('error', '--target <path> is required with --from-url'));
      process.exitCode = 1;
      return;
    }

    if (!opts.allowUntrusted) {
      console.log();
      console.log(style.warning('Installing from untrusted URL'));
      for (const row of keyValueRows([
        ['URL', opts.fromUrl],
        ['Target', opts.target],
        ['Trust', 'experimental; not reviewed by the Feather team'],
      ])) {
        console.log(row);
      }

      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.log();
        console.log(style.danger('Use --allow-untrusted to confirm this source in non-interactive mode.'));
        process.exitCode = 1;
        return;
      }

      const confirmed = await confirmAction({
        title: 'feather package install',
        label: 'Install this unreviewed URL?',
        hint: 'Only continue if you trust the source and target path.',
        danger: true,
        rows: [`URL: ${opts.fromUrl}`, `Target: ${opts.target}`],
      });
      if (!confirmed) {
        console.log(style.muted('Install cancelled.'));
        return;
      }
    }

    const spinner = ora(`Fetching ${opts.fromUrl}…`).start();
    const lockfile = readLockfile(projectDir);
    const result = await installFromUrl(lockfile, {
      projectDir,
      url: opts.fromUrl,
      target: opts.target,
      dryRun: opts.dryRun,
    });

    if (!result.ok) {
      spinner.fail(result.error ?? 'Install failed');
      process.exitCode = 1;
      return;
    }

    if (opts.dryRun) {
      spinner.stop();
      console.log();
      console.log(style.warning('Dry run: no files written'));
      for (const row of keyValueRows([
        ['URL', opts.fromUrl],
        ['SHA-256', result.sha256],
        ['Size', `${result.size} bytes`],
        ['Target', result.target],
        ['Trust', 'experimental; not reviewed'],
      ])) {
        console.log(row);
      }
      return;
    }

    spinner.succeed('Installed from URL (experimental)');
    console.log();
    for (const row of keyValueRows([
      ['SHA-256', result.sha256],
      ['Target', result.target],
      ['Trust', style.warning('experimental; not reviewed by the Feather team')],
    ])) {
      console.log(row);
    }
    writeLockfile(projectDir, lockfile);
    return;
  }

  if (names.length === 0) {
    const lockfile = readLockfile(projectDir);
    const entries = Object.entries(lockfile.packages).filter(([, e]) => !e.parent);

    if (entries.length === 0) {
      console.log(chalk.dim('feather.lock.json is empty. Run `feather package install <name>` to add packages.'));
      return;
    }

    console.log();
    const auditResults = await auditLockfile(projectDir, lockfile);
    const broken = new Set(auditResults.filter((r) => r.status !== 'verified').map((r) => r.id));

    if (broken.size === 0) {
      console.log(chalk.green(`✔ All ${entries.length} package(s) already up to date.`));
      return;
    }

    let failed = false;
    for (const [id, entry] of entries) {
      if (!broken.has(id)) {
        console.log(chalk.dim(`  ${id} @ ${entry.version} — up to date`));
        continue;
      }
      const spinner = ora(`  ${id} @ ${entry.version}`).start();
      const result = await restorePackage(id, entry, { projectDir, dryRun: opts.dryRun });
      if (result.ok) {
        spinner.succeed(`  ${id} @ ${entry.version}`);
      } else {
        spinner.fail(`  ${id}: ${result.error}`);
        failed = true;
      }
    }

    console.log();
    if (failed) process.exitCode = 1;
    return;
  }

  const registry = await loadRegistryOrExit({ offline: opts.offline, registryUrl: opts.registryUrl });
  if (!registry) return;

  const lockfile = readLockfile(projectDir);
  const { resolved, errors } = resolveMany(names, registry);

  if (errors.length) {
    for (const e of errors) console.log(chalk.red(`  ✖ ${e}`));
    process.exitCode = 1;
    return;
  }

  const toInstall = resolved.filter((pkg) => {
    if (pkg.versionOverride) return true;
    const existing = lockfile.packages[pkg.id];
    if (existing && existing.version === pkg.entry.source.tag) {
      console.log(chalk.dim(`  ${pkg.id} is already installed at ${existing.version}`));
      return false;
    }
    return true;
  });

  if (toInstall.length === 0) return;

  for (const pkg of toInstall) {
    if (pkg.entry.trust === 'experimental' && !opts.allowUntrusted) {
      console.log(chalk.red(`  "${pkg.id}" requires --allow-untrusted (trust: experimental)`));
      process.exitCode = 1;
      return;
    }
    if (pkg.versionOverride && !opts.allowUntrusted) {
      console.log(
        chalk.red(
          `  "${pkg.id}@${pkg.versionOverride}" requires --allow-untrusted — this version has not been reviewed by Feather`,
        ),
      );
      process.exitCode = 1;
      return;
    }
  }

  if (opts.dryRun) {
    console.log();
    for (const pkg of toInstall) {
      const displayVersion = pkg.versionOverride ?? pkg.entry.source.tag;
      console.log(`  ${chalk.bold(pkg.id)}  ${trustBadge(pkg.versionOverride ? 'experimental' : pkg.entry.trust)}`);
      console.log(`  Source:  github.com/${pkg.entry.source.repo}  Version: ${displayVersion}`);
      for (const f of pkg.files) {
        console.log(`    ${chalk.dim(f.name)}  →  ${f.target}`);
      }
      console.log();
    }
    console.log(chalk.yellow('Dry run — no files written.'));
    return;
  }

  const results = await showInstallProgress({ packages: toInstall, lockfile, projectDir, targetOverride: opts.target });
  if (results.every((r) => r.ok)) {
    writeLockfile(projectDir, lockfile);
  } else {
    process.exitCode = 1;
  }
}

