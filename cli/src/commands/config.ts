import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fail } from '../lib/command.js';
import { loadConfig, luaValue, type FeatherConfig } from '../lib/config.js';
import { assertSafeProjectTarget } from '../lib/path-safety.js';
import { pluginCatalog } from '../generated/plugin-catalog.js';
import { mergeCapabilities } from '../ui/init/config.js';
import { icon, printJson, printLine } from '../lib/output.js';
import { findConfigDir } from '../lib/paths.js';

export type ConfigPluginsOptions = {
  dir?: string;
  include?: string;
  exclude?: string;
  dryRun?: boolean;
  json?: boolean;
};

export type ConfigManagedOptions = {
  dir?: string;
};

export type ConfigHotReloadOptions = {
  dir?: string;
  allow?: string;
};

const VALID_MANAGED_MODES = ['cli', 'auto', 'manual'] as const;

const knownPluginIds = new Set(pluginCatalog.map((plugin) => plugin.id));

function parseIds(value: string | undefined): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
}

function assertKnownPlugins(ids: string[]): void {
  const unknown = ids.filter((id) => !knownPluginIds.has(id));
  if (unknown.length > 0) {
    fail(`Unknown plugin: ${unknown[0]}`, {
      details: [`Available: ${[...knownPluginIds].sort().join(', ')}`],
    });
  }
}

function setArray(config: Record<string, unknown>, key: 'include' | 'exclude', values: Set<string>): void {
  if (values.size > 0) {
    config[key] = [...values].sort();
  } else {
    delete config[key];
  }
}

function hotReloadDebuggerConfig(allow: string[]): Record<string, unknown> {
  return {
    enabled: true,
    hotReload: {
      enabled: true,
      allow,
      deny: ['main', 'conf', 'feather.*'],
      persistToDisk: false,
      clearOnBoot: false,
      requireLocalNetwork: true,
    },
  };
}

function valueEnd(source: string, start: number): number {
  let i = start;
  while (i < source.length && /\s/.test(source[i])) i++;

  if (source[i] !== '{') {
    const lineEnd = source.indexOf('\n', i);
    return lineEnd === -1 ? source.length : lineEnd;
  }

  let depth = 0;
  let quote: '"' | "'" | null = null;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (quote) {
      if (ch === '\\' && next) {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      i++;
      continue;
    }

    if (ch === '-' && next === '-') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        i++;
        while (i < source.length && /[ \t]/.test(source[i])) i++;
        if (source[i] === ',') i++;
        return i;
      }
    }
    i++;
  }

  return source.length;
}

function replaceTopLevelAssignment(source: string, key: string, rendered: string | undefined): string | undefined {
  const assignment = new RegExp(`^\\s*${key}\\s*=`, 'm');
  const match = assignment.exec(source);
  if (!match) return undefined;

  const equals = source.indexOf('=', match.index);
  const end = valueEnd(source, equals + 1);
  return `${source.slice(0, match.index)}${rendered ?? ''}${source.slice(end)}`;
}

