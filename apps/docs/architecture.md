# Feather architecture

Feather is organized around release boundaries: everything a user installs lives under `apps/`, while `packages/` contains contracts and implementation shared by those applications. This document is the permanent reference for that boundary, its release trains, and the invariants every commit must preserve.

## Layout

```text
feather/
├── apps/                    Everything that ships to a user
│   ├── inspector/  [platform]  Tauri desktop. Session-bound debugging surfaces.
│   ├── studio/     [satellite] Shader graph · texture lab · particle lab.
│   │                           Its own binary, identifier, version and release feed.
│   ├── showcase/   [satellite] Thin shell: Studio for the web. No page code.
│   ├── cli/        [platform]  @kyonru/feather.
│   ├── vscode-extension/ [satellite] Vendors a pinned platform snapshot.
│   └── docs/       [satellite] Zensical site.
├── packages/                Reusable contracts and runtime consumed by applications
│   ├── protocol/   ◆ Wire message registry and envelope.
│   ├── host/       ◆ Environment capabilities. tauri/ and web/ impls.
│   ├── session-bridge/ ◆ Versioned Inspector↔Studio contract.
│   ├── ui/           Shared interface primitives and the theme registry.
│   └── runtime-lua/  The Lua runtime and built-in plugins. To LuaRocks.
└── catalog/
    └── packages/     Love2D package registry.

◆ = the three contracts that make the split hold.
```

**Kept together deliberately:** the 13 Inspector surfaces (one session, sidebar and socket); the
three creative tools (they cross-import, and all live in Studio); the built-in plugins (ride the
platform train with the runtime); `feather-server` with Inspector.

## `packages/protocol` — the cohesion anchor

A TypeScript registry is the source of truth for all 78 wire message names (44 Inspector→game, 34
game→Inspector) and the common envelope. TypeScript consumers use derived unions and guards; a
generator emits the Lua message table; `check:protocol` verifies both live dispatch tables and the
generated output. Payload data stays `unknown` until a handler has a load-bearing reason to own a
schema (D14); Rust stays a transparent relay (D15). A standalone integer `protocolVersion` rides
`feather:hello`, with a named Inspector error on mismatch (D9, D18).

## Runtime and session reliability

The implemented runtime and session safeguards below are permanent behavioral invariants, not
roadmap items:

- An incompatible game remains visible for historical inspection, but Inspector rejects live
  refreshes and mutating commands locally until that session reports a compatible protocol.
- Session lifecycle events affect only their named session. A background game connecting or
  disconnecting cannot replace the active game or mutate another session's connection state.
- A runtime log batch is applied as one state update, and in-memory log and performance histories
  have explicit bounds.

