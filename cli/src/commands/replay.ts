import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fail } from '../lib/command.js';
import { assertSafeProjectTarget } from '../lib/path-safety.js';
import { icon, printLine, printMuted, printWarning, style } from '../lib/output.js';
import { bundledLuaRoot, repoLuaRoot } from '../lib/paths.js';
import { configPluginsCommand } from './config.js';

export type ReplayInitOptions = {
  dir?: string;
  path?: string;
  force?: boolean;
  config?: boolean;
};

const DEFAULT_ADAPTER_PATH = 'dev/replay.lua';
const ADAPTER_TEMPLATE_PATH = join('plugins', 'session-replay', 'replay_adapter.lua');

function replayAdapterTemplate(): string {
  const candidates = [join(bundledLuaRoot(), ADAPTER_TEMPLATE_PATH)];
  const repoRoot = repoLuaRoot();
  if (repoRoot) candidates.push(join(repoRoot, ADAPTER_TEMPLATE_PATH));

  for (const path of candidates) {
    if (existsSync(path)) return readFileSync(path, 'utf8');
  }

  fail('Session Replay adapter template was not found.', {
    details: [`Expected ${ADAPTER_TEMPLATE_PATH} in bundled cli/lua or src-lua.`],
  });
}

function usageSnippet(adapterPath: string): string {
  const moduleName = adapterPath.replace(/\.lua$/i, '').replace(/[\\/]/g, '.');
  return `local replay = require("${moduleName}")

function love.load()
  replay.register()
end

function love.keypressed(key)
  if key == "f5" then
    replay.start()
  elseif key == "f6" then
    replay.stop()
  elseif key == "f7" then
    replay.play()
  end
end`;
}

export async function replayInitCommand(opts: ReplayInitOptions = {}): Promise<void> {
  const projectDir = resolve(opts.dir ?? '.');
  const adapterPath = opts.path ?? DEFAULT_ADAPTER_PATH;

  const mainPath = assertSafeProjectTarget(projectDir, 'main.lua', 'main.lua check target');
  if (!existsSync(mainPath)) {
    fail(`No main.lua found in ${projectDir}. Is this a LÖVE project?`);
  }

  const targetPath = assertSafeProjectTarget(projectDir, adapterPath, 'Replay adapter target');
  if (existsSync(targetPath) && !opts.force) {
    fail(`Replay adapter already exists: ${adapterPath}`, {
      details: ['Pass --force to overwrite it, or use --path <relative/path.lua>.'],
    });
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, replayAdapterTemplate());
  printLine(`${icon.success} Created ${adapterPath}`);

  const configPath = assertSafeProjectTarget(projectDir, 'feather.config.lua', 'Config check target');
  if (opts.config !== false) {
    if (existsSync(configPath)) {
      await configPluginsCommand({ dir: projectDir, include: 'session-replay' });
    } else {
      printWarning('No feather.config.lua found; skipped enabling session-replay.');
      printMuted('  Run `feather init` first, or add `include = { "session-replay" }` manually.');
    }
  }

  printLine(`\n${style.heading('Replay adapter usage')}`);
  printMuted(usageSnippet(adapterPath));

  const source = readFileSync(targetPath, 'utf8');
  if (!source.includes('replayRegister')) {
    fail('Replay adapter scaffold was written but does not contain replayRegister.');
  }
}
