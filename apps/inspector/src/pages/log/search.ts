import type { Log } from '@/hooks/use-logs';

/**
 * Text matching for the log search.
 *
 * Its own module, with no React in it, so it can be tested directly. The bug
 * that put it here — `log.str.toLowerCase()` throwing on a log whose `str` the
 * runtime omitted — was only reachable through the component, which meant the
 * cheapest possible test could not reach it either.
 *
 * Deliberately tolerant. Logs arriving over the WebSocket are not validated
 * against the schema, and searching is what someone does when the output already
 * looks wrong: it is the last place that should be strict about shape.
 */
export function searchableText(log: Log): string {
  const message = typeof log.str === 'string' ? log.str : '';
  const type = typeof log.type === 'string' ? log.type : '';
  return `${message}\n${type}`.toLowerCase();
}

export function matchesSearch(log: Log, needle: string): boolean {
  if (!needle) return true;
  return searchableText(log).includes(needle);
}
