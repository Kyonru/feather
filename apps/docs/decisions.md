# Architecture decisions

These records preserve the decisions made during Feather's v4 architecture work so they are not relitigated. Add new records to this list; do not edit past entries.

**D1 — Organizing principle is release boundaries, not module boundaries.**
Release coupling was identified as the only day-to-day pain. Splitting by module aesthetics would
move files without changing what ships together.

**D2 — Hybrid versioning: one platform train, four satellites.**
Full independence would require a compatibility matrix across runtime, CLI, server, and UI. Full
lock-step is the current problem. The platform set is exactly "things that must agree on the wire
protocol."

**D3 — pnpm + Turborepo.**
Strict linking enforces the package boundaries this plan creates; npm hoisting would let them decay
silently. Turbo's graph replaces the nine hand-maintained CI path filters.

**D4 — The inspector's 13 surfaces stay one app.**
They share a session, a sidebar, and a socket. No release-boundary justification exists.

**D5 — Protocol typing precedes train decoupling in effect, not in order.**
Phase 01 ships first because it is revertable and delivers the stated goal, but Phase 02 must follow
immediately, because 01 is what makes version skew reachable by users.

**D23 — Moving a directory one level deeper broke two path assumptions.**
`src-lua` sat one level below the root; `packages/runtime-lua` sits two. Two places had quietly
encoded that depth. `cli/test/commands/run.test.mjs` derived the repo root as `dirname(LOCAL_SRC)`,
which now points at `packages/` — caught by a failing CLI test. And the runtime release workflow did
`cd packages/runtime-lua && zip -r ../feather-*.zip`, which would have written the archive into
`packages/` while the GitHub Release step looked for it at the root. The second would only have
surfaced during an actual release.

**D32 — One MCP server, routed to two backends.**
The original plan proposed an Inspector-owned MCP and a Studio-owned MCP with `--target` to choose between them.
Rejected on the owner's call, and it is the better answer. MCP's consumer is an agent: making it
configure two servers with two tokens is worse for exactly the audience the feature serves, and
`feather mcp setup --client claude` writes one entry today. The server is also not a release
boundary — its capability tracks Inspector and Studio, it has no cadence of its own, and it already
ships inside the CLI binary, which is the hermetic install path. Splitting it would be, in the
architecture principle's
words, "an excuse to reorganize code that ships together and always has".

What genuinely changed is that creative state moved to a second process, so the single server now
routes: `/creative/*` to Studio's own loopback endpoint, everything else to Inspector. A missing
application is named in the error rather than surfacing as a refused connection.

This also uncovered a break introduced in 05c: Studio's frontend MCP transport was calling
`set_mcp_creative_snapshot` and `resolve_mcp_creative_request`, Tauri commands that live in
*Inspector's* shell. Studio had no `invoke_handler` at all, so its creative MCP was dead code that
would have thrown. `apps/studio/src-tauri/src/creative_mcp.rs` implements them.

Studio therefore gains `axum` and `tokio`, which 05b's comment said would breach the boundary. That
comment was too blunt. The boundary is not "no HTTP server" but "no second path to a running game":
this endpoint serves Studio's own authoring state, and pushing into a game still goes through the
authenticated Inspector bridge. Studio still runs no WebSocket server and owns no sessions.

**D34 — A lint rule was wrong, and following it would have been a bug.**
`no-useless-assignment` flagged `let sessionReplayIncluded = false` in `doctor/index.ts` as dead.
It is not: the only assignment sits inside `if (configSource)`, so a project with no
`feather.config.lua` never reaches it and that default is exactly what gets reported. Deleting the
initializer would have made the production session-replay check depend on uninitialized state.
Suppressed on the line with the reason, rather than obeyed. Two others were resolved by making the
code better instead of silencing: `supportedUploadDoctorTargets` now backs a real
`isSupportedUploadDoctorTarget` guard rather than being a type-only const with `'itch'` hardcoded
beside it, and the `config.ts` rethrow attaches `{ cause: err }` so the original parse error
survives.

