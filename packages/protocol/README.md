# @feather/protocol

Single source of truth for the Feather wire protocol message set.

Feather's runtime (Lua), desktop app (React), CLI (TypeScript), and relay (Rust)
all speak one protocol, but until v2 the message names existed only as string
literals in each of them. Nothing could tell you that the desktop handled a
message the runtime never sent, or that a command was removed from the runtime
while the UI still sent it.

`TO_GAME` and `TO_DESKTOP` in `src/messages.ts` declare the full set. Adding a
message means adding it here first — `npm run check:protocol` fails when this
registry and the live dispatch tables disagree:

| Registry | Live dispatch table |
| --- | --- |
| `TO_GAME` | `Feather:__handleCommand` in `packages/runtime-lua/feather/init.lua` |
| `TO_DESKTOP` | the `switch` in `src/hooks/use-ws-connection.ts` |

## Scope

This package currently describes **which messages exist**, not their payload
shapes. Payload schemas and the Lua/Rust generators are the remainder of V2.md
Phase 02b. The message set alone is what makes drift mechanically detectable,
which is the part that matters once the release trains can ship separately.

The negotiated wire protocol *version* lives separately, in
`src/constants/feather-protocol.ts` and `packages/runtime-lua/feather/init.lua`, because both
sides need it before any message is exchanged.
