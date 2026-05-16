import chalk from 'chalk';
import { readLockfile } from '../../lib/package/lockfile.js';
import { trustBadge } from '../../lib/trust.js';
import { loadRegistryOrExit, resolvePackageProjectDir } from './shared.js';

export type PackageInfoOptions = {
  offline?: boolean;
  dir?: string;
  registryUrl?: string;
};

export async function packageInfoCommand(name: string, opts: PackageInfoOptions = {}): Promise<void> {
  const projectDir = resolvePackageProjectDir(opts.dir);
  const lockfile = readLockfile(projectDir);

  const registry = await loadRegistryOrExit({ offline: opts.offline, registryUrl: opts.registryUrl });
  if (!registry) return;

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

