import { readLockfile } from '../../lib/package/lockfile.js';
import { fail } from '../../lib/command.js';
import { style } from '../../lib/output.js';
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
    fail(`Package "${name}" not found.`);
  }

  const installed = lockfile.packages[name];
  console.log();
  console.log(`${style.heading(name)}  ${trustBadge(entry.trust)}`);
  console.log(style.muted(entry.description));
  console.log();
  console.log(`  Source:   ${style.info(`github.com/${entry.source.repo}`)}`);
  console.log(`  Version:  ${entry.source.tag}`);
  console.log(`  Tags:     ${entry.tags.join(', ') || '—'}`);
  if (entry.license) console.log(`  License:  ${entry.license}`);
  if (entry.homepage) console.log(`  Docs:     ${style.info(entry.homepage)}`);
  if (installed) {
    console.log(`  Status:   ${style.success('installed')} @ ${installed.version}`);
  }
  if (entry.subpackages?.length) {
    console.log(`  Modules:  ${entry.subpackages.join(', ')}`);
  }
  console.log();
  console.log('  Files to install:');
  for (const f of entry.install.files) {
    console.log(`    ${style.muted(f.name)}  →  ${f.target}`);
  }
  console.log();
  console.log('  Usage:');
  console.log(`    ${style.info(entry.example ?? `local lib = require("${entry.require}")`)}`);
  console.log();
}
