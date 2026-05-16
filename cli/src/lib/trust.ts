import { style } from './output.js';

export function trustBadge(trust: string): string {
  if (trust === 'verified') return style.success('[verified]');
  if (trust === 'known') return style.warning('[known]');
  return style.danger('[experimental]');
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
