import chalk from 'chalk';

export function trustBadge(trust: string): string {
  if (trust === 'verified') return chalk.green('[verified]');
  if (trust === 'known') return chalk.yellow('[known]');
  return chalk.red('[experimental]');
}

export function trustLabel(trust: string): string {
  if (trust === 'verified') return 'verified';
  if (trust === 'known') return 'known';
  return 'experimental';
}

export function trustColor(trust: string): string {
  if (trust === 'verified') return 'green';
  if (trust === 'known') return 'yellow';
  return 'red';
}
