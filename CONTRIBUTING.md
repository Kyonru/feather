# Contributing to Feather

Thanks for helping make Feather better. Feather spans a React/Tauri desktop app, a TypeScript CLI, a VS Code extension, and an embedded Lua runtime for LÖVE games. The best contributions are focused, testable, documented, and careful about the fact that Feather runs inside someone else's game during development.

Feather's current product direction is polish first: make setup, debugging, plugin workflows, release safety, and docs feel reliable before adding more surface area. New features should make LÖVE developers faster at debugging, validating, shipping, or reproducing a problem.

## Working Principles

- Keep changes small and scoped. A CLI fix, Lua plugin change, desktop workflow, docs update, or VS Code extension change should usually stand on its own.
- Prefer CLI-managed development flows. Normal examples and integrations should work with `feather run` and `feather.config.lua`, not by requiring Feather directly from game code.
- Keep production builds Feather-free by default. Release builds must exclude Feather runtime files, `feather.config.lua`, plugins, local replay/debug artifacts, and generated development files unless the user explicitly opts into a debug build.
- Treat Console, hot reload, filesystem writes, insecure app pairing, debugger hooks, and replay/session capture as development-only features. They must be opt-in and clearly documented.
- Keep plugin APIs declarative and serializable. Lua plugins should expose data and actions; React should render generic plugin UI unless a dedicated desktop page is genuinely needed.
- Update docs when behavior changes. If a user-facing command, config field, plugin option, extension command, build behavior, or safety check changes, update the relevant docs in the same PR.

## For Agents And Automation

If you are an automated coding agent, follow these extra rules:

- Read the relevant files before editing. Use `rg` and focused file reads to understand the existing pattern.
- Check `git status --short` before and after. Never revert unrelated changes; assume they belong to the user.
- Do not modify `pnpm-lock.yaml` unless dependencies actually changed.
- Use `apply_patch` or normal editor-style edits. Avoid broad rewrites and formatting churn.
- Run the narrowest useful tests first, then broader checks when the change crosses boundaries.
- If a check cannot run because local tooling is missing, say so plainly and include the exact failure.
- Do not leave generated files stale. If a generated file changes because it should, include it. If it changes accidentally, restore it carefully.

## Development Setup

Feather is a pnpm + Turborepo monorepo. Install once from the repo root:

```sh
pnpm install
```

Node 22 or newer is required. Everything below runs from the **repo root** — you should rarely need
to `cd` into an app.

### Bring up a whole session

Most debugging work needs Inspector *and* a game connected to it, which is two terminals and an
ordering constraint — a game launched before Inspector's WebSocket server is listening never
connects, and that looks like a bug rather than a race. One command does it:

```sh
pnpm run up                     # pick an example interactively
pnpm run up demo                # or name one
pnpm run up test_cli --studio   # Inspector + Studio + a connected game
pnpm run up --no-game           # just the apps
pnpm run up --list              # what can I run?
```

It builds the CLI, starts Inspector, **waits for port 4004 to accept a connection**, then launches
the game through the CLI with `--session-name` set to the example. Ctrl+C stops everything.

Anything already listening is reused rather than started twice, so you can leave Inspector open and
re-run `pnpm run up <other-example>` to swap games. A partial name works (`single` finds
`session_replay/single_player`); an ambiguous one lists the matches.

### Run one application

The two desktop applications are separate products with separate release trains. Each has a web dev
server and a Tauri shell:

```sh
pnpm run inspector:dev        # Inspector web UI      -> http://localhost:1420
pnpm run inspector:tauri      # Inspector desktop app (Tauri)

pnpm run studio:dev           # Studio web UI         -> http://localhost:1430
pnpm run studio:tauri         # Studio desktop app (Tauri)

pnpm run showcase:dev         # public showcase site
pnpm run docs                 # documentation site
```

The two dev servers use different ports on purpose, so you can run Inspector and Studio side by
side and exercise the bridge between them.

Do not run `*:dev` and `*:tauri` for the **same** app at once. The Tauri shell starts its own dev
server on that app's port, so the second one fails with `Port 1420 is already in use` (or 1430 for
Studio). Stop the standalone server first, or just use the Tauri command, which gives you both.

`pnpm run dev` is still Inspector's web server, and `inspector:dev` is an alias for it.

