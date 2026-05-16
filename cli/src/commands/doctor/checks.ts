import { existsSync, readFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { readPluginManifest } from '../../lib/plugin-utils.js';

export type Severity = 'pass' | 'warn' | 'fail' | 'info';

export type DoctorCheck = {
  group: string;
  label: string;
  severity: Severity;
  detail?: string;
  fix?: string;
};

export type DoctorOptions = {
  installDir?: string;
  host?: string;
  port?: number;
  json?: boolean;
  production?: boolean;
  security?: boolean;
  buildTarget?: string;
  uploadTarget?: string;
  release?: boolean;
};

export const severityOrder: Record<Severity, number> = {
  fail: 0,
  warn: 1,
  info: 2,
  pass: 3,
};

export function add(
  checks: DoctorCheck[],
  group: string,
  label: string,
  severity: Severity,
  detail?: string,
  fix?: string,
): void {
  checks.push({ group, label, severity, detail, fix });
}

export function portReachable(port: number, host = '127.0.0.1', timeout = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = createConnection({ port, host });
    const timer = setTimeout(() => {
      sock.destroy();
      resolve(false);
    }, timeout);
    sock.once('connect', () => {
      clearTimeout(timer);
      sock.destroy();
      resolve(true);
    });
    sock.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

export function commandVersion(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error || result.status !== 0) return null;
  return (result.stdout || result.stderr).trim().split('\n')[0] ?? null;
}

export function readIfExists(path: string): string | null {
  if (!existsSync(path)) return null;
  return readFileSync(path, 'utf8');
}

export function uncommentedLua(src: string): string {
  return src
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

export function luaBoolEnabled(src: string, key: string): boolean {
  return new RegExp(`${key}\\s*=\\s*true\\b`).test(src);
}

export function luaStringValue(src: string, key: string): string | null {
  const match = src.match(new RegExp(`${key}\\s*=\\s*["']([^"']*)["']`));
  return match?.[1] ?? null;
}

export function hasConfigArrayValue(src: string, key: string, value: string): boolean {
  const match = src.match(new RegExp(`${key}\\s*=\\s*\\{([\\s\\S]*?)\\}`));
  return match ? new RegExp(`["']${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`).test(match[1]) : false;
}

export function configArrayValues(src: string, key: string): string[] {
  const match = src.match(new RegExp(`${key}\\s*=\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) return [];
  return [...match[1].matchAll(/["']([^"']+)["']/g)].map((item) => item[1]);
}

export function isWeakApiKey(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length < 24 || value === 'change-me' || value === 'dev';
}

export function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1';
}

export function isWildcardHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  return normalized === '0.0.0.0' || normalized === '::';
}

export function isLanHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (isLoopbackHost(normalized) || isWildcardHost(normalized)) return false;
  if (/^10\./.test(normalized)) return true;
  if (/^192\.168\./.test(normalized)) return true;
  const match = normalized.match(/^172\.(\d+)\./);
  return match ? Number(match[1]) >= 16 && Number(match[1]) <= 31 : false;
}

export function shellArg(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) return value;
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function buildPluginIndex(pluginDirs: string[]): Map<string, { dir: string; name: string; version: string }> {
  const plugins = new Map<string, { dir: string; name: string; version: string }>();
  for (const dir of pluginDirs) {
    const manifest = readPluginManifest(dir);
    if (manifest?.id) {
      plugins.set(manifest.id, { dir, name: manifest.name || basename(dir), version: manifest.version || 'unknown' });
    }
  }
  return plugins;
}
