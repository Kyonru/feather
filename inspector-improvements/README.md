# Feather architecture improvement audit

- Status: reconciled implementation audit; remaining items are backlog, not v4 blockers
- Audited: 2026-09-10
- Reconciled: 2026-10-16
- Scope: Inspector and the architecture that feeds, automates, packages, and extends it

This directory records the September architecture review and the disposition of its workstreams. It complements `V4.md`
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

The detailed documents preserve the evidence and original proposals. Their findings are historical;
use the table below for current status and `V4.md` for active v4 work.

## Current disposition

`P0` means the current behavior can corrupt state, act on the wrong target, violate a stated
security boundary, or materially stall the game. `P1` is the next reliability/performance pass.
`P2` is maintainability or scale work that should follow measured bottlenecks.

| Area | Status | Landed / remaining |
| --- | --- | --- |
| Packages | Partial | Transactionality, ownership, lock validation, version resolution and provenance landed. Independently signed registry metadata remains backlog. |
| Plugins | Partial | Capability/runtime policy, scheduler budgets, manifests, action correlation, bounded UI payloads and Inspector/MCP health landed. Capability-scoped Lua contexts and manager decomposition remain. |
| Connection | Partial | Incremental masking, bounded queues, explicit overflow, disabled-MCP gating, raw binary IPC, log batching and capped history landed. Byte-accounted Rust queues, overload UI and soak/load proof remain. |
| Runtime/protocol | Partial | Request IDs, read-only incompatible sessions and named receive overflow landed. Feature/range negotiation and targeted payload schemas remain. |
| MCP | Partial | Independent startup/auth, correlation cleanup, status, deadlines, request limits, raw-command gating and Studio-local particle authoring landed. Module decomposition remains. |
| Studio bridge | Done | Narrow allowlist, session selection, revocation, limits and TypeScript/Rust drift checks are implemented and covered. |
| VS Code extension | Partial | Launcher, managed cancellable jobs, project selection, build config and real Extension Host Doctor coverage landed. A canonical shared CLI machine contract remains. |
| Repository boundaries | Done except release proof | Post-v4 paths, metadata, CI/Turbo and executable boundary checks landed. Owner-only release checks remain in `V4.md` step 5. |
| Inspector app | Partial | Per-session events, lazy routes, batching and capped history landed. Connection-hook/host decomposition and swallowed-error cleanup remain. |
| CLI/build/release | Partial | Archive limits and package safety landed. Service extraction and owner release proofs remain. |

## Original recommended implementation sequence

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

- Backlog: a 60-second slow-consumer test has stable memory and bounded queue depth.
- Met: a large frame masks incrementally within the configured frame budget.
- Met: two concurrent commands of the same type receive their own responses or their own timeouts.
- Met: a failed package operation leaves both project files and `feather.lock.json` unchanged.
- Met: removing a modified package file refuses by default and prints a recovery action.
- Met: a plugin missing an allowed capability never reaches `init`, `update`, callbacks, or actions.
- Met: an incompatible runtime is visible for historical inspection but receives no mutating command.
- Met: Studio-only Shader Graph, Texture Lab and Particle Playground MCP work without Inspector.
- Met: app/package metadata and agent guidance use the post-v4 `apps/*` and `catalog/*` paths.

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