**D33 — The port map is now explicit, after a collision.**
Assigning Studio's bridge to 4006 in 05b collided with the CLI's own MCP HTTP transport, which
defaults to that port. Nothing caught it because neither runs during the test suites. The map:
4004 game WebSocket · 4005 Inspector MCP bridge · 4006 CLI MCP HTTP transport · 4007 Studio creative
MCP · 4008 Studio↔Inspector bridge.

**D31 — `cli`, `vscode-extension` and `docs` belong in `apps/`, not `packages/`.**
The original layout placed the CLI and the extension under `packages/`. That was wrong by the plan's own
rule: `packages/` is for things *consumed* by other things, and both of those are shipping
artifacts a user installs. `apps/` now holds everything that ships — inspector, studio, showcase,
cli, vscode-extension, docs — and `packages/` holds only what the applications consume. The layout
in the architecture reference is corrected accordingly.

**D30 — `scripts/tests/` was fourteen dead test files, and nobody knew.**
Found while surveying the Inspector move. Fourteen unit test files covering shader graph codegen,
particle timelines, texture generation and theme resolution — with **no runner**: absent from
`package.json`, `turbo.json`, the husky hooks and CI. They had been broken since before this work:
verified at baseline `41689d1`, where `src/assets/theme/registry/index.ts` already used extensionless
imports that Node's ESM loader cannot resolve. Running them under `tsx`, which honours the tsconfig
paths, revives all of them: **93 tests passing**. Now wired into `pnpm run test:unit`, turbo,
pre-push and CI, so they cannot rot again — and they happen to cover exactly the Studio logic
Phase 05c moved.

**D29 — Tailwind's `@source` scope broke silently when the apps split.**
Moving the tools gave the showcase its own Vite root, and Tailwind v4 scans relative to that root.
It stopped generating classes for `packages/ui` — so Radix select and dialog *rendered* but had no
positioning classes, and Playwright reported "element is visible, enabled and stable… outside of the
viewport" on five tests. Nothing errored; the CSS bundle was simply 75 KB instead of 132 KB. Both
Studio stylesheets now name `packages/ui/src` explicitly, and the Inspector's does too even though
it currently works by accident of its Vite root being the repository root — that accident ends when
`src/` moves to `apps/inspector`.

**D28 — The migration has to persist eagerly, or it is not a migration.**
The first cut adopted legacy settings inside zustand's `merge`, which only runs during hydration and
does not itself write. So an adopted payload sat in memory until the user happened to change a
Studio control — and would be redone on every launch until then. The e2e caught it as an empty
storage key. `onRehydrateStorage` now materializes the store on first run, which also records the
distinction the two-step migration needs: `migratedFrom: 0` means "this install started clean",
which is not the same as "this install has never run".

Two test assertions also had to move, and the reason is worth keeping: `/texture-lab` activates a
per-session workspace on mount, so the *active* recipe and workspace id are overwritten immediately.
The migrated data is not lost — activation folds it into the workspace snapshot map. Asserting on
the active slot was testing app behavior; asserting on `textureLabWorkspaces['my-game']` tests that
nothing was dropped, which is the property that matters.

**D27 — The standalone CLI binaries are relocated, not removed.**
The first pass dropped them from the extension release as "zero loss, they are already in the VSIX."
That reasoning was wrong: the VSIX serves extension users, while the standalone Bun binaries are the
*hermetic* install path — no Node toolchain, one download — which is what a lean CI runner wants.
Deleting them would have removed a real capability.

They now attach to the **CLI train** rather than the platform release. That matters because
`release.yml` fires on `cli-v*` as well as `v*`: its legacy filename is retained because npm's
trusted publisher binds the OIDC identity to the calling workflow filename. Publishing the binaries
only on platform tags would have meant a CLI-only patch had no hermetic artifact, forcing pipeline
users to wait for a full platform release to pin a CLI fix — defeating the decoupling for the
audience that most needs it.
Each train owns its own artifacts; the platform manifest links to them and copies nothing.

