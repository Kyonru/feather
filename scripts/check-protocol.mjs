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
      `  A runtime and desktop built from this commit would refuse to talk to each other.`,
  );
}

if (tsMin > ts) {
  problems.push(
    `FEATHER_PROTOCOL_MIN_SUPPORTED (v${tsMin}) is newer than FEATHER_PROTOCOL_VERSION (v${ts}) in ${tsFile}.\n` +
      `  The desktop app would reject every runtime, including its own.`,
  );
}

if (problems.length > 0) {
  console.error('[feather] Protocol check failed.\n');
  for (const problem of problems) {
    console.error(`  ${problem}\n`);
  }
  console.error('Bump both declarations together, or fix the supported range.');
  process.exit(1);
}

console.log(`[feather] Protocol OK — v${ts} (desktop supports v${tsMin}..v${ts}), runtime advertises v${lua}.`);
