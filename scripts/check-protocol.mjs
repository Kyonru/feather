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
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function read(relative) {
  return readFileSync(resolve(root, relative), 'utf8');
}

function extract(source, pattern, label, file) {
  const match = source.match(pattern);
  if (!match) {
    throw new Error(`Could not find ${label} in ${file}`);
  }
  return Number(match[1]);
}

const luaFile = 'packages/runtime-lua/feather/init.lua';
const tsFile = 'apps/inspector/src/constants/feather-protocol.ts';

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

const wsHook = read('apps/inspector/src/hooks/use-ws-connection.ts');
const liveToDesktop = new Set([...wsHook.matchAll(/^\s+case '([^']+)':/gm)].map((m) => m[1]));

compare('desktop -> game', toGame, liveToGame, registrySource, `${luaFile} __handleCommand`);
compare('game -> desktop', toDesktop, liveToDesktop, registrySource, 'apps/inspector/src/hooks/use-ws-connection.ts');

// The generated Lua table must match the registry, or the runtime will warn
// about commands that are perfectly valid (or stay silent about ones that are not).
const generatedLuaFile = 'packages/runtime-lua/feather/protocol_messages.lua';
const generatedLua = new Set(
  [...read(generatedLuaFile).matchAll(/\["([^"]+)"\] = true/g)].map((m) => m[1]),
);
compare('generated Lua table', toGame, generatedLua, registrySource, generatedLuaFile, {
  missing: 'The generated file is stale — run: npm run generate:protocol-lua',
  extra: 'The generated file is stale — run: npm run generate:protocol-lua',
});

// ---------------------------------------------------------------------------
// The Inspector↔Studio bridge version.
//
// Declared twice for the same reason as the wire protocol: the TypeScript
// contract and the Rust server cannot import each other. Studio also declares
// the range it supports, and Inspector owns the translation to a runtime — so
// Studio must never declare a runtime range of its own.
// ---------------------------------------------------------------------------

// Overridable so `scripts/tests/bridgeContractDrift.test.mjs` can prove the
// check fires against drifted copies without touching the real files.
const bridgeTsFile = process.env.FEATHER_BRIDGE_TS_FILE ?? 'packages/session-bridge/src/contract.ts';
const bridgeRsFile = process.env.FEATHER_BRIDGE_RS_FILE ?? 'apps/inspector/src-tauri/src/studio_bridge.rs';
const bridgeAdaptersFile = process.env.FEATHER_BRIDGE_ADAPTERS_FILE ?? 'packages/session-bridge/src/adapters.ts';

const bridgeTs = extract(read(bridgeTsFile), /^export const BRIDGE_VERSION = (\d+);/m, 'BRIDGE_VERSION', bridgeTsFile);
const bridgeTsMin = extract(
  read(bridgeTsFile),
  /^export const BRIDGE_MIN_SUPPORTED = (\d+);/m,
  'BRIDGE_MIN_SUPPORTED',
  bridgeTsFile,
);
const bridgeRs = extract(read(bridgeRsFile), /^pub const BRIDGE_VERSION: u32 = (\d+);/m, 'BRIDGE_VERSION', bridgeRsFile);
const bridgeRsMin = extract(
  read(bridgeRsFile),
  /^pub const BRIDGE_MIN_SUPPORTED: u32 = (\d+);/m,
  'BRIDGE_MIN_SUPPORTED',
  bridgeRsFile,
);

if (bridgeTs !== bridgeRs || bridgeTsMin !== bridgeRsMin) {
  problems.push(
    `Bridge version mismatch: ${bridgeTsFile} declares v${bridgeTsMin}..v${bridgeTs}, ` +
      `${bridgeRsFile} declares v${bridgeRsMin}..v${bridgeRs}.\n` +
      `  Studio and Inspector built from this commit would refuse to pair.\n` +
      `  Bump both declarations together.`,
  );
}

if (bridgeTsMin > bridgeTs) {
  problems.push(
    `BRIDGE_MIN_SUPPORTED (v${bridgeTsMin}) is newer than BRIDGE_VERSION (v${bridgeTs}).\n` +
      `  Inspector would reject every Studio, including its own.`,
  );
}

// The rest of the contract: method names, error codes, the preview allowlist
// and the size limit. A version bump alone does not catch a method renamed on
// one side, a new error code Studio cannot name, or an action Rust forwards that
// TypeScript never meant to allow — which is the one that matters most.
{
  const tsSource = read(bridgeTsFile);
  const rsSource = read(bridgeRsFile);
  const adaptersSource = read(bridgeAdaptersFile);

  const block = (source, pattern, label, file) => {
    const match = source.match(pattern);
    if (!match) throw new Error(`Could not find ${label} in ${file}`);
    return match[1];
  };
  const quoted = (text) => [...text.matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const product = (text) => text.split('*').reduce((total, part) => total * Number(part.trim()), 1);
  const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
  const diff = (a, b) => a.filter((item) => !b.includes(item));

  const tsMethods = quoted(block(tsSource, /export const BRIDGE_METHODS = \[([\s\S]*?)\] as const;/, 'BRIDGE_METHODS', bridgeTsFile));
  const rsMethods = quoted(block(rsSource, /pub const BRIDGE_METHODS: &\[&str\] = &\[([\s\S]*?)\];/, 'BRIDGE_METHODS', bridgeRsFile));
  if (!sameSet(tsMethods, rsMethods)) {
    problems.push(
      `Bridge methods differ.\n` +
        `  Only in TypeScript: ${diff(tsMethods, rsMethods).join(', ') || '—'}\n` +
        `  Only in Rust: ${diff(rsMethods, tsMethods).join(', ') || '—'}`,
    );
  }
  for (const method of rsMethods.filter((method) => method !== 'handshake')) {
    if (!new RegExp(`"${method.replace('.', '\\.')}"\\s*(=>|\\|)`).test(rsSource)) {
      problems.push(`${bridgeRsFile} declares "${method}" but has no match arm handling it.`);
    }
  }

  const tsCodes = quoted(
    block(tsSource, /export const BRIDGE_SERVER_ERROR_CODES = \[([\s\S]*?)\] as const;/, 'BRIDGE_SERVER_ERROR_CODES', bridgeTsFile),
  );
  const rsCodes = quoted(
    block(rsSource, /pub const BRIDGE_SERVER_ERROR_CODES: &\[&str\] = &\[([\s\S]*?)\];/, 'BRIDGE_SERVER_ERROR_CODES', bridgeRsFile),
  );
  if (!sameSet(tsCodes, rsCodes)) {
    problems.push(
      `Bridge error codes differ.\n` +
        `  Only in TypeScript: ${diff(tsCodes, rsCodes).join(', ') || '—'}\n` +
        `  Only in Rust: ${diff(rsCodes, tsCodes).join(', ') || '—'}`,
    );
  }
  const rsUsed = [...rsSource.matchAll(/\bfail\([^,()]*(?:\([^()]*\))?[^,()]*,\s*"([a-z-]+)"/g)].map((m) => m[1]);
  const tsUsed = [...adaptersSource.matchAll(/\bfail\([^,()]*,\s*'([a-z-]+)'/g)].map((m) => m[1]);
  for (const [file, used] of [
    [bridgeRsFile, rsUsed],
    [bridgeAdaptersFile, tsUsed],
  ]) {
    const undeclared = [...new Set(used.filter((code) => !tsCodes.includes(code)))];
    if (undeclared.length) {
      problems.push(`${file} answers with undeclared bridge error codes: ${undeclared.join(', ')}.`);
    }
  }

  const tsAllow = Object.fromEntries(
    [
      ...block(tsSource, /export const PREVIEW_ALLOWLIST[^=]*= \{([\s\S]*?)\};/, 'PREVIEW_ALLOWLIST', bridgeTsFile).matchAll(
        /['"]([^'"]+)['"]\s*:\s*\[([^\]]*)\]/g,
      ),
    ].map((m) => [m[1], quoted(m[2])]),
  );
  const rsAllow = Object.fromEntries(
    [
      ...block(rsSource, /pub const PREVIEW_ALLOWLIST: [^=]*= &\[([\s\S]*?)\];\n/, 'PREVIEW_ALLOWLIST', bridgeRsFile).matchAll(
        /\(\s*"([^"]+)"\s*,\s*&\[([^\]]*)\]\s*\)/g,
      ),
    ].map((m) => [m[1], quoted(m[2])]),
  );
  for (const plugin of new Set([...Object.keys(tsAllow), ...Object.keys(rsAllow)])) {
    const a = tsAllow[plugin] ?? [];
    const b = rsAllow[plugin] ?? [];
    if (!sameSet(a, b)) {
      problems.push(
        `Preview allowlist for "${plugin}" differs: TypeScript allows [${a.join(', ')}], Rust allows [${b.join(', ')}].\n` +
          `  Rust is what forwards to the game, so an action only it allows is reachable without review.`,
      );
    }
  }

  const tsLimit = product(block(tsSource, /export const BRIDGE_MAX_REQUEST_BYTES = ([\d\s*]+);/, 'BRIDGE_MAX_REQUEST_BYTES', bridgeTsFile));
  const rsLimit = product(block(rsSource, /pub const BRIDGE_MAX_REQUEST_BYTES: usize = ([\d\s*]+);/, 'BRIDGE_MAX_REQUEST_BYTES', bridgeRsFile));
  const tsHandshake = product(block(tsSource, /export const BRIDGE_MAX_HANDSHAKE_BYTES = ([\d\s*]+);/, 'BRIDGE_MAX_HANDSHAKE_BYTES', bridgeTsFile));
  const rsHandshake = product(block(rsSource, /pub const BRIDGE_MAX_HANDSHAKE_BYTES: usize = ([\d\s*]+);/, 'BRIDGE_MAX_HANDSHAKE_BYTES', bridgeRsFile));
  if (tsLimit !== rsLimit || tsHandshake !== rsHandshake) {
    problems.push(
      `Bridge size limits differ: TypeScript ${tsLimit}/${tsHandshake} bytes, Rust ${rsLimit}/${rsHandshake} bytes (request/handshake).`,
    );
  }
}

// Studio must not declare a runtime compatibility range. Inspector owns that
// translation; a Studio that claimed one would be asserting something about a
// game it never talks to directly.
const studioSources = [
  'apps/studio/src/useInspectorBridge.ts',
  'apps/studio/src/StudioApp.tsx',
];
for (const file of studioSources) {
  const source = read(file);
  if (/FEATHER_PROTOCOL_(VERSION|MIN_SUPPORTED)/.test(source)) {
    problems.push(
      `${file} references the runtime wire protocol version.\n` +
        `  Studio pairs with Inspector over the bridge and never speaks to a game\n` +
        `  directly, so Inspector owns runtime compatibility. Use the bridge version.`,
    );
  }
}

if (problems.length > 0) {
  console.error('[feather] Protocol check failed.\n');
  for (const problem of problems) {
    console.error(`  ${problem}\n`);
  }
  process.exit(1);
}

console.log(
  `[feather] Protocol OK — wire v${ts} (desktop supports v${tsMin}..v${ts}), runtime advertises v${lua}; ` +
    `bridge v${bridgeTsMin}..v${bridgeTs}, its methods, error codes, allowlist and limits agreed by TypeScript and Rust. ` +
    `${toGame.size} desktop->game and ${toDesktop.size} game->desktop messages match their dispatch tables.`,
);