function upsertTopLevelValue(source: string, key: string, value: unknown): string {
  const rendered = value === undefined ? undefined : `  ${key} = ${luaValue(value, 2)},`;
  const replaced = replaceTopLevelAssignment(source, key, rendered);
  if (replaced !== undefined) return replaced;

  const assignment = new RegExp(
    `^\\s*${key}\\s*=\\s*(?:\\{[^\\n]*\\}|"[^"]*"|'[^']*'|true|false|-?\\d+(?:\\.\\d+)?),?\\s*$`,
    'm',
  );
  const inlineAssignment = new RegExp(
    `([,{]\\s*)${key}\\s*=\\s*(?:\\{[^}]*\\}|"[^"]*"|'[^']*'|true|false|-?\\d+(?:\\.\\d+)?)(,?)`,
  );

  if (assignment.test(source)) {
    return source.replace(assignment, rendered ?? '');
  }

  if (rendered && inlineAssignment.test(source)) {
    return source.replace(inlineAssignment, `$1${key} = ${luaValue(value, 2)}$2`);
  }

  if (rendered) {
    const multiLine = source.replace(/return\s*\{\s*\n/, (match) => `${match}${rendered}\n`);
    if (multiLine !== source) return multiLine;
    return source.replace(/return\s*\{\s*\}/, `return {\n${rendered}\n}`);
  }

  return source;
}

export async function configPluginsCommand(opts: ConfigPluginsOptions = {}): Promise<void> {
  const projectDir = findConfigDir(opts.dir ? resolve(opts.dir) : process.cwd());
  const includeIds = parseIds(opts.include);
  const excludeIds = parseIds(opts.exclude);

  if (includeIds.length === 0 && excludeIds.length === 0) {
    fail('No plugin changes requested.', {
      details: ['Pass --include <ids>, --exclude <ids>, or both.'],
    });
  }

  assertKnownPlugins([...includeIds, ...excludeIds]);

  let configPath: string;
  try {
    configPath = assertSafeProjectTarget(projectDir, 'feather.config.lua', 'Config update target');
  } catch (err) {
    fail((err as Error).message);
  }

  if (!existsSync(configPath)) {
    fail(`No feather.config.lua found in ${projectDir}.`, {
      details: ['Run `feather init` first.'],
    });
  }

  const loaded = loadConfig(projectDir);
  if (!loaded) {
    fail(`Failed to load ${join(projectDir, 'feather.config.lua')}.`);
  }

  const config = { ...(loaded as FeatherConfig) } as Record<string, unknown>;
  const originalSource = readFileSync(configPath, 'utf8');
  const include = new Set(
    Array.isArray(config.include) ? config.include.filter((id): id is string => typeof id === 'string') : [],
  );
  const exclude = new Set(
    Array.isArray(config.exclude) ? config.exclude.filter((id): id is string => typeof id === 'string') : [],
  );

  for (const id of includeIds) {
    include.add(id);
    exclude.delete(id);
  }

  for (const id of excludeIds) {
    include.delete(id);
    exclude.add(id);
  }

  setArray(config, 'include', include);
  setArray(config, 'exclude', exclude);

  const mergedCapabilities = mergeCapabilities(config.capabilities as string[] | 'all' | undefined, include);
  if (mergedCapabilities && mergedCapabilities !== 'all') {
    config.capabilities = mergedCapabilities;
  }

  let nextSource = originalSource;
  nextSource = upsertTopLevelValue(nextSource, 'include', config.include);
  nextSource = upsertTopLevelValue(nextSource, 'exclude', config.exclude);
  nextSource = upsertTopLevelValue(nextSource, 'capabilities', config.capabilities);

  const result = {
    projectDir,
    configPath,
    dryRun: opts.dryRun === true,
    include: [...include].sort(),
    exclude: [...exclude].sort(),
    requested: {
      include: includeIds,
      exclude: excludeIds,
    },
    capabilities: Array.isArray(config.capabilities) ? config.capabilities : config.capabilities ?? null,
  };

  if (!opts.dryRun) writeFileSync(configPath, nextSource);
  if (opts.json) {
    printJson(result);
    return;
  }
  printLine(`${icon.success} Updated feather.config.lua plugin settings`);
}

export async function configManagedCommand(mode: string, opts: ConfigManagedOptions = {}): Promise<void> {
  if (!(VALID_MANAGED_MODES as readonly string[]).includes(mode)) {
    fail(`Invalid mode: ${mode}`, {
      details: [`Valid modes: ${VALID_MANAGED_MODES.join(', ')}`],
    });
  }

  const projectDir = findConfigDir(opts.dir ? resolve(opts.dir) : process.cwd());
  let configPath: string;
  try {
    configPath = assertSafeProjectTarget(projectDir, 'feather.config.lua', 'Config update target');
  } catch (err) {
    fail((err as Error).message);
  }

  if (!existsSync(configPath)) {
    fail(`No feather.config.lua found in ${projectDir}.`, {
      details: ['Run `feather init` first.'],
    });
  }

  const source = readFileSync(configPath, 'utf8');
  const next = upsertTopLevelValue(source, 'managed', mode);
  writeFileSync(configPath, next);
  printLine(`${icon.success} Updated managed mode to "${mode}"`);
}

export async function configHotReloadCommand(opts: ConfigHotReloadOptions = {}): Promise<void> {
  const projectDir = findConfigDir(opts.dir ? resolve(opts.dir) : process.cwd());
  const allow = parseIds(opts.allow);

  if (allow.length === 0) {
    fail('No hot reload allowlist requested.', {
      details: ['Pass --allow <module.names>.'],
    });
  }

  let configPath: string;
  try {
    configPath = assertSafeProjectTarget(projectDir, 'feather.config.lua', 'Config update target');
  } catch (err) {
    fail((err as Error).message);
  }

  if (!existsSync(configPath)) {
    fail(`No feather.config.lua found in ${projectDir}.`, {
      details: ['Run `feather init` first.'],
    });
  }

  const loaded = loadConfig(projectDir);
  if (!loaded) {
    fail(`Failed to load ${join(projectDir, 'feather.config.lua')}.`);
  }

  const config = { ...(loaded as FeatherConfig) } as Record<string, unknown>;
  const include = new Set(
    Array.isArray(config.include) ? config.include.filter((id): id is string => typeof id === 'string') : [],
  );
  const exclude = new Set(
    Array.isArray(config.exclude) ? config.exclude.filter((id): id is string => typeof id === 'string') : [],
  );
  include.add('hot-reload');
  exclude.delete('hot-reload');
  setArray(config, 'include', include);
  setArray(config, 'exclude', exclude);

  const mergedCapabilities = mergeCapabilities(config.capabilities as string[] | 'all' | undefined, include);
  if (mergedCapabilities && mergedCapabilities !== 'all') {
    config.capabilities = mergedCapabilities;
  }

  let nextSource = readFileSync(configPath, 'utf8');
  nextSource = upsertTopLevelValue(nextSource, 'debug', true);
  nextSource = upsertTopLevelValue(nextSource, 'autoRegisterErrorHandler', true);
  nextSource = upsertTopLevelValue(nextSource, 'include', config.include);
  nextSource = upsertTopLevelValue(nextSource, 'exclude', config.exclude);
  nextSource = upsertTopLevelValue(nextSource, 'capabilities', config.capabilities);
  nextSource = upsertTopLevelValue(nextSource, 'debugger', hotReloadDebuggerConfig(allow));

  writeFileSync(configPath, nextSource);
  printLine(`${icon.success} Updated hot reload allowlist`);
}
