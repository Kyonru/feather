/**
 * Emit the desktop -> game message set as a Lua table.
 *
 * The Lua runtime cannot import the TypeScript registry, so it gets a generated
 * copy. This exists because of version skew: once the runtime and the desktop
 * ship on separate release trains, a newer desktop can send a command an older
 * runtime has never heard of. Without this table `__handleCommand` falls off the
 * end of its if/elseif chain and the command vanishes silently.
 *
 * Run: npm run generate:protocol-lua   (checked by npm run check:protocol)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../..');

const registry = readFileSync(join(repoRoot, 'packages/protocol/src/messages.ts'), 'utf8');

function parseList(name) {
  const match = registry.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const;`));
  if (!match) throw new Error(`Could not find ${name} in the registry`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const toGame = parseList('TO_GAME');

const body = toGame.map((name) => `  ["${name}"] = true,`).join('\n');

const out = `-- GENERATED FILE — do not edit by hand.
--
-- Source: packages/protocol/src/messages.ts
-- Regenerate: npm run generate:protocol-lua
-- Verified by: npm run check:protocol
--
-- The set of messages the desktop app may send to the game. Used by
-- Feather:__handleCommand to notice a command from a desktop app newer than
-- this runtime, instead of silently ignoring it.

return {
${body}
}
`;

const target = join(repoRoot, 'packages/runtime-lua/feather/protocol_messages.lua');
writeFileSync(target, out);
console.log(`Written packages/runtime-lua/feather/protocol_messages.lua (${toGame.length} desktop->game messages)`);
