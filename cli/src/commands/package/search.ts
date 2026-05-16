import chalk from 'chalk';
import { trustBadge } from '../../lib/trust.js';
import { loadRegistryOrExit } from './shared.js';

export type PackageSearchOptions = {
  offline?: boolean;
  registryUrl?: string;
};

export async function packageSearchCommand(query: string | undefined, opts: PackageSearchOptions = {}): Promise<void> {
  const registry = await loadRegistryOrExit(opts);
  if (!registry) return;

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

