# Feather architecture improvement audit

- Status: proposed work, not an accepted implementation plan
- Audited: 2026-09-10
- Scope: Inspector and the architecture that feeds, automates, packages, and extends it

This directory turns the architecture review into bounded workstreams. It complements `V4.md`
(release boundaries) and its §6 (interface refinement); it does not replace either one.
Studio implementation is deliberately not reviewed here because it is being changed in parallel.
Only the Inspector-to-Studio process boundary is covered.

## Documents

| Area | Document | Main outcome |
| --- | --- | --- |
| Game connection | [connection.md](./connection.md) | Keep transport work off the game frame and bound every queue |
| Inspector app | [inspector.md](./inspector.md) | Split ingestion from presentation and make state truly per-session |
| Runtime and wire protocol | [runtime-protocol.md](./runtime-protocol.md) | Enforce compatibility and validate the load-bearing payloads |
| Plugin system | [plugins.md](./plugins.md) | Turn declared capabilities into enforced policy and budget plugin work |
| Package management | [packages.md](./packages.md) | Make installs transactional, ownership-aware, and reproducible |
| CLI/build/release | [cli-build-release.md](./cli-build-release.md) | Extract stable service contracts from command registration and target adapters |
| VS Code extension | [vscode-extension.md](./vscode-extension.md) | Fix the moved-path regression and replace timer-based orchestration |
| MCP | [mcp.md](./mcp.md) | Keep one agent-facing server while decoupling backend credentials and correlation |
| Inspector/Studio bridge | [studio-bridge.md](./studio-bridge.md) | Scope the bridge capability and make session choice explicit |
| Repository boundaries | [repository-boundaries.md](./repository-boundaries.md) | Remove stale pre-v4 paths and make boundary checks executable |

## Priority order

`P0` means the current behavior can corrupt state, act on the wrong target, violate a stated
security boundary, or materially stall the game. `P1` is the next reliability/performance pass.
`P2` is maintainability or scale work that should follow measured bottlenecks.

| Priority | Work | Why first |
| --- | --- | --- |
| P0 | Fix raw-source package version overrides | `baseUrl.replace(tag, override)` does not change SHA-pinned catalog URLs, so the requested version can be mislabeled without being fetched |
| P0 | Make package install/update/remove transactional and ownership-aware | A later download failure can leave files changed while the lockfile stays old; remove deletes modified files |
| P0 | Enforce plugin capability allowlists | Missing capabilities currently emit a warning but do not prevent plugin activation |
| P0 | Bound and budget the game transport | Lua and Rust queues are unbounded and WebSocket masking can consume many frame budgets |
| P0 | Correlate command responses by request ID | One response can satisfy multiple identical MCP waits; timed-out waiters linger |
| P0 | Make protocol incompatibility operational | Inspector displays an incompatibility but continues normal command traffic |
| P0 | Scope the Studio bridge capability | The bridge accepts any game command even though its purpose is creative preview |
| P1 | Gate MCP recording before parsing/cloning | Disabled MCP still pays JSON parse, redaction, snapshot, and locking costs |
| P1 | Replace JSON-array binary Tauri events with channels/raw IPC | Binary data is inflated and copied across the native/frontend boundary |
| P1 | Split Inspector ingestion and cap histories | The 1,031-line connection hook owns transport, decoding, state migration, UI effects, and file export |
| P1 | Repair VS Code extension orchestration | The local dev launcher points to the removed root CLI; terminal jobs refresh through fixed timers |
| P1 | Decouple MCP gateway auth from backend auth | The supposedly unified gateway cannot start for Studio-only use without an Inspector token |
| P2 | Decompose large CLI, extension, plugin, and page modules | This reduces drift once the correctness boundaries above are executable |
| P2 | Finish repository path cleanup and metadata | Stale paths now appear in agent instructions, package metadata, workspace comments, and local launch code |

## Recommended implementation sequence

1. Add failing tests and telemetry for the P0 behaviors. Do not refactor first.
2. Land package correctness as one workstream; it does not depend on the live runtime.
3. Land connection bounding, MCP early gating, and response correlation together because they share
   the Rust relay and need load tests that prove the game remains responsive.
4. Enforce plugin capability/runtime policy with compatibility messaging for existing manifests.
5. Make incompatible live sessions read-only, then add targeted payload schemas and request IDs.
6. Repair the extension launcher and introduce an observable CLI job API before changing its UI.
7. Split large modules only after behavior is pinned by tests.
8. Clean stale repository guidance and add checks that prevent moved paths from returning.

## Cross-cutting acceptance gates

- A 60-second slow-consumer test has stable memory and bounded queue depth.
- A large capture cannot spend more than the configured per-frame Feather budget before yielding.
- Two concurrent commands of the same type receive their own responses or their own timeouts.
- A failed package operation leaves both project files and `feather.lock.json` byte-for-byte unchanged.
- Removing a modified package file refuses by default and prints a recovery action.
- A plugin missing an allowed capability never reaches `init`, `update`, callbacks, or actions.
- An incompatible runtime is visible for historical inspection but receives no mutating command.
- Studio-only creative MCP use does not require Inspector to be running or configured.
- All app/package metadata and agent guidance use the post-v4 `apps/*` and `catalog/*` paths.

## Things to preserve

- Rust remains a transparent relay for ordinary game protocol messages.
- Release builds remain Feather-free by default.
- One configured `feather mcp` endpoint remains the agent-facing experience; Inspector and Studio
  still own and release their backend halves independently.
- Inspector never imports or bundles Studio code.
- Existing log virtualization, bounded persisted log history, protocol message registry, plugin
  error isolation, registry checksums, and extension snapshot verification are good foundations.
- `V4.md` §6 remains the source for visual, interaction, accessibility, and panel-level UX
  refinement. This audit should not create a competing UI plan.