**Do not use a bare `pnpm run tauri ...` any more.** The Tauri CLI discovers a project by searching
for a `src-tauri/` directory, and there are now two — so from the repo root it resolves to Studio,
whatever you meant. The `inspector:*` and `studio:*` scripts pin the project directory, and CI does
the same with an explicit `projectPath`. Use them instead.

### Run the CLI

The CLI is built before it runs, so use the wrapper rather than a stale `dist/`:

```sh
pnpm run feather --help
pnpm run feather run packages/runtime-lua/example/test_cli
pnpm run feather doctor packages/runtime-lua/example/test_cli
```

`pnpm run feather` rebuilds the Lua bundle and the CLI first, then forwards the rest to it.

Note the missing `--`. A subcommand works either way (`pnpm run feather -- run <dir>` is fine), but
when the first forwarded token is a flag, pnpm mangles it — `pnpm run feather -- --help` fails with
`unknown command '--help'`. Leaving `--` out works in both cases, so prefer it.

To skip the rebuild and iterate faster, run `pnpm run cli:build` once and then call
`node apps/cli/dist/index.js <args>` directly.

## Testing

Two aggregate commands cover most of what you want, and both run through Turborepo, so an unchanged
lane is a cache hit instead of a rerun:

```sh
pnpm run verify     # typecheck (all projects), lint, protocol + generated-file drift  (~5s warm)
pnpm run test       # unit, bridge, CLI e2e, Lua e2e, and the three Playwright suites
```

`pnpm run verify` is the fast one — run it constantly. `pnpm run test` is what the pre-push hook
runs, so a clean `pnpm run test` means your push will not be rejected.

`pnpm run test` runs its lanes **one at a time** (`--concurrency=1`), which takes about three
minutes. That is deliberate: three Playwright suites and the CLI e2e suite all spawn real browsers,
dev servers and child processes, and running them at once made a different lane time out on
roughly every run. If you want the parallel version for a quick local check, run
`pnpm exec turbo run //#test:studio:e2e //#test:showcase:e2e` with the lanes you actually need.

### Run one lane

```sh
pnpm run test:unit               # plain unit tests (scripts/tests)
pnpm run test:bridge             # Inspector <-> Studio bridge contract
pnpm run test:cli:e2e            # CLI end-to-end (builds the CLI first)
pnpm run test:lua:e2e            # Lua runtime against real LÖVE
pnpm run test:inspector:e2e      # Playwright, Inspector
pnpm run test:studio:e2e         # Playwright, Studio
pnpm run test:showcase:e2e       # Playwright, showcase
pnpm run test:tauri:e2e          # Rust, Inspector WebSocket server
pnpm run test:packages:e2e       # package-catalog install flows
pnpm run extension:test          # VS Code extension
```

### Run one file or one test

```sh
pnpm run cli:build
node --test apps/cli/test/commands/run.test.mjs                  # one CLI file
node --test --test-name-pattern "adb reverse" apps/cli/test/commands/run.test.mjs

pnpm exec playwright test -c apps/studio/playwright.config.ts -g "texture lab"
pnpm exec playwright test -c apps/inspector/playwright.config.ts --headed --debug
```

Playwright suites start their own dev server, so do not have `inspector:dev` or `studio:dev` running
on the same port when you launch them.

### Typecheck or lint one project

```sh
pnpm run typecheck            # every project, chained
pnpm run typecheck:studio     # or :web (Inspector), :protocol, :host, :session-bridge, :ui, :lua
pnpm run lint                 # eslint across apps/ and packages/
pnpm exec eslint apps/studio/src/store/studio-preferences.ts   # one file
```

### Turborepo notes

Task caching is keyed on declared `inputs` in `turbo.json`. If you add a task, or a task starts
reading files it did not read before, **update its `inputs`** — an under-declared task reports a
cache hit and silently skips work that would have failed. Force a lane to re-run with
`pnpm exec turbo run //#lint --force`.

## Project Layout

