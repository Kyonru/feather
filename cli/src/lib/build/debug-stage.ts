import { createHash } from 'node:crypto';
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ResolvedBuildConfig } from './config.js';
import { copyDirectory } from './files.js';
import { featherRoot, pluginsRoot } from '../shim.js';

export type MobileDebugStageOptions = {
  enabled?: boolean;
  runtimeConfigPath?: string;
  noPlugins?: boolean;
  featherOverride?: string;
  pluginsOverride?: string;
};

export type MobileDebugStageInfo = {
  enabled: boolean;
  configPath?: string;
  generatedConfig: boolean;
  signature: string;
};

export function embedMobileDebuggerStage(
  config: ResolvedBuildConfig,
  stageDir: string,
  options: MobileDebugStageOptions = {},
): MobileDebugStageInfo {
  if (options.enabled === false) {
    return signature({ enabled: false, generatedConfig: false });
  }

  const originalMain = join(stageDir, 'main.lua');
  if (!existsSync(originalMain)) {
    throw new Error('Feather debugger embedding requires main.lua in the staged game.');
  }
  const relocatedMain = join(stageDir, '.feather-main.lua');
  if (existsSync(relocatedMain)) {
    throw new Error('Feather debugger embedding cannot use .feather-main.lua because that file already exists in the game.');
  }

  const featherDir = featherRoot(options.featherOverride);
  if (!existsSync(join(featherDir, 'auto.lua'))) {
    throw new Error(`Feather runtime not found at ${featherDir}.`);
  }

  const runtimeConfig = resolveRuntimeConfig(config, options.runtimeConfigPath);
  const generatedConfig = runtimeConfig
    ? readFileSync(runtimeConfig, 'utf8')
    : generatedMobileConfig(config.name);

  rmSync(join(stageDir, 'feather'), { recursive: true, force: true });
  rmSync(join(stageDir, 'plugins'), { recursive: true, force: true });
  renameSync(originalMain, relocatedMain);
  copyDirectory(featherDir, join(stageDir, 'feather'));

  const pluginDir = options.pluginsOverride
    ? resolve(options.pluginsOverride)
    : pluginsRoot(featherDir, options.featherOverride);

  if (!options.noPlugins) {
    if (existsSync(pluginDir)) {
      copyDirectory(pluginDir, join(stageDir, 'plugins'));
    }
  }

  writeFileSync(join(stageDir, 'feather.config.lua'), generatedConfig);
  writeFileSync(join(stageDir, 'main.lua'), mobileMainWrapper());

  return signature({
    enabled: true,
    configPath: runtimeConfig,
    generatedConfig: !runtimeConfig,
    configSource: generatedConfig,
    noPlugins: Boolean(options.noPlugins),
    featherDir,
    pluginsDir: options.noPlugins ? undefined : pluginDir,
  });
}

function resolveRuntimeConfig(config: ResolvedBuildConfig, override: string | undefined): string | undefined {
  const candidates = override
    ? [resolve(config.projectDir, override)]
    : [
        join(config.sourceDir, 'feather.config.lua'),
        join(config.sourceDir, '.featherrc.lua'),
        join(config.projectDir, 'feather.config.lua'),
        join(config.projectDir, '.featherrc.lua'),
      ];
  return candidates.find((candidate) => existsSync(candidate));
}

function generatedMobileConfig(name: string): string {
  return [
    '-- feather.config.lua',
    '-- Generated only inside Feather dev build staging.',
    '-- The source project is not modified.',
    'return {',
    `  sessionName = ${JSON.stringify(name)},`,
    '  debug = true,',
    '  wrapPrint = true,',
    '  autoRegisterErrorHandler = true,',
    '  captureScreenshot = false,',
    '  __DANGEROUS_INSECURE_CONNECTION__ = true,',
    '  debugOverlay = {',
    '    enabled = true,',
    '    visible = true,',
    '    hideKey = "f12",',
    '    touchToggle = true,',
    '    corner = "top-right",',
    '  },',
    '}',
    '',
  ].join('\n');
}

function mobileMainWrapper(): string {
  return [
    '-- Feather debugger injector - generated in build staging only.',
    'FEATHER_PATH = "feather"',
    'FEATHER_PLUGIN_PATH = ""',
    '',
    'local function loadFeatherConfig()',
    '  local chunk, err = love.filesystem.load("feather.config.lua")',
    '  if not chunk then error("[feather] Could not load feather.config.lua: " .. tostring(err), 2) end',
    '  local ok, config = pcall(chunk)',
    '  if not ok then error("[feather] Could not evaluate feather.config.lua: " .. tostring(config), 2) end',
    '  if type(config) ~= "table" then config = {} end',
    '  if config.debug == nil then config.debug = true end',
    '  if config.wrapPrint == nil then config.wrapPrint = true end',
    '  if config.autoRegisterErrorHandler == nil then config.autoRegisterErrorHandler = true end',
    '  return config',
    'end',
    '',
    'FEATHER_AUTO_CONFIG = loadFeatherConfig()',
    'require("feather.auto")',
    '',
    'local gameMain, err = love.filesystem.load(".feather-main.lua")',
    'if not gameMain then error("[feather] Could not load original main.lua: " .. tostring(err), 2) end',
    'gameMain()',
    '',
  ].join('\n');
}

function signature(input: Record<string, unknown>): MobileDebugStageInfo {
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return {
    enabled: Boolean(input.enabled),
    configPath: typeof input.configPath === 'string' ? input.configPath : undefined,
    generatedConfig: Boolean(input.generatedConfig),
    signature: hash,
  };
}
