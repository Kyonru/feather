import chalk from 'chalk';
import ora, { type Ora } from 'ora';
import { redactSensitiveText, redactSensitiveValue } from './redact.js';

const BANNER = [
  '███████╗███████╗ █████╗ ████████╗██╗  ██╗███████╗██████╗ ',
  '██╔════╝██╔════╝██╔══██╗╚══██╔══╝██║  ██║██╔════╝██╔══██╗',
  '█████╗  █████╗  ███████║   ██║   ███████║█████╗  ██████╔╝',
  '██╔══╝  ██╔══╝  ██╔══██║   ██║   ██╔══██║██╔══╝  ██╔══██╗',
  '██║     ███████╗██║  ██║   ██║   ██║  ██║███████╗██║  ██║',
  '╚═╝     ╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝',
].join('\n');

export function printBanner(): void {
  console.log(chalk.cyan(BANNER));
  console.log();
}

export const icon = {
  success: chalk.green('✔'),
  error: chalk.red('✖'),
  warning: chalk.yellow('!'),
  info: chalk.cyan('i'),
  danger: chalk.red('!'),
};

export const style = {
  heading: chalk.bold,
  muted: chalk.dim,
  success: chalk.green,
  warning: chalk.yellow,
  danger: chalk.red,
  info: chalk.cyan,
};

export function heading(message: string): string {
  return style.heading(message);
}

export function statusLine(kind: keyof typeof icon, message: string): string {
  return `${icon[kind]} ${message}`;
}

export function printJson(value: unknown): void {
  console.log(JSON.stringify(redactSensitiveValue(value), null, 2));
}

export function printLine(message = ''): void {
  console.log(redactSensitiveText(message));
}

export function printErrorLine(message = ''): void {
  console.error(redactSensitiveText(message));
}

export function printBlank(): void {
  printLine();
}

export function printLines(lines: string[]): void {
  for (const line of lines) printLine(line);
}

export function printHeading(message: string): void {
  printLine(heading(message));
}

export function printStatus(kind: keyof typeof icon, message: string): void {
  printLine(statusLine(kind, message));
}

export function printMuted(message: string): void {
  printLine(style.muted(message));
}

export function printWarning(message: string): void {
  printLine(style.warning(message));
}

export function printDanger(message: string): void {
  printLine(style.danger(message));
}

export function printSuccess(message: string): void {
  printLine(style.success(message));
}

export function printInfo(message: string): void {
  printLine(style.info(message));
}

export function section(title: string, lines: string[] = []): string[] {
  return ['', heading(title), ...lines, ''];
}

export function createSpinner(text: string): Ora {
  return ora(text);
}

export async function withSpinner<T>(
  text: string,
  action: (spinner: Ora) => Promise<T>,
  messages?: { success?: string; fail?: (err: unknown) => string },
): Promise<T> {
  const spinner = createSpinner(text).start();
  try {
    const result = await action(spinner);
    spinner.succeed(messages?.success ?? text);
    return result;
  } catch (err) {
    spinner.fail(messages?.fail ? messages.fail(err) : (err as Error).message);
    throw err;
  }
}

export function keyValueRows(rows: Array<[string, string | number | undefined | null]>): string[] {
  const visible = rows.filter(([, value]) => value !== undefined && value !== null && value !== '');
  const width = Math.max(0, ...visible.map(([key]) => key.length));
  return visible.map(([key, value]) => `  ${style.muted(key.padEnd(width))}  ${value}`);
}

export function printKeyValues(rows: Array<[string, string | number | undefined | null]>): void {
  printLines(keyValueRows(rows));
}

export function table<Row extends Record<string, string | number | undefined>>(input: {
  columns: Array<{ key: keyof Row; label: string; color?: (value: string, row: Row) => string }>;
  rows: Row[];
  indent?: string;
}): string[] {
  const indent = input.indent ?? '  ';
  const widths = input.columns.map((column) =>
    Math.max(
      column.label.length,
      ...input.rows.map((row) => String(row[column.key] ?? '').length),
    ),
  );

  const header = input.columns
    .map((column, index) => column.label.padEnd(widths[index]!))
    .join('  ');
  const lines = [`${indent}${style.muted(header)}`];

  for (const row of input.rows) {
    lines.push(
      `${indent}${input.columns
        .map((column, index) => {
          const value = String(row[column.key] ?? '').padEnd(widths[index]!);
          return column.color ? column.color(value, row) : value;
        })
        .join('  ')}`,
    );
  }

  return lines;
}

export function printTable<Row extends Record<string, string | number | undefined>>(input: {
  columns: Array<{ key: keyof Row; label: string; color?: (value: string, row: Row) => string }>;
  rows: Row[];
  indent?: string;
}): void {
  printLines(table(input));
}