**D25 — A platform tag publishes a manifest, not a rebuild.**
Independent trains create a question the lock-step model never had: which versions work together?
The initial design answered it with per-satellite compatibility ranges, which is worse — a declared range
nobody exercises is a loose system that is quietly wrong. Instead `v*` publishes
`feather-platform.json`: the set that was actually built and tested together, with each component
linked to its own registry. npm, LuaRocks and the Marketplace host their own bytes, so the manifest
duplicates nothing, and the release page is a single answer rather than a matrix to solve.

**D26 — Release storage is about copies, not policy.**
The extension release attached the four CLI binaries — 342 MB — that `prepare.mjs` had already
placed inside the VSIX. That is the largest storage item in the project and it was pure duplication.
Separately, the Turbo cache key introduced in Phase 06 was keyed on `github.sha`, minting a fresh
entry against the hard 10 GB Actions cache quota on every push. Release assets on public repos are
generally not billed against repository storage, but the number of copies kept is controllable
regardless of that, so it was worth fixing on its own terms.

**D24 — Phase 06 ran before Phase 05.**
The original phase plan listed 06 after 05, but every 06 task is independent of the app split: the runtime move, the
catalog move, the bundler, and the CI graph touch no `src/` layout. Phase 05's blocker is
`src/store/settings.ts` — 373 lines of *persisted* zustand state mixing studio preferences (texture
recipes, timeline zoom, collapsed node categories) with app settings, so splitting it needs a
migration for existing users' stored state. Doing the independent, low-risk phase first leaves the
riskiest one to be done with full attention rather than in a hurry.

**D19 — `@feather/ui` injects its two app dependencies rather than importing them.**
Four primitives needed app state: `sonner` and the Lua/GLSL editors want the resolved theme, and the
copy button wants the app's clipboard-with-toast helper. Both live behind the settings store, so
importing them would have dragged app state into a presentation package and made it unusable by a
second app. `UiProvider` supplies `useThemeMode`, `useSyntaxTheme` and `copyToClipboard`; the
defaults are a light theme and a bare `navigator.clipboard` write so a primitive still renders in
isolation.

**D20 — `use-local-particle-playground` moved to the studio, not into the host.**
Phase 04 as written said to move it into the web host. It is not a host capability — it is particle
workspace state that happens to persist locally. It belongs to the tool that owns it, so it moved to
`src/pages/particle-system-playground/`. The inversion is gone either way.

**D21 — The session bridge abstracts one function.**
The four modules in the host-extraction plan were expected to need injection. Inspecting them showed only
`send-command` imports Tauri (`invoke`); the session store is plain zustand, the upload helper has no
imports at all, and plugin-control is only tainted through send-command. So the bridge is a
registry for a single `CommandSender`, defaulting to a no-op. A module-level registry rather than
React context because the studio's preview controllers are module singletons created at import time.

**D22 — The desktop bundle registers the transport unconditionally.**
First attempt gated `setCommandSender` on `!isWeb()`, which broke six Playwright tests: that suite
runs the desktop bundle in a browser with a mocked `invoke`, so `isWeb()` is true and every game
command silently no-oped. The host is still chosen by what is present (the file dialogs need a real
runtime), but the transport is always registered for this bundle. The showcase has its own entry and
registers nothing, which is what leaves the tools as local editors on the real web.

**D18 — `protocolVersion` stays a standalone integer.**
Answering Q4: tying it to the platform semver would mean every platform release implies a protocol
change, and readers would have to work out which parts of a version are wire-relevant. A bare
integer that increments only on a breaking wire change is less to maintain and unambiguous at the
handshake. `check:protocol` keeps the two declarations in step.

**D16 — pnpm 11 moved its settings out of `package.json`.**
`pnpm.onlyBuiltDependencies` in `package.json` is no longer read at all (pnpm says so explicitly).
The equivalent is `allowBuilds` in `pnpm-workspace.yaml`, as a map. Blocked build scripts are a
*fatal* install error, and pnpm re-runs install before every script, so this blocks everything until
fixed. `esbuild`, `keytar`, and `@vscode/vsce-sign` are approved — esbuild's matters because Vite
depends on it.