```txt
apps/
  inspector/          Inspector desktop app: React UI + src-tauri/ shell and WebSocket server
  studio/             Feather Studio: shader graph, particle playground, texture lab (+ src-tauri/)
  showcase/           public web showcase
  cli/                the Feather CLI: build/upload/release, package manager, Ink workflows
  vscode-extension/   the VS Code extension
  docs/               the Zensical documentation site
packages/
  protocol/           the wire contract shared by desktop and runtime (message names, envelope)
  session-bridge/     the versioned, authenticated Inspector <-> Studio process bridge
  host/               host abstraction so UI code runs under Tauri or the web
  ui/                 shared UI components and hooks
  runtime-lua/        the embedded Lua runtime, built-in plugins, and runnable LÖVE examples
catalog/packages/     curated package registry entries
scripts/              generators, release tooling, and cross-cutting checks
```

Inspector is served by the **root** `vite.config.ts` (its `root` points at `apps/inspector`), which
is why it has no `package.json` of its own. Studio owns `apps/studio/package.json` and its own Vite
config. Both are real Tauri applications with their own identity, version, and release train.

Tests live beside what they cover: `apps/cli/test/commands/` for the CLI, `apps/*/e2e/` for
Playwright, `packages/session-bridge/test/` for the bridge, and `scripts/tests/` for plain units.

`apps/docs/cli.md` is a symlink to `apps/cli/README.md`, and `apps/docs/vscode-extension.md` is a
symlink to `apps/vscode-extension/README.md`. Edit the source file directly when your editor has
trouble writing through symlinks.

Architecture, release trains, and the reasoning behind the split are in [`V4.md`](./V4.md).

## CLI-Managed Examples

Most examples should be plain LÖVE projects. Do not add direct `require("feather")`, `require("feather.auto")`, `FeatherDebugger(...)`, or `DEBUGGER:update(dt)` to normal examples unless the example is specifically demonstrating manual/auto embedding.

Prefer this shape:

```txt
packages/runtime-lua/example/my_example/
  main.lua
  conf.lua
  feather.config.lua
```

Run it with:

```sh
pnpm run feather -- run packages/runtime-lua/example/my_example
```

Example game code may use guarded runtime APIs:

```lua
if DEBUGGER then
  DEBUGGER:observe("player.x", player.x)
end
```

Plugin options belong in `feather.config.lua`:

```lua
return {
  include = { "session-replay", "hot-reload" },
  pluginOptions = {
    ["session-replay"] = {
      captureJoystickAxis = true,
    },
    ["hot-reload"] = {
      enabled = true,
      allow = { "gameplay" },
    },
  },
}
```

The CLI shim must preserve `pluginOptions` for any plugin, including IDs with dashes. If you change config parsing or shim generation, add or update CLI tests that prove nested plugin options survive injection.

## Common Workflows

Run the CLI:

```sh
pnpm run cli:build
pnpm run feather -- doctor packages/runtime-lua/example/test_cli
pnpm run feather -- run packages/runtime-lua/example/test_cli
```

Run a focused CLI test file:

```sh
pnpm run cli:build
node --test apps/cli/test/commands/run.test.mjs
```

Run Lua examples:

```sh
pnpm run feather -- run packages/runtime-lua/example/test_cli
pnpm run feather -- run packages/runtime-lua/example/session_replay/single_player
pnpm run feather -- run packages/runtime-lua/example/session_replay/multiplayer
pnpm run feather -- run packages/runtime-lua/example/session_replay/adapter
```

Run Android development builds:

```sh
pnpm run feather -- build vendor add android --dir packages/runtime-lua/example/test_cli
pnpm run feather -- build android --dir packages/runtime-lua/example/test_cli --verbose
pnpm run feather -- run packages/runtime-lua/example/test_cli --target android --verbose
```

Use cache controls when testing build behavior:

```sh
pnpm run feather -- build android --dir packages/runtime-lua/example/test_cli --no-cache --verbose
pnpm run feather -- build android --dir packages/runtime-lua/example/test_cli --clean --verbose
```

## Golden Workflow Checklist

Use this smoke path when validating Feather for day-to-day LÖVE development:

```bash
pnpm run feather -- run packages/runtime-lua/example/test_cli --verbose --config packages/runtime-lua/example/test_cli/feather.config.lua
```