The remaining hardening work and its acceptance checks live in the repository's
[`ROADMAP.md`](https://github.com/Kyonru/feather/blob/v4/ROADMAP.md#reliability-and-maintainability-backlog).

## `packages/host` — what the environment can do

Open a file, save a file, pick a directory, workspace storage, theme, open external. Two
implementations: Tauri (Studio desktop) and web (showcase). Studio owns its workspace state in both;
the host only supplies capabilities (D20).

## `packages/session-bridge` — a versioned process boundary

- Inspector is the only owner of the authenticated game session and WebSocket server.
- Studio runs fully standalone with `bridge: null`; the showcase always does.
- Explicit local pairing lets Studio send the contract's high-level commands to Inspector. Studio
  never probes loopback by itself — a deliberate security property.
- Loopback-only, authenticated with a short-lived Inspector-issued capability, negotiating a bridge
  protocol range. Never log, persist, or put the capability in a URL.
- Disconnect, incompatible-version, revoked-capability and Inspector-not-running states are visible
  and recoverable; a rejected bridge never falls back to an unauthenticated channel.
- Neither application imports the other's source or loads its JavaScript.

32 tests in `packages/session-bridge/test/bridge.test.mts`, most of them negative. Read them before
changing the connection.

## One MCP server, two backends (D32)

`feather mcp` is the one server an agent configures. It routes `/creative/*` to Studio's backend
(:4007) and everything else to Inspector's (:4005). Each app mints its own loopback token per launch
on its own port; neither reads the other's credentials. When the app behind a route is not running,
the error names it (`Feather Studio is not running. Start it and try again.`).

- **Inspector's backend:** sessions, logs, performance, assets, observers, plugin state, runtime
  control, debugger, Console (under its gates), time travel, Session Replay, plugin catalog.
- **Studio's backend:** Shader Graph, Particle Playground and Texture Lab authoring plus local
  creative snapshots, previews and exports. Particle tools mutate Studio's active local workspace
  by default without Inspector; callers pass an explicit `sessionId` only for live-game operations
  such as emission and runtime preview.

`--studio-url` / `--studio-token` (or `FEATHER_STUDIO_MCP_URL` / `FEATHER_STUDIO_MCP_TOKEN`) point
at Studio's side. There is no `--target` flag.

## Release trains and versioning

One compatibility family with independently releasable trains. The platform family is the set of
artifacts that speak the game wire protocol; it is a compatibility concept, not one lock-step train.

| Train | Members | Tag | Publishes |
| --- | --- | --- | --- |
| Coordinated platform | CLI + runtime + Inspector/server | `v4.1.0` | All three at one version, plus `feather-platform.json` (D25) |
| CLI | `cli` | `cli-v*` | npm package and the standalone binaries (D27) |
| Runtime | `runtime-lua` | `runtime-v*` | LuaRocks package and runtime GitHub release |
| Inspector | `inspector`, `feather-server`, MCP session backend (:4005) | `desktop-v*` | Signed/notarized Inspector binaries |
| Studio | `studio`, its Tauri shell, MCP creative backend (:4007) | `studio-v*` | Signed/notarized Studio binaries, own feed |
| Extension | `vscode-extension` | `ext-v*` | GitHub VSIX, Visual Studio Marketplace and Open VSX, vendoring a declared `featherPlatform` |
| Continuous web | `showcase`, `docs` | — | Deployments from `main` |
| Catalog | `catalog/packages` | — | Registry push to the `packages` branch |

**Worked examples:** a CLI patch tags `cli-v4.0.1` and nothing else publishes. A shader graph feature
tags `studio-v1.3.0`; Inspector is untouched. A game protocol change tags `v4.1.0` and moves runtime,
CLI and Inspector together; Studio stays independent unless the bridge contract also changes.

Studio is a separate installed application — own identity (`com.kyonru.love.feather.studio`),
version source, permissions, signing and feed. Inspector never embeds, downloads or executes Studio
code. `scripts/set-version.sh <train> <version>` writes only that train's files;
`scripts/release-tag-version.sh` maps a tag to its train. `scripts/release-train.mjs` validates the
committed version files and tag namespace for any train, defaults to a dry run, and creates and pushes
only the selected tag when `--push` is explicit.

**The honest trade:** "one number, always correct" became "a few declared ranges, verified in CI".
That only works while CI enforces them — a declared-but-unchecked range is worse than lock-step.

## Invariants

These hold for every commit.

1. `main` is always shippable; no change leaves a train un-releasable. Prove release-workflow
   changes with a dry-run or pre-release tag before merging.
2. Protocol changes update the generated Lua table and pass the TypeScript/dispatch-table checks.
   Do not generate Rust types for messages the relay does not deserialize (D15).
3. Cross-package imports go through package entry points, never another package's `src/`.
   Inspector and Studio never import each other (`no-restricted-imports`); shared code goes in
   `packages/`.
4. Generated files stay in sync: `check:registry` and `check:plugin-catalog` pass, and the
   pre-commit hook enforces it.
5. Docs move with the code; symlink targets move in the same commit.
6. Commit scopes must exist in `.husky/commit-msg` before use.
7. `.husky/pre-push` runs `pnpm run test`; do not weaken it without replacing it.
8. Release builds stay Feather-free by default; Console, hot reload, filesystem and network stay
   opt-in.

## Phase record

What each phase delivered, for code comments that cite a phase.

| Phase | Delivered |
| --- | --- |
| 01 | Per-train tags and train-scoped `set-version.sh`; pre-commit enforces only the desktop trio |
| 02a | `protocolVersion` negotiation over `feather:hello`, named mismatch error (D9, D10, D18) |
| 02b | `packages/protocol` registry for names and envelope; generated Lua table; payload schemas declined (D13, D14, D41) |
| 03 | pnpm + Turborepo at the existing layout (D3, D16, D17) |
| 04 | `packages/ui` and `packages/host` extracted; the showcase import inversion removed (D19–D22) |
| 05a | Studio-owned state extracted in place, with an eager persisted-state migration (D28, D37) |
| 05b | Studio application scaffolded; `packages/session-bridge` contract and transport (D38) |
| 05c | The three creative tools moved out of Inspector (D38, D39, D43) |
| 05d | Separate builds, release workflow, showcase as a thin shell, `check:artifact-boundary` (D35) |
| 06 | `runtime-lua` as a package, catalog moved to `catalog/`, CI path filters retired (D23, D24, D40) |

## Glossary

| Term | Meaning |
| --- | --- |
| **Train** | A set of artifacts that version and release together. |
| **Platform family** | Runtime, CLI, Inspector, and server: independently releasable artifacts connected by the game protocol and optionally coordinated by a `v*` tag. |
| **Satellite** | An artifact that releases on its own cadence and declares a compatibility range. |
| **Contract** | A typed, versioned seam between independently released code: protocol, host, or session bridge. |
| **Host** | The environment a UI runs in—Tauri desktop or browser—and the capabilities it provides. |
| **Bridge** | The authenticated, optional local process connection from Studio to an Inspector-owned live game session. |
| **MCP session/debug backend** | Inspector-owned automation for live sessions, runtime state, plugins, debugger, Console, time travel, and replay. Served on port 4005 and reached through `feather mcp`. |
| **MCP creative backend** | Studio-owned automation for shader, particle, texture, and other creative workflows. Served on port 4007 and reached through `feather mcp` at `/creative/*`. |
| **Inspector** | The session-bound Feather desktop application: debugging, logs, performance, assets, plugins, and related surfaces. |
| **Studio** | The separate desktop/web application containing Shader Graph, Texture Lab, and Particle Playground. |
