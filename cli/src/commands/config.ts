import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fail } from '../lib/command.js';
import { loadConfig, luaValue, type FeatherConfig } from '../lib/config.js';
import { assertSafeProjectTarget } from '../lib/path-safety.js';
import { pluginCatalog } from '../generated/plugin-catalog.js';
import { mergeCapabilities } from '../ui/init/config.js';
import { icon, printLine } from '../lib/output.js';
import { findConfigDir } from '../lib/paths.js';

export type ConfigPluginsOptions = {
  dir?: string;
  include?: string;
  exclude?: string;
};

export type ConfigManagedOptions = {
  dir?: string;
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

function upsertTopLevelValue(source: string, key: string, value: unknown): string {
  const rendered = value === undefined ? undefined : `  ${key} = ${luaValue(value, 2)},`;
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

  writeFileSync(configPath, nextSource);
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