1. **Connect And Session Health**: the running game appears as the active session, stale **Connecting game** entries disappear, **Session** shows the runtime/config details, and suspend/resume keeps the socket available without leaving the app stuck.
2. **Logs And Error History**: normal log batches arrive in order, error/fatal logs appear immediately, follow-tail tracks new output, search/filter/clear stay responsive, and recent logs return after restarting Feather or the game.
3. **Performance, Overhead, And Profiler**: **Performance → Health** and **Overhead** refresh as soon as the tab opens, profiler captures use **Record Capture** / **Finish Capture**, snapshots are named, wrapped functions keep original game behavior, and large profiler uploads are deferred away from the measured call.
4. **Debugger And Profiler Probes**: breakpoints, stepping, pause-on-error, and source gutter profiler probes sync on connect; start/stop/snapshot probes never pause the game, and **Profile function here** only wraps supported global/table functions.
5. **Runtime Inspection**: **Observability**, **Assets**, and **Console** request fresh data when opened, then go dormant when you leave unless an explicit recording, preview, or eval workflow is active.

This is the developer-preview acceptance bar: Feather should let an external LÖVE developer connect a game, read logs, inspect state, diagnose performance, and debug/profile code without stale UI, broken refreshes, or surprising idle FPS impact.

## Verification

