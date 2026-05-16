import { statusLine, style } from './output.js';

export type CliErrorOptions = {
  exitCode?: number;
  details?: string[];
  cause?: unknown;
  silent?: boolean;
};

export class CliError extends Error {
  exitCode: number;
  details: string[];
  silent: boolean;

  constructor(message: string, options: CliErrorOptions = {}) {
    super(message);
    this.name = 'CliError';
    this.exitCode = options.exitCode ?? 1;
    this.details = options.details ?? [];
    this.silent = options.silent ?? false;
    if (options.cause !== undefined) this.cause = options.cause;
  }
}

export function fail(message: string, options: CliErrorOptions = {}): never {
  throw new CliError(message, options);
}

export async function runCliAction(action: () => Promise<void | number> | void | number): Promise<void> {
  try {
    const result = await action();
    if (typeof result === 'number') process.exitCode = result;
  } catch (err) {
    if (err instanceof CliError) {
      if (!err.silent && err.message) {
        console.error(statusLine('error', err.message));
        for (const detail of err.details) console.error(style.muted(`  ${detail}`));
      }
      process.exitCode = err.exitCode;
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error(statusLine('error', message || 'Unexpected error'));
    if (process.env.FEATHER_DEBUG === '1' && err instanceof Error && err.stack) {
      console.error(style.muted(err.stack));
    }
    process.exitCode = 1;
  }
}

