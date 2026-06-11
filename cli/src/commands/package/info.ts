import { readLockfile } from '../../lib/package/lockfile.js';
import { fail } from '../../lib/command.js';
import { printBlank, printLine, printMuted, style } from '../../lib/output.js';
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
  printBlank();
  printLine(`${style.heading(name)}  ${trustBadge(entry.trust)}`);
  printMuted(entry.description);
  printBlank();
  printLine(`  Source:   ${style.info(`github.com/${entry.source.repo}`)}`);
  printLine(`  Version:  ${entry.source.tag}`);
  printLine(`  Tags:     ${entry.tags.join(', ') || '—'}`);
  if (entry.install.layout === 'fixed') printLine(`  Layout:   fixed runtime paths`);
  if (entry.dependencies?.length) printLine(`  Depends:  ${entry.dependencies.join(', ')}`);
  if (entry.dependencyAliases?.length) {
    printLine('  Aliases:');
    for (const alias of entry.dependencyAliases) {
      printLine(`    ${alias.target} → ${alias.require ?? alias.dependency}`);
    }
  }
  if (entry.license) printLine(`  License:  ${entry.license}`);
  if (entry.homepage) printLine(`  Docs:     ${style.info(entry.homepage)}`);
  if (installed) {
    printLine(`  Status:   ${style.success('installed')} @ ${installed.version}`);
  }
  if (entry.subpackages?.length) {
    printLine(`  Modules:  ${entry.subpackages.join(', ')}`);
  }
  printBlank();
  printLine('  Files to install:');
  for (const f of entry.install.files) {
    printLine(`    ${style.muted(f.name)}  →  ${f.target}`);
  }
  for (const alias of entry.dependencyAliases ?? []) {
    printLine(`    ${style.muted(alias.target)}  →  ${alias.target}  ${style.muted('generated alias')}`);
  }
  printBlank();
  printLine('  Usage:');
  printLine(`    ${style.info(entry.example ?? `local lib = require("${entry.require}")`)}`);
  printBlank();
}
