import chalk from 'chalk';
import ora from 'ora';
import { auditLockfile } from '../../lib/package/audit.js';
import { readLockfile } from '../../lib/package/lockfile.js';
import { resolvePackageProjectDir } from './shared.js';

export type PackageAuditOptions = {
  dir?: string;
  json?: boolean;
};

export async function packageAuditCommand(opts: PackageAuditOptions = {}): Promise<void> {
  const projectDir = resolvePackageProjectDir(opts.dir);
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