Start with the two aggregates — see [Testing](#testing) for the full command list:

```sh
pnpm run verify   # typecheck, lint, protocol and generated-file drift
pnpm run test     # every test lane the pre-push hook gates on
```

Two lanes are deliberately outside `pnpm run test` because they need toolchains that are not always
present. Run them when your change touches them:

```sh
pnpm run test:tauri:e2e     # needs a Rust toolchain
pnpm run extension:test     # needs the VS Code test harness
```

Focused guidance:

- Inspector UI changes: `pnpm run typecheck:web`, `pnpm run lint`, and `pnpm run test:inspector:e2e` if visible behavior changed.
- Studio UI changes: `pnpm run typecheck:studio`, `pnpm run lint`, and `pnpm run test:studio:e2e`.
- Shared package changes (`protocol`, `host`, `ui`, `session-bridge`): run `pnpm run verify` plus both app suites — these cross the application boundary.
- CLI changes: `pnpm run cli:build` and the relevant `node --test apps/cli/test/commands/*.test.mjs` file.
- Lua runtime or plugin changes: `pnpm run typecheck:lua`, `pnpm run test:lua:e2e`, and any focused Lua e2e path if available.
- Build/upload/release safety changes: run targeted build, doctor, upload-safety, and release tests.
- Tauri/WebSocket changes: `pnpm run test:tauri:e2e`.
- VS Code extension changes: `pnpm run extension:build` and `pnpm run extension:test`.
- Docs-only changes: read the edited Markdown and run `pnpm run docs` when practical.

If `love`, `luacheck`, Android SDK, Xcode, Fastlane, or other local tooling is missing, document that in the PR or final handoff. Do not pretend the check passed.

The pre-push hook runs the same lanes as `pnpm run test`, through Turborepo, so unchanged suites
are cache hits rather than reruns:

```sh
pnpm run test
```

When you need to push from a machine that cannot run those tools, use `SKIP_PRE_PUSH_TESTS=1 git push` and call out the skipped checks.

## Generated Files

Some files are generated and must stay in sync:

- `packages/runtime-lua/manifest.txt`
- `apps/cli/src/generated/plugin-catalog.ts`
- `apps/cli/src/generated/registry.json`
- `packages/runtime-lua/feather/protocol_messages.lua` (generated from `packages/protocol`)
- each application's version trio — Inspector is `package.json` + `apps/inspector/src-tauri/{Cargo.toml,tauri.conf.json}`, Studio is `apps/studio/package.json` + `apps/studio/src-tauri/{Cargo.toml,tauri.conf.json}`

Refresh them with:

```sh
bash scripts/generate-manifest.sh
pnpm run generate:plugin-catalog
pnpm run generate:registry
pnpm run generate:protocol-lua
bash scripts/set-version.sh <train>      # cli | runtime | desktop | ext | studio | platform
```

Each train versions independently — that is the point of the v4 split, so do not bump them together
out of habit. `bash scripts/set-version.sh desktop` is Inspector; `studio` is Studio.

`pnpm run check:plugin-catalog`, `pnpm run check:registry`, and `pnpm run check:protocol` intentionally fail when generated output differs from git. If the generated diff is expected, commit it. All three run as part of `pnpm run verify`.

Generated or local-only folders such as `apps/vscode-extension/bundled-cli/`, `apps/vscode-extension/bundled-bin/`, `src-tauri/target/`, build outputs, caches, and replay/debug artifacts should not be committed.

## Lua Runtime Guidelines

- Keep Feather disabled in production unless the user explicitly chooses a debug build.
- Guard manual integration with `USE_DEBUGGER` when touching auto/manual init flows.
- Keep CLI mode clean: the CLI injects Feather and drives `DEBUGGER:update(dt)`.
- Do not make Console, hot reload, session replay, filesystem writes, or remote code execution load by default in production-oriented configs.
- Keep runtime APIs JSON-serializable when data crosses the WebSocket/plugin boundary.
- Avoid global mutation unless the plugin explicitly wraps LÖVE callbacks or exposes a guarded `DEBUGGER` API.
- Add Lua e2e coverage for runtime behavior, callback wrapping, replay, protocol, or plugin lifecycle changes.

## Plugin Guidelines

Built-in plugins live under `packages/runtime-lua/plugins/<plugin-id>/` and should usually include:

```txt
packages/runtime-lua/plugins/<plugin-id>/
  init.lua
  manifest.lua
  README.md
```

After adding or changing a built-in plugin:

```sh
bash scripts/generate-manifest.sh
pnpm run generate:plugin-catalog
pnpm run cli:build
pnpm run typecheck:lua
pnpm run test:lua:e2e
```

Plugin contribution tips:

- Prefer improving existing plugins over adding more plugins.
- Mark opt-in, disabled, dangerous, or development-only behavior clearly in `manifest.lua` and docs.
- Keep plugin state session-local.
- Document setup, options, security implications, and at least one minimal snippet.
- Use `pluginOptions` in `feather.config.lua` for CLI-managed configuration.
- Avoid plugin-specific React code unless the workflow needs a dedicated desktop page. If you add one, keep the generic plugin tab useful for status and simple actions.

## Desktop App Guidelines

- Keep session data scoped to the active session. Never leak logs, plugin state, replay metadata, assets, or file roots between sessions.
- Show useful empty states when no session is selected or a session lacks a capability.
- Make requests optimistic only when rollback/error state is clear.
- Handle web mode and Tauri mode gracefully.
- Keep file access rooted in user-selected or configured directories.
- Use existing app patterns, query keys, routing, and shared UI components.

## CLI Guidelines

- Keep non-interactive flags available for scripts and CI.
- Use Ink workflows for commands that need several choices, but never make automation depend on an interactive prompt.
- Preserve config and generated Lua in a form users can understand and remove.
- Follow skip-on-exists behavior for file installers. Use `--force` when overwriting is intentional.
- Keep `doctor` useful. New setup requirements should have a doctor check and a clear remediation message.
- When adding setup options, update `cli/README.md`, `docs/configuration.md`, and generated config templates.
- Build and upload commands must run production safety checks before shipping user-facing artifacts.

## Release Trains

Feather v4 releases each artifact on its own train. There is no single repo-wide
version — a CLI patch must not drag the desktop app, Lua runtime, or extension
along with it. See `V4.md` for the full model.

| Tag | Ships | Publishes to |
| --- | --- | --- |
| `v<semver>` | Platform: runtime + CLI + desktop together | LuaRocks, npm, signed desktop binaries |
| `cli-v<semver>` | CLI alone | npm |
| `runtime-v<semver>` | Lua runtime alone | LuaRocks + GitHub release |
| `desktop-v<semver>` | Desktop app alone | 4 signed binaries |
| `ext-v<semver>` | VS Code extension alone | Marketplace + Open VSX |

Set a train's version before tagging. The script only touches the files owned by
the train you name:

```sh
bash scripts/set-version.sh cli 4.0.1        # then: git tag cli-v4.0.1
bash scripts/set-version.sh runtime 4.0.1    # then: git tag runtime-v4.0.1
bash scripts/set-version.sh desktop 4.0.1    # then: git tag desktop-v4.0.1
bash scripts/set-version.sh ext 4.0.1        # then: git tag ext-v4.0.1
bash scripts/set-version.sh platform 4.1.0   # then: git tag v4.1.0
```

Notes:

- Each release workflow verifies that its train's version matches the tag and
  fails with the exact `set-version.sh` command to fix it.
- The runtime workflow skips the LuaRocks publish when `packages/runtime-lua/feather` is
  unchanged since the previous runtime release, so a platform tag never burns a
  rock version for an unmodified runtime. Override with the `force` input on
  workflow dispatch.
- `bash scripts/release-tag-version.sh <tag>` parses a tag into its train and
  version, and rejects tags outside this vocabulary.
- Trains are expected to drift apart. The desktop app displays both its own
  version and the connected runtime's version; a difference is normal and is not
  a fault. Compatibility is signalled by the API version, which Phase 02 of the
  v4 migration replaces with a negotiated protocol version.

## Build, Upload, And Release Safety

Production paths should be boringly strict.

- Release builds should exclude Feather runtime, plugins, `feather.config.lua`, `.feather-main.lua`, replay files, `.featherreplay`, logs, and generated debug artifacts.
- Upload safety should inspect existing artifacts where possible, including `.love`, `.zip`, `.apk`, `.aab`, `.ipa`, and app bundles.
- `feather doctor --production` should fail or warn on unsafe config, debug runtime footprints, missing signing/upload dependencies, weak app pairing, hot reload persistence, Console exposure, and replay artifacts.
- If a development config is unsafe, prefer offering a production staging/build path over asking users to manually edit several fields.

## VS Code Extension Guidelines

- The extension is a UI controller for the CLI. It should spawn the bundled CLI and avoid re-implementing CLI logic.
- Keep extension commands mapped closely to CLI commands. If behavior does not exist in the CLI, add it there first.
- Workspace-scoped settings should use `ConfigurationTarget.Workspace`, not `Global`, when they are project-specific.
- Register new commands in both `vscode-extension/src/extension.ts` and `vscode-extension/package.json`.
- Build/package flows should use the bundled CLI/binary prepared by `vscode-extension/scripts/prepare.mjs`.
- Do not commit generated extension bundles.

## Documentation Guidelines

- User-facing CLI behavior belongs in `cli/README.md` and, when broader, in `docs/usage.md` or a dedicated page.
- Runtime config belongs in `docs/configuration.md`.
- Plugin behavior belongs in `packages/runtime-lua/plugins/<plugin-id>/README.md`; major workflows may also need a `docs/<feature>.md` page and a `zensical.toml` nav entry.
- VS Code extension behavior belongs in `vscode-extension/README.md`.
- Prefer copy-pasteable commands and small guarded Lua examples.
- Be explicit about what Feather does not do. For example, Session Replay records inputs and developer-selected state; it does not serialize an entire game.

## Package Catalog Contributions

Use helper scripts instead of hand-writing package entries whenever possible. They fetch metadata, pin source commits or URLs, calculate SHA-256 checksums, write `catalog/packages/<id>.json`, and regenerate `cli/src/generated/registry.json`.

For GitHub-hosted packages:

```sh
pnpm run package:add
```

For direct file URLs:

```sh
pnpm run package:add-url
```

After the wizard finishes:

```sh
pnpm run check:registry
pnpm run cli:build
pnpm run feather -- package info <package-id>
pnpm run feather -- package install <package-id> --dir /tmp/feather-package-test
```

Package contribution tips:

- Prefer tagged releases. If a package has no tags, pin a specific commit.
- Keep install targets narrow and predictable, usually under `lib/<package-id>/`.
- Include a realistic `require` path and a small usage example.
- Use `verified` only for packages reviewed and pinned with checksums. Use `known` for checksum-pinned sources that still need extra review.
- Commit both `catalog/packages/<id>.json` and `cli/src/generated/registry.json`.

## Commit Messages

Commit subjects should start with one of these prefixes:

```txt
ci:
cli:
package:
plugin:
app:
lua:
tauri:
feather:
docs:
vscode-extension:
```

Examples:

```txt
cli: preserve plugin options in run shim
app: add session replay page
lua: harden hot reload allowlist checks
plugin: add session replay docs
docs: document cli-managed examples
vscode-extension: add release build command
```

## Pull Requests

Include:

- What changed and why.
- Screenshots or short recordings for visible UI changes.
- The commands you ran and their results.
- Any checks you could not run and why.
- Known limitations or follow-up work.
- AI assistance disclosure when applicable.
