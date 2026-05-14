import { existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import chalk from 'chalk';
import ora from 'ora';
import { loadRegistry } from '../lib/package/registry.js';
import { readLockfile, writeLockfile, removeFromLockfile } from '../lib/package/lockfile.js';
import { resolveMany, type ResolvedPackage } from '../lib/package/resolve.js';
import { installFromUrl, restorePackage } from '../lib/package/install.js';
import { auditLockfile } from '../lib/package/audit.js';
import { showPackageBrowser } from '../ui/package-workflow.js';
import { showInstallProgress } from '../ui/package-progress.js';
import { showAddFromUrlWizard } from '../ui/package-add-url.js';

function findProjectDir(cwd = process.cwd()): string {
  if (existsSync(join(cwd, 'main.lua'))) return cwd;
  return cwd;
}

function trustBadge(trust: string): string {
  if (trust === 'verified') return chalk.green('[verified]');
  if (trust === 'known') return chalk.yellow('[known]');
  return chalk.red('[experimental]');
}

export type PackageSearchOptions = {
  offline?: boolean;
  registryUrl?: string;
};

export async function packageSearchCommand(query: string | undefined, opts: PackageSearchOptions = {}): Promise<void> {
  const spinner = ora('Loading registry…').start();
  let registry;
  try {
    registry = await loadRegistry(opts);
    spinner.stop();
  } catch (err) {
    spinner.fail(`Failed to load registry: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const q = query?.toLowerCase();
  const entries = Object.entries(registry.packages).filter(([, entry]) => !entry.parent);

  const matches = q
    ? entries.filter(
        ([id, entry]) =>
          id.includes(q) || entry.description.toLowerCase().includes(q) || entry.tags.some((t) => t.includes(q)),
      )
    : entries;

  if (matches.length === 0) {
    console.log(chalk.dim(`No packages found${q ? ` matching "${query}"` : ''}.`));
    return;
  }

  const maxId = Math.max(...matches.map(([id]) => id.length));
  for (const [id, entry] of matches.sort(([a], [b]) => a.localeCompare(b))) {
    const badge = trustBadge(entry.trust);
    console.log(`  ${chalk.bold(id.padEnd(maxId + 2))} ${badge}  ${chalk.dim(entry.description)}`);
    if (entry.subpackages?.length) {
      console.log(chalk.dim(`  ${''.padEnd(maxId + 2)}   subpackages: ${entry.subpackages.join(', ')}`));
    }
  }
  console.log(chalk.dim(`\n${matches.length} package(s). Run \`feather package info <name>\` for details.`));
}

export type PackageListOptions = {
  installed?: boolean;
  offline?: boolean;
  refresh?: boolean;
  dir?: string;
  registryUrl?: string;
};

export async function packageListCommand(opts: PackageListOptions = {}): Promise<void> {
  const projectDir = opts.dir ? resolve(opts.dir) : findProjectDir();

  if (opts.installed) {
    const lockfile = readLockfile(projectDir);
    const entries = Object.entries(lockfile.packages);
    if (entries.length === 0) {
      console.log(chalk.dim('No packages installed. Run `feather package install <name>`.'));
      return;
    }
    for (const [id, entry] of entries) {
      console.log(`  ${trustBadge(entry.trust)} ${chalk.bold(id)} @ ${entry.version}`);
    }
    console.log(chalk.dim(`\n${entries.length} package(s) installed.`));
    return;
  }

  const spinner = ora('Loading registry…').start();
  let registry;
  try {
    registry = await loadRegistry({ offline: opts.offline, refresh: opts.refresh, registryUrl: opts.registryUrl });
    spinner.stop();
  } catch (err) {
    spinner.fail(`Failed to load registry: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const lockfile = readLockfile(projectDir);

  // Fall back to plain text when stdin is not a TTY (scripts, piped output)
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    const entries = Object.entries(registry.packages).filter(([, e]) => !e.parent);
    for (const [id, entry] of entries.sort(([a], [b]) => a.localeCompare(b))) {
      const installed = lockfile.packages[id];
      const installedLabel = installed ? chalk.cyan(` (installed ${installed.version})`) : '';
      console.log(`  ${trustBadge(entry.trust)} ${chalk.bold(id)}${installedLabel}  ${chalk.dim(entry.description)}`);
    }
    console.log(chalk.dim(`\n${entries.length} available.`));
    return;
  }

  const result = await showPackageBrowser({ registry, lockfile });
  if (result.action === 'cancel') return;

  const { resolved, errors } = resolveMany([result.id], registry);
  if (errors.length) {
    for (const e of errors) console.log(chalk.red(`  ✖ ${e}`));
    process.exitCode = 1;
    return;
  }

  if (result.action === 'remove') {
    await packageRemoveCommand(result.id, { dir: opts.dir });
    return;
  }

  const installResults = await showInstallProgress({ packages: resolved, lockfile, projectDir });
  if (installResults.every((r) => r.ok)) {
    writeLockfile(projectDir, lockfile);
  } else {
    process.exitCode = 1;
  }
}

export type PackageInfoOptions = {
  offline?: boolean;
  dir?: string;
  registryUrl?: string;
};

export async function packageInfoCommand(name: string, opts: PackageInfoOptions = {}): Promise<void> {
  const projectDir = opts.dir ? resolve(opts.dir) : findProjectDir();
  const lockfile = readLockfile(projectDir);

  const spinner = ora('Loading registry…').start();
  let registry;
  try {
    registry = await loadRegistry({ offline: opts.offline, registryUrl: opts.registryUrl });
    spinner.stop();
  } catch (err) {
    spinner.fail(`Failed to load registry: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const entry = registry.packages[name];
  if (!entry) {
    console.log(chalk.red(`Package "${name}" not found.`));
    process.exitCode = 1;
    return;
  }

  const installed = lockfile.packages[name];
  console.log();
  console.log(`${chalk.bold(name)}  ${trustBadge(entry.trust)}`);
  console.log(chalk.dim(entry.description));
  console.log();
  console.log(`  Source:   ${chalk.cyan(`github.com/${entry.source.repo}`)}`);
  console.log(`  Version:  ${entry.source.tag}`);
  console.log(`  Tags:     ${entry.tags.join(', ') || '—'}`);
  if (entry.license) console.log(`  License:  ${entry.license}`);
  if (entry.homepage) console.log(`  Docs:     ${chalk.cyan(entry.homepage)}`);
  if (installed) {
    console.log(`  Status:   ${chalk.green('installed')} @ ${installed.version}`);
  }
  if (entry.subpackages?.length) {
    console.log(`  Modules:  ${entry.subpackages.join(', ')}`);
  }
  console.log();
  console.log('  Files to install:');
  for (const f of entry.install.files) {
    console.log(`    ${chalk.dim(f.name)}  →  ${f.target}`);
  }
  console.log();
  console.log('  Usage:');
  console.log(`    ${chalk.cyan(entry.example ?? `local lib = require("${entry.require}")`)}`);
  console.log();
}

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
  const projectDir = opts.dir ? resolve(opts.dir) : findProjectDir();

  if (opts.fromUrl) {
    if (!opts.allowUntrusted && !opts.yes) {
      console.log();
      console.log(chalk.yellow('Installing from untrusted URL'));
      console.log(`  URL:    ${opts.fromUrl}`);
      if (!opts.target) {
        console.log(chalk.red('  --target <path> is required with --from-url'));
        process.exitCode = 1;
        return;
      }
      console.log(`  Target: ${opts.target}`);
      console.log();
      console.log(chalk.red('  This package has NOT been reviewed by the Feather team.'));
      console.log(chalk.dim('  Use --allow-untrusted to confirm you trust this source.'));
      process.exitCode = 1;
      return;
    }

    if (!opts.target) {
      console.log(chalk.red('--target <path> is required with --from-url'));
      process.exitCode = 1;
      return;
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
      console.log(chalk.yellow('Dry run — no files written'));
      console.log(`  URL:     ${opts.fromUrl}`);
      console.log(`  SHA-256: ${result.sha256}`);
      console.log(`  Size:    ${result.size} bytes`);
      console.log(`  Target:  ${result.target}`);
      console.log(chalk.yellow('  Trust:   experimental ⚠'));
      return;
    }

    spinner.succeed('Installed from URL (experimental)');
    console.log();
    console.log(`  SHA-256: ${result.sha256}`);
    console.log(`  Target:  ${result.target}`);
    console.log(chalk.yellow('  Trust:   experimental ⚠  — not reviewed by the Feather team'));
    writeLockfile(projectDir, lockfile);
    return;
  }

  // No names → restore everything recorded in feather.lock.json
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

  const spinner = ora('Loading registry…').start();
  let registry;
  try {
    registry = await loadRegistry({ offline: opts.offline, registryUrl: opts.registryUrl });
    spinner.stop();
  } catch (err) {
    spinner.fail(`Failed to load registry: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const lockfile = readLockfile(projectDir);
  const { resolved, errors } = resolveMany(names, registry);

  if (errors.length) {
    for (const e of errors) console.log(chalk.red(`  ✖ ${e}`));
    process.exitCode = 1;
    return;
  }

  // Check already installed (skip check when a version override is requested)
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

  // Block experimental or version-overridden packages without --allow-untrusted
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

export type PackageUpdateOptions = {
  dryRun?: boolean;
  dir?: string;
  offline?: boolean;
  registryUrl?: string;
};

export async function packageUpdateCommand(name: string | undefined, opts: PackageUpdateOptions = {}): Promise<void> {
  const projectDir = opts.dir ? resolve(opts.dir) : findProjectDir();
  const lockfile = readLockfile(projectDir);

  const installed = Object.entries(lockfile.packages);
  if (installed.length === 0) {
    console.log(chalk.dim('No packages installed.'));
    return;
  }

  const spinner = ora('Loading registry…').start();
  let registry;
  try {
    registry = await loadRegistry({ offline: opts.offline, registryUrl: opts.registryUrl });
    spinner.stop();
  } catch (err) {
    spinner.fail(`Failed to load registry: ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }

  const targets = name ? installed.filter(([id]) => id === name) : installed;

  if (name && targets.length === 0) {
    console.log(chalk.red(`"${name}" is not installed.`));
    process.exitCode = 1;
    return;
  }

  const toUpdate: ResolvedPackage[] = [];
  for (const [id, current] of targets) {
    if (current.trust === 'experimental') {
      console.log(chalk.dim(`  Skipping "${id}" (experimental — re-install with --from-url to update)`));
      continue;
    }
    const entry = registry.packages[id];
    if (!entry) {
      console.log(chalk.yellow(`  "${id}" not found in registry — skipping`));
      continue;
    }
    if (entry.source.tag === current.version) {
      console.log(chalk.dim(`  ${id} is already up to date (${current.version})`));
      continue;
    }
    console.log(`  ${chalk.bold(id)}: ${current.version} → ${entry.source.tag}`);
    toUpdate.push({ id, entry, files: entry.install.files });
  }

  if (opts.dryRun || toUpdate.length === 0) return;

  const results = await showInstallProgress({ packages: toUpdate, lockfile, projectDir });
  if (results.every((r) => r.ok)) {
    writeLockfile(projectDir, lockfile);
  } else {
    process.exitCode = 1;
  }
}

export type PackageRemoveOptions = {
  dir?: string;
  yes?: boolean;
};

export async function packageRemoveCommand(name: string, opts: PackageRemoveOptions = {}): Promise<void> {
  const projectDir = opts.dir ? resolve(opts.dir) : findProjectDir();
  const lockfile = readLockfile(projectDir);

  const entry = lockfile.packages[name];
  if (!entry) {
    console.log(chalk.red(`"${name}" is not installed.`));
    process.exitCode = 1;
    return;
  }

  for (const file of entry.files) {
    const abs = join(projectDir, file.target);
    if (existsSync(abs)) {
      rmSync(abs);
      console.log(chalk.dim(`  removed ${file.target}`));
    }
  }

  removeFromLockfile(lockfile, name);
  writeLockfile(projectDir, lockfile);
  console.log(`  ${chalk.bold(name)} removed.`);
}

export type PackageAddOptions = {
  dir?: string;
};

export async function packageAddCommand(opts: PackageAddOptions = {}): Promise<void> {
  const projectDir = opts.dir ? resolve(opts.dir) : findProjectDir();
  const lockfile = readLockfile(projectDir);
  await showAddFromUrlWizard({ projectDir, lockfile });
}

export type PackageAuditOptions = {
  dir?: string;
  json?: boolean;
};

export async function packageAuditCommand(opts: PackageAuditOptions = {}): Promise<void> {
  const projectDir = opts.dir ? resolve(opts.dir) : findProjectDir();
  const lockfile = readLockfile(projectDir);

  const entries = Object.values(lockfile.packages);
  if (entries.length === 0) {
    console.log(chalk.dim('No packages installed.'));
    return;
  }

  const spinner = ora('Auditing…').start();
  const results = await auditLockfile(projectDir, lockfile);
  spinner.stop();

  if (opts.json) {
    console.log(JSON.stringify(results, null, 2));
    if (results.some((r) => r.status !== 'verified')) process.exitCode = 1;
    return;
  }

  console.log(chalk.bold(`\nAuditing ${entries.length} installed package(s)…\n`));

  const maxId = Math.max(...results.map((r) => r.id.length));
  for (const r of results) {
    if (r.status === 'verified') {
      console.log(`  ${chalk.green('✔')} ${r.id.padEnd(maxId + 2)} ${chalk.dim(r.target)}  ${chalk.green('verified')}`);
    } else if (r.status === 'missing') {
      console.log(
        `  ${chalk.yellow('!')} ${r.id.padEnd(maxId + 2)} ${chalk.dim(r.target)}  ${chalk.yellow('missing')}`,
      );
    } else {
      console.log(
        `  ${chalk.red('✖')} ${r.id.padEnd(maxId + 2)} ${chalk.dim(r.target)}  ${chalk.red('MODIFIED  ← SHA-256 mismatch')}`,
      );
    }
  }

  const bad = results.filter((r) => r.status !== 'verified');
  console.log();
  if (bad.length === 0) {
    console.log(chalk.green.bold('All packages verified.'));
  } else {
    console.log(
      chalk.red.bold(
        `${bad.length} issue(s) found. Re-install affected packages with \`feather package install <name>\`.`,
      ),
    );
    process.exitCode = 1;
  }
  console.log();
}
