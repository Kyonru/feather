import { auditLockfile } from '../../lib/package/audit.js';
import { installFromUrl, restorePackage } from '../../lib/package/install.js';
import { readLockfile, writeLockfile } from '../../lib/package/lockfile.js';
import { lockfileEntryRequiresUntrustedRepair, lockfileEntrySourceSummary } from '../../lib/package/provenance.js';
import { dependencyInstallConflicts, resolveMany } from '../../lib/package/resolve.js';
import { planPackageTarget, resolveProjectTarget } from '../../lib/package/target.js';
import { planDependencyAliases } from '../../lib/package/aliases.js';
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
import { showInstallProgress } from '../../ui/package/index.js';
import { loadRegistryOrExit, resolvePackageProjectDir } from './shared.js';

export type PackageInstallOptions = {
  dryRun?: boolean;
  allowUntrusted?: boolean;
  allowNonLuaFiles?: boolean;
  flatDir?: string;
  targetPath?: string;
  installDir?: string;
  saveInstallDir?: boolean;
  fromUrl?: string;
  dir?: string;
  offline?: boolean;
  yes?: boolean;
  registryUrl?: string;
};

export async function packageInstallCommand(names: string[], opts: PackageInstallOptions = {}): Promise<void> {
  const projectDir = resolvePackageProjectDir(opts.dir);

  if (opts.fromUrl && (opts.installDir || opts.saveInstallDir || opts.flatDir)) {
    fail('--from-url uses --target-path <path>; --install-dir and --flat-dir are only supported for catalog packages.');
  }
  if (!opts.fromUrl && opts.targetPath) {
    fail('--target-path can only be used with --from-url.');
  }
  if (opts.installDir && opts.flatDir) {
    fail('--install-dir cannot be used with --flat-dir.');
  }
  if (opts.saveInstallDir && !opts.installDir) {
    fail('--save-install-dir requires --install-dir <dir>.');
  }
  if (opts.installDir && !resolveProjectTarget(projectDir, opts.installDir)) {
    fail('--install-dir must be a relative path inside the project.');
  }
  if (opts.flatDir && !resolveProjectTarget(projectDir, opts.flatDir)) {
    fail('--flat-dir must be a relative path inside the project.');
  }

  if (opts.fromUrl) {
    if (!opts.targetPath) {
      printBlank();
      printStatus('error', '--target-path <path> is required with --from-url');
      fail('', { silent: true });
    }

    if (!opts.allowUntrusted) {
      printBlank();
      printWarning('Installing from untrusted URL');
      printKeyValues([
        ['URL', opts.fromUrl],
        ['Target', opts.targetPath],
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
        rows: [`URL: ${opts.fromUrl}`, `Target: ${opts.targetPath}`],
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
      target: opts.targetPath,
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

    const untrustedRepairs = entries.filter(([id, entry]) => broken.has(id) && lockfileEntryRequiresUntrustedRepair(id, entry));
    if (untrustedRepairs.length > 0 && !opts.allowUntrusted) {
      printWarning('Repairing untrusted or experimental package sources');
      printKeyValues(untrustedRepairs.map(([id, entry]) => [
        id,
        `${entry.version} (${lockfileEntrySourceSummary(id, entry)})`,
      ]));

      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        printBlank();
        printDanger('Use --allow-untrusted to repair these lockfile entries in non-interactive mode.');
        fail('', { silent: true });
      }

      const confirmed = await confirmAction({
        title: 'feather package install',
        label: 'Repair these unreviewed package sources?',
        hint: 'Only continue if you trust the lockfile sources and target paths.',
        danger: true,
        rows: untrustedRepairs.map(([id, entry]) => `${id}: ${lockfileEntrySourceSummary(id, entry)}`),
      });
      if (!confirmed) {
        printMuted('Install cancelled.');
        return;
      }
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

  const dependencyConflicts = dependencyInstallConflicts(resolved, lockfile);
  if (dependencyConflicts.length > 0) {
    fail(dependencyConflicts.join('\n'));
  }

  const toInstall = resolved.filter((pkg) => {
    if (pkg.versionOverride) return true;
    const existing = lockfile.packages[pkg.id];
    if (existing && existing.version === pkg.entry.source.tag) {
      if (opts.installDir && (pkg.requested || !pkg.dependencyOf?.length)) return true;
      printMuted(`  ${pkg.id} is already installed at ${existing.version}`);
      return false;
    }
    return true;
  });

  if (toInstall.length === 0) return;

  for (const pkg of toInstall) {
    if (pkg.entry.install.layout === 'fixed' && opts.flatDir) {
      fail(`${pkg.id} has fixed runtime paths and cannot be flattened.`);
    }
    if (pkg.entry.trust === 'experimental' && !opts.allowUntrusted) {
      fail(`"${pkg.id}" requires --allow-untrusted (trust: experimental)`);
    }
    if (pkg.versionOverride && !opts.allowUntrusted) {
      fail(`"${pkg.id}@${pkg.versionOverride}" requires --allow-untrusted — this version has not been reviewed by Feather`);
    }
    if (!opts.allowNonLuaFiles) {
      const nonLua = pkg.files.filter((f) => !f.name.endsWith('.lua'));
      if (nonLua.length > 0) {
        fail(
          `"${pkg.id}" includes non-Lua files (${nonLua.map((f) => f.name).join(', ')}). Use --allow-non-lua-files to permit installing them.`,
        );
      }
    }
  }

  for (const pkg of toInstall) {
    if (pkg.entry.install.layout === 'fixed' && opts.installDir) {
      printWarning(`${pkg.id} has fixed runtime paths; --install-dir is ignored for this package.`);
    }
  }

  if (opts.dryRun) {
    printBlank();
    for (const pkg of toInstall) {
      const displayVersion = pkg.versionOverride ?? pkg.entry.source.tag;
      printLine(`  ${style.heading(pkg.id)}  ${trustBadge(pkg.versionOverride ? 'experimental' : pkg.entry.trust)}`);
      printLine(`  Source:  github.com/${pkg.entry.source.repo}  Version: ${displayVersion}`);
      const savedInstallDir = lockfile.packages[pkg.id]?.installDir;
      const installDir = opts.installDir ?? savedInstallDir;
      for (const f of pkg.files) {
        const target = planPackageTarget(f, { targetOverride: opts.flatDir, installDir, layout: pkg.entry.install.layout });
        printLine(`    ${style.muted(f.name)}  →  ${target}`);
      }
      const aliases = planDependencyAliases(pkg, lockfile, { installDir, targetOverride: opts.flatDir, dryRun: true });
      if (aliases.ok) {
        for (const alias of aliases.aliases) {
          printLine(`    ${style.muted(alias.name)}  →  ${alias.target}  ${style.muted(`requires ${alias.requirePath}`)}`);
        }
      }
      printBlank();
    }
    printWarning('Dry run — no files written.');
    return;
  }

  const results = await showInstallProgress({
    packages: toInstall,
    lockfile,
    projectDir,
    targetOverride: opts.flatDir,
    installDir: opts.installDir,
    saveInstallDir: opts.saveInstallDir,
  });
  if (results.every((r) => r.ok)) {
    writeLockfile(projectDir, lockfile);
  } else {
    fail('', { silent: true });
  }
}
