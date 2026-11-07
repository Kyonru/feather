import type { Log } from '@/hooks/use-logs';

/** The runtime's `.featherlog` format is one JSON log record per line. */
export function serializeFeatherLogs(logs: Log[]): string {
  return `${logs.map((log) => JSON.stringify(log)).join('\n')}\n`;
}