**D17 — The Playwright breakage was stale npm state, not a boundary violation.**
Phase 03 predicted strict linking would surface packages reaching undeclared root dependencies. It
surfaced something else: `pnpm install` left npm's `node_modules/playwright` in place as a real
directory while `@playwright/test` resolved its own copy under `.pnpm`. Two realpaths meant two
module registries, so every spec threw "did not expect test() to be called here" and Playwright
reported 0 tests in 0 files. Deleting `node_modules` in the root and each workspace and reinstalling
fixed it. No source import needed changing — the boundaries were already clean.

**D14 — Per-message payload schemas are declined, not deferred indefinitely.**
Modelling all 78 payloads was attempted and abandoned on evidence. The messages are not uniform:
`eval:response` carries `id`/`status`/`result`/`prints` at the top level while others nest under
`data`. A first cut of `parseInbound` rebuilt the envelope from four known keys and silently dropped
those top-level fields — caught by `golden.spec.ts`. That is exactly the failure mode a slightly
wrong schema produces, and it is worse than an honest `unknown`. The envelope is exact; `data` stays
`unknown`. Revisit per-message only where a handler's shape is actually load-bearing.

**D15 — No Rust serde structs are generated.**
`src-tauri/src/ws_server.rs` deserializes exactly one message, `AuthResponseMsg`, for the appId
handshake; the other 77 are relayed as raw text and never parsed. Generating structs for them would
be dead code.

**D12 — `packages/protocol` sits beside the Love2D catalog for now.**
`packages/` meant "Love2D catalog entries" then, while the target architecture uses it for npm
packages. Rather than pull the `catalog/packages/` move forward from Phase 06, the protocol package
lands alongside the catalog JSONs. `scripts/generate-registry.mjs` filters on `.endsWith('.json')`,
so the subdirectory is invisible to it; verified the generated registry is byte-identical after the
addition. `AGENTS.md` records the temporary sharing.

**D13 — The registry declares message names before payload shapes.**
Names alone make drift mechanically detectable, which is the property that matters once trains ship
separately. Payload schemas for 78 messages are a long tail with a different risk profile: getting a
shape subtly wrong is worse than leaving it implicit. Split so the detectable-drift half could land
and be verified on its own.

**D9 — `protocolVersion` rides `feather:hello`, not a new handshake in Rust.**
The written task said to add it to `src-tauri/src/ws_server.rs` and `packages/runtime-lua/feather/lib/ws.lua`.
But an auth handshake already exists (`auth:challenge` / `auth:response`) followed by a
`feather:hello` config payload that *already* carried an API-compat check, and
`skills/feather-desktop-app/references/tauri-and-protocol.md` is explicit that Rust should stay a
transparent relay. Adding the field to the existing hello payload is smaller, keeps Rust untouched,
and lets the desktop report a rich error instead of dropping the socket.

**D10 — A runtime reporting no `protocolVersion` is `legacy`, not broken.**
Every runtime released before this negotiation existed omits the field. Since any warning flips the
Session health verdict to "Needs attention" (`src/pages/session/index.tsx`), warning on absence
would have shown a degraded session to every existing user the moment they updated the desktop app.
Absence is surfaced in the Protocol chip and detail row and does not degrade the verdict; only a
genuine incompatibility does.

**D11 — The plugin API version and the wire protocol version stay separate.**
`FEATHER_API` (5) gates plugin loading and already has min/max range handling in
`packages/runtime-lua/feather/plugin_manager.lua`. The wire protocol is a different contract that can evolve at a
different rate, so it got its own integer rather than overloading `API`.

**D7 — Five tag prefixes, not three.**
Section 6 first sketched `v*` / `cli-v*` / `ext-v*`. Implementation added `runtime-v*` and
`desktop-v*`, because the platform's three members each have a real reason to ship alone: a runtime
fix without a CLI release, or a desktop rebuild without burning a rock version. `v*` still fires all
three for a genuine platform release.

