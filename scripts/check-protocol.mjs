/**
 * Verify the wire protocol version agrees across the layers that negotiate it.
 *
 * The Lua runtime advertises `protocolVersion` at `feather:hello`; the desktop
 * app compares it against its own supported range. Those two numbers live in
 * different languages and cannot import each other, so this check is what stops
 * them from drifting.
 *
 * Run: npm run check:protocol
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(relative) {
  return readFileSync(join(root, relative), 'utf8');
}

function extract(source, pattern, label, file) {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not find ${label} in ${file}`);
  }
  return Number(match[1]);
}

const luaFile = 'src-lua/feather/init.lua';
const tsFile = 'src/constants/feather-protocol.ts';

const lua = extract(
  read(luaFile),
  /^local FEATHER_PROTOCOL_VERSION = (\d+)/m,
  'FEATHER_PROTOCOL_VERSION',
  luaFile,
);

const tsSource = read(tsFile);
const ts = extract(
  tsSource,
  /^export const FEATHER_PROTOCOL_VERSION = (\d+);/m,
  'FEATHER_PROTOCOL_VERSION',
  tsFile,
);
const tsMin = extract(
  tsSource,
  /^export const FEATHER_PROTOCOL_MIN_SUPPORTED = (\d+);/m,
  'FEATHER_PROTOCOL_MIN_SUPPORTED',
  tsFile,
);

const problems = [];

if (lua !== ts) {
  problems.push(
    `Protocol version mismatch: ${luaFile} declares v${lua}, ${tsFile} declares v${ts}.\n` +
      `  A runtime and desktop built from this commit would refuse to talk to each other.\n` +
      `  Bump both declarations together.`,
  );
}

if (tsMin > ts) {
  problems.push(
    `FEATHER_PROTOCOL_MIN_SUPPORTED (v${tsMin}) is newer than FEATHER_PROTOCOL_VERSION (v${ts}) in ${tsFile}.\n` +
      `  The desktop app would reject every runtime, including its own.`,
  );
}

// ---------------------------------------------------------------------------
// Message registry vs. the live dispatch tables.
//
// packages/protocol declares which messages exist. These two dispatch tables
// are what actually runs. If they disagree, either the UI is sending a command
// nothing handles, or the runtime is emitting something nothing listens for.
// ---------------------------------------------------------------------------

function parseRegistryList(source, name) {
  const match = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  if (!match) {
    throw new Error(`Could not find ${name} in packages/protocol/src/messages.ts`);
  }
  return new Set([...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
}

function compare(label, registry, live, registrySource, liveSource, fixes = {}) {
  const missingFromRegistry = [...live].filter((t) => !registry.has(t)).sort();
  const missingFromLive = [...registry].filter((t) => !live.has(t)).sort();

  if (missingFromRegistry.length > 0) {
    problems.push(
      `${label}: handled in ${liveSource} but not declared in ${registrySource}:\n` +
        missingFromRegistry.map((t) => `    ${t}`).join('\n') +
        `\n  ${fixes.extra ?? 'Add it to the registry, or remove the handler if it is dead.'}`,
    );
  }
  if (missingFromLive.length > 0) {
    problems.push(
      `${label}: declared in ${registrySource} but not handled in ${liveSource}:\n` +
        missingFromLive.map((t) => `    ${t}`).join('\n') +
        `\n  ${fixes.missing ?? 'Implement the handler, or drop it from the registry.'}`,
    );
  }
}

const registrySource = 'packages/protocol/src/messages.ts';
const registry = read(registrySource);
const toGame = parseRegistryList(registry, 'TO_GAME');
const toDesktop = parseRegistryList(registry, 'TO_DESKTOP');

const luaRuntime = read(luaFile);
const handleCommand = luaRuntime.slice(luaRuntime.indexOf('function Feather:__handleCommand'));
const liveToGame = new Set([...handleCommand.matchAll(/type == "([a-z_]+:[a-zA-Z:_-]+)"/g)].map((m) => m[1]));

const wsHook = read('src/hooks/use-ws-connection.ts');
const liveToDesktop = new Set([...wsHook.matchAll(/^\s+case '([^']+)':/gm)].map((m) => m[1]));

compare('desktop -> game', toGame, liveToGame, registrySource, `${luaFile} __handleCommand`);
compare('game -> desktop', toDesktop, liveToDesktop, registrySource, 'src/hooks/use-ws-connection.ts');

// The generated Lua table must match the registry, or the runtime will warn
// about commands that are perfectly valid (or stay silent about ones that are not).
const generatedLuaFile = 'src-lua/feather/protocol_messages.lua';
const generatedLua = new Set(
  [...read(generatedLuaFile).matchAll(/\["([^"]+)"\] = true/g)].map((m) => m[1]),
);
compare('generated Lua table', toGame, generatedLua, registrySource, generatedLuaFile, {
  missing: 'The generated file is stale — run: npm run generate:protocol-lua',
  extra: 'The generated file is stale — run: npm run generate:protocol-lua',
});

if (problems.length > 0) {
  console.error('[feather] Protocol check failed.\n');
  for (const problem of problems) {
    console.error(`  ${problem}\n`);
  }
  process.exit(1);
}

console.log(
  `[feather] Protocol OK — v${ts} (desktop supports v${tsMin}..v${ts}), runtime advertises v${lua}. ` +
    `${toGame.size} desktop->game and ${toDesktop.size} game->desktop messages match their dispatch tables.`,
);
