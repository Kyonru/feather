# VS Code extension architecture

## Goal

Keep the extension a thin, hermetic companion to a pinned Feather platform snapshot. It should
orchestrate the CLI through a stable machine contract, observe completion, and avoid reimplementing
CLI policy.

## Findings

### 1. Local extension development points to the removed CLI path (`P0/P1`)

`apps/vscode-extension/scripts/prepare.mjs` writes this import into
`bundled-bin/feather-dev.mjs`:

```js
import { runCli } from '../../../cli/dist/index.js';
```

From `apps/vscode-extension/bundled-bin`, that resolves to repository-root `cli/`, not `apps/cli/`.
The correct relative location is under `../../cli/`, or better, a path derived and verified by the
prepare script. The current unit/integration tests do not launch the generated dev launcher, so the
migration regression passes.

Package repository metadata also still says `directory: "vscode-extension"` instead of
`apps/vscode-extension`.

### 2. `extension.ts` duplicates workflow policy (`P1`)

At roughly 946 lines it constructs init, run, watch, plugin, package, vendor, build, release, upload,
remove, and update command plans. Option names, default plugin IDs, security choices, target rules,
and command sequences are copied from the CLI contract by hand.

### 3. Terminal launch has no completion contract (`P1`)

Most actions use `terminal.sendText`, refresh immediately, then refresh again after 1.5 seconds.
The extension cannot know success, failure, progress, cancellation, generated artifacts, or when a
long build actually finishes. Disposing an existing same-name terminal can also destroy useful
output or an active job.

### 4. Project state is re-parsed independently (`P1`)

`project.ts` and `catalog.ts` parse config snippets, plugin manifests/counts, and lockfiles with
small ad hoc readers. Invalid lockfiles become a package count of zero rather than a visible broken
state. This can disagree with CLI Doctor and package compatibility logic.

### 5. The build config panel duplicates the schema (`P1`)

`buildConfigPanel.ts` defines a local `BuildConfig` and serializes form data itself. It can accept,
omit, or rewrite fields differently from `apps/cli/src/lib/build/config.ts`. At ~598 lines, UI,
schema, HTML, CSS, message handling, and filesystem writes are one module.

### 6. Tests cover registration more than workflows (`P1`)

Unit tests cover quoting and basic project status. The extension-host test asserts that core command
IDs register. It does not prove generated launcher startup, CLI completion handling, arguments for
major workflows, multi-root selection, cancellation, config round trips, or packaged VSIX contents.

### 7. Workspace selection is first-root-biased (`P2`)

Absent `feather.projectDir`, the first workspace folder wins. Multi-root workspaces need a selected
project identity rather than ordering-dependent behavior.

## Proposed design

### Stable CLI machine API

Add a versioned JSON/JSONL mode for orchestration:

- request: command, validated options, project path, client version;
- events: started, progress, warning, prompt-required, artifact, completed, failed, cancelled;
- result: stable error code, human message, structured data, platform version.

The extension should spawn without a shell for managed jobs, stream events to a VS Code output
channel/progress notification, and retain terminal mode only where the user explicitly needs an
interactive process such as watch/run.

### Shared read-only service contracts

Extract pure, publishable contracts for project status, build config schema, catalog metadata, and
command plan validation. The extension can bundle the same snapshot without importing CLI command
registration or duplicating parsers.

### Extension module split

Organize command registration by workflow (`run`, `setup`, `plugins`, `packages`, `build-release`),
with a small activation file. Split the build-config model/validation from its webview rendering.
Centralize job lifecycle and refresh from completion events.

### Explicit project selection

Discover workspace folders containing `main.lua`, remember the chosen folder by workspace, and show
the project identity in the tree/status item. Configured paths must be validated to remain inside or
be explicitly accepted outside the workspace.

## Immediate fix/test

1. Correct the generated dev launcher path.
2. Add a test that runs `prepare.mjs`, executes `feather-dev.mjs --help`, and asserts it loaded
   `apps/cli/dist/index.js`.
3. Correct both package `repository.directory` values (`apps/cli`, `apps/vscode-extension`).
4. Stop using fixed refresh timers for commands that can use `spawnFeather` immediately; refresh on
   process completion while the machine API is developed.

## Acceptance

- Generated dev launcher executes `--help` from a clean checkout after `extension:prepare`.
- Packaged VSIX and local launcher report the same declared platform snapshot.
- Every managed command exposes progress, completion, cancellation, and structured failure.
- Extension command plans are contract-tested against the current CLI.
- Invalid config/lockfile status is visible and matches Doctor.
- Build config round-trips every supported field without loss.
- Multi-root selection is stable and explicit.
- Activation file becomes wiring, not the implementation of every workflow.