**D8 — Version equality is not a compatibility signal.**
`src/pages/session/index.tsx` treated runtime ≠ desktop as a fault. That was only ever correct
because lock-step made them equal by construction. Decoupled trains are *expected* to drift, so the
check was removed rather than adjusted. `config.API` carries the signal until Phase 02 replaces it
with a negotiated `protocolVersion`.

**D6 — The extension vendors a platform snapshot rather than declaring a CLI range.**
Discovered during planning: `vscode-extension/src/cli.ts` resolves from `bundled-bin/`, not from the
user's PATH. Hermetic bundling is simpler to verify than a compat range.

> **Numbering note.** D35–D42 were originally written as D25–D32 during Phase 05 planning, before
> the implementation decisions now holding those numbers were recorded. They were renumbered on
> 2026-09-08 so every identifier in this log is unique. Nothing in the repository cited them by
> number, and every `D25`–`D32` reference elsewhere in this document points at the entries above.

**D35 — “Separate bundle” means a separate Feather Studio application and native binary.**
Owner clarification on 2026-09-08 supersedes the ambiguous delivery wording in Q1, not the earlier
reason for separating Studio. Inspector must not statically link, dynamically import, download, or
remotely execute Studio code. Studio owns its Tauri shell, app identity, version, permissions,
artifacts, signing, releases, and release feed. Showcase compiles Studio's public web entry, but
Inspector contains none of it.

**D36 — Platform is a compatibility family, not one release train.**
D2 described the initial hybrid model; the implemented `cli-v*`, `runtime-v*`, and `desktop-v*`
paths in D7 mean those artifacts no longer keep one version in ordinary releases. `v*` is an
umbrella coordinated release, while protocol negotiation carries compatibility. The terminology in
The architecture reference now matches the implementation.

**D37 — A separate application requires an explicit persisted-state handoff.**
The original Phase 05 migration assumed the new Studio store could adopt Inspector's browser
storage directly. Separate Tauri applications have separate data directories/origins, so that is
not a valid boundary. Inspector retains a versioned legacy export; after explicit authenticated
pairing, Studio validates and imports it idempotently into its own store. The legacy copy remains
for rollback. `assetSourceDir` is copied once because both products use the concept, then each app
owns its value independently; it does not justify shared mutable app state.

**D38 — The Phase 04 command-sender registry is scoped, not removed.**
D21 and D22 accurately record why a module-level sender worked inside the combined app. It cannot
cross a process boundary. *Corrected after implementation:* this entry predicted Phase 05 would
"replace" the registry, and that is not what happened. `setCommandSender` still lives in
`packages/session-bridge/src/index.ts` and is still how Inspector's own bundle reaches a game —
`apps/inspector/src/main.tsx` is its only caller. What Phase 05 actually did was stop it at the
application boundary: Studio references it zero times and reaches games only through the versioned,
authenticated bridge, with the null adapter standing in when no Inspector is paired. The registry
was scoped to one app, not retired.

**D39 — Studio owns the creative state behind MCP.**
`use-mcp-creative-bridge.ts` reads and mutates all three creative stores, so leaving it in Inspector
would preserve the very dependency Phase 05 removes. Its React executor and corresponding native
creative routes move to Studio. *Reframed by D32:* the ownership claim holds — creative state and
its handlers live in Studio, session and debugging state in Inspector — but this entry assumed that
ownership implied a second MCP *server*. It does not. There is one server, and ownership is
expressed as routing behind it. Shared Rust infrastructure still earns a crate only if both binaries
consume a stable public contract.

**D40 — Turbo cache reuse is not affected-task filtering.**
Phase 06 removed duplicated build/test `paths:` lists by running the Turbo graph and restoring its
persisted cache. That skips unchanged work through cache hits; it does not use
`--filter=...[origin/main]` to select a smaller graph. The goal and acceptance language now state the
implemented behavior precisely. Deployment workflows may still use path triggers.

**D41 — The protocol source of truth covers message names and the common envelope.**
The earlier target text overclaimed per-message payload schemas and generated Rust consumers.
D14 and D15 intentionally declined both. G3 is satisfied by one registry for the 78 names, exact
envelope parsing, generated Lua names, and drift checks against both dispatch tables; handler-owned
payload data remains `unknown` until evidence justifies a schema.

**D43 — The tools moved; their trails did not, and nothing caught it.**
Phase 05 moved Shader Graph, Particle Playground and Texture Lab to Studio and deleted the pages,
but left Inspector advertising all three: sidebar group, command-palette entries, runtime interest,
and the "creative workspace" session that existed only to host them. Every one navigated to a route
with no match and no fallback, so they rendered an empty page. Inspector's Rust shell also kept a
whole creative MCP surface — two Tauri commands, two `/creative/*` routes on 4005, the snapshot and
waiter state behind them, and three tests — which contradicts the session-bridge invariant that "Inspector's backend never
serves creative actions" outright. It was unreachable: Studio's webview invokes its own shell, and
the CLI routes creative traffic to 4007.

Two lessons worth keeping. First, a move is not done when the new home works; it is done when the
old home stops claiming the feature. Second, the e2e suite *asserted the Creative sidebar group was
visible* — the test locked the trail in rather than catching it, which is why 44 passing tests said
nothing. Deleting code that a test asserts the presence of is the case to watch for.

**D42 — Superseded: Inspector and Studio each own an MCP server.**
> **Superseded by D32 on 2026-09-08. Do not implement this.** Kept because it records a position
> the owner held and then reversed, and because the reasoning about *which app owns which state*
> survived the reversal even though the two-server topology did not.

Original entry: Inspector MCP remains valuable for live sessions, logs, performance, assets,
observers, plugins, debugger control, Console, time travel, and Session Replay. Studio MCP owns
Shader Graph, Particle Playground, and Texture Lab resources/tools. Their schemas, handlers,
credentials, configuration, tests, and docs ship with their respective app trains. The CLI keeps
`feather mcp` only as a target-selecting transport shim, defaulting to Inspector for compatibility;
it must not remain the release owner of either app's tool definitions.

What D32 changed: agents configure one server, not two. The state split above is still real, but it
is a routing detail behind `feather mcp` rather than two endpoints an agent must discover, and the
CLI is not a "shim" over two servers — it is the single server, delegating `/creative/*` to Studio.

## Resolved boundary questions

Answered or clarified by the project owner on 2026-09-08. Recorded here so they are not reopened.

| # | Question | Answer | Consequence |
| --- | --- | --- | --- |
| Q1 | Does Studio ship inside Inspector, or as a separate bundle? | **A separate application and native binary.** | Studio has its own Tauri shell, build/sign/release/distribution path, and application data. Inspector ships no Studio routes or assets and never loads Studio code. The apps integrate only through the authenticated local bridge. See D35. |
| Q2 | Should `catalog/packages` move at all? | **Yes — move to `catalog/`,** but it must still publish to the package branch on release. | Phase 06 moved the directory *and* updated `registry.yml`, so the publish target stayed unchanged. Moving the source without repointing the pipeline would have silently stopped registry publishes. |
| Q3 | What is the deprecation window for the old `v*`-fires-everything behaviour? | **Treat v2 as a new start.** Keep backwards compatibility where it is cheap; breaking v1 patterns is acceptable. | No deprecation shim is owed. `v*` keeps working as the full-platform tag because that is cheap and useful, not because it is owed to anyone. |
| Q4 | Does `protocolVersion` follow the platform semver or get its own integer? | **Whichever is easier to maintain.** | Keep the standalone integer already shipped in Phase 02a. It is easier: it increments only on a breaking wire change, so most platform releases do not touch it, and a reader never has to work out which parts of a semver are wire-relevant. Recorded as **D18**. |
| Q5 | Does Inspector still have its own MCP after Studio separates? | **It owns a distinct backend, not a distinct server.** *(Answer revised by D32; originally "both applications own distinct MCP servers".)* | Inspector keeps session/runtime/debugging automation, Studio owns creative automation, and each mints its own token on its own port. But an agent configures **one** server: `feather mcp` routes `/creative/*` to Studio and the rest to Inspector. `--target` was never built. See D32 and D42. |
