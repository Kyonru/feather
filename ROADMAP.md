# Feather Roadmap

I've been a fun month, but it's time to get back to my game, using all that i've been developing with feather to speedup development and serve as a real scenario for this tool. I'll be limiting new contributions to plugins, cool packages, and fixes, until i feel i have something worth focusing. Hopefully my experience with feather over the next months will serve as a good real world testing.

For now here's some future directions:

## Guiding Direction

Feather already has enough surface area: CLI init/run/watch/build/upload/release, desktop inspector, package management, VS Code extension, and 24 built-in plugins. The next phase should deliberately pause feature growth and make the core workflow feel trustworthy, beautiful, and boringly reliable.

External signal supports this direction: LÖVE tooling still clusters around launch/debug/profiling/hot reload, larger engines keep investing in profiling and content pipelines, and indie teams are constrained by testing and playtest capacity. Feather should lean into small-team confidence, not become a full engine.

The core promise is faster debugging and safer shipping for indie and small-team LÖVE developers.

## Roadmap Policy

- Next 1-2 releases: no major new features unless they directly improve setup, reliability, docs, release safety, or existing plugin quality.
- Future features must pass one gate: they make a developer faster at debugging, validating, shipping, or reproducing a problem.
- Avoid: more random plugins, a full visual game editor, cloud accounts, broad AI features, or competing with full engines.
- Public roadmap items are candidate themes, not promised dates.
- But: If i have a cool idea or something I want to try out, i'll work on that.

## Future Feature Themes

### 1. Repro & Crash Diagnostics

- One-click "Create Debug Bundle" from desktop or CLI.
- Bundle logs, Feather config posture, build manifest, recent errors, plugin state, platform info, screenshots, and optional input replay.
- Optional Sentry/export integration later, but keep v1 local-first.

Why: this matches Feather's strongest identity. When something breaks, Feather helps you understand it fast.

### 2. Playtest Workflow

- Stabilize input replay into "record session -> replay -> attach to bug report."
- Add bookmarks/notes during playtests.
- Add lightweight playtest report export: session length, errors, perf spikes, screenshots, input replay file.
- Later: batch replay in CI for regression smoke tests.

Why: indie teams have limited playtest capacity, so repeatable repros are more valuable than another inspector panel.

### 3. Asset & Build Health

- Asset audit: unused files, huge textures/audio, missing references, suspicious file sizes.
- Build size budget checks in `doctor`.
- Platform build diff: "what changed since last build."
- Release artifact inspector: show why an artifact is clean, not just that it passed.

Why: this reinforces release confidence without becoming a game editor.

### 4. Plugin SDK Hardening

- Version the plugin UI/action protocol.
- Add plugin test harnesses and examples.
- Add plugin health diagnostics: slow plugin, failing request, missing capabilities, bad manifest.
- Improve generated plugin docs from manifests/config.

Why: Feather has many plugins already; the ecosystem needs consistency more than quantity.

### 5. Templates & Golden Paths

Small but high-leverage.

- `feather init --template minimal|jam|mobile|release`
- Example projects that are tested in CI.
- VS Code "new Feather project" flow that mirrors CLI defaults.
- GitHub Actions templates for build/test/release.

Why: polish is often just fewer decisions at setup time.

## Parking Lot

Keep these visible but explicitly later:

- Steam release automation.
- Remote/team sessions.
- Cloud crash dashboard.
- Scene graph / visual entity editor.
- Timeline-based replay debugger.
- Shader/particle asset marketplace.
- AI-assisted debugging summaries.

## Validation

Before promoting any parked feature, require:

- A clear user story from a real LÖVE workflow.
- A CLI or desktop happy path that works in under 5 minutes.
- `doctor` checks for setup failures.
- Docs with copy-pasteable commands.
- At least one e2e test or demo project coverage.
- No production release safety regression.

## Assumptions

- Feather's core audience remains indie/small-team LÖVE developers.
- The main product promise is faster debugging, safer shipping and faster iterations, not becoming a general-purpose engine (for now).
- Public roadmap items should be framed as candidate themes, not promised dates.

## Context Sources

- LÖVE tooling market signal
- Integrated profiling/resource visibility reference: https://defold.com/manuals/profiling/

## Carried-forward architecture and product work

These items were deliberately left outside the completed v4 release. They are candidates, not promised dates, and remain subject to the roadmap policy above.

### Particles — the authoring model redesign

*(Owner: "i'm okay with redesigning how particles are created, like the whole feature, as long as
we achieve the same things with a more intuitive design.")* The plan is agreed; none of it is built.

1. **Start from an effect, not a parameter.** Templates (`presets.ts`) become the opening screen —
   fire, smoke, sparks, rain, snow, explosion, trail — each working the moment it is picked.
2. **Shape it with direct manipulation.** Keep the gizmos; they are the advantage over a slider
   panel: `DirectionSpreadGizmo`, `LinearAccelPlane`, `CircularForceGizmo`, `RotationSpinGizmo`,
   `TextureOffsetGizmo`, `SizeCurveEditor`, `ColorGradientEditor`, `DampingRangeEditor`.
3. **Expose the native model underneath.** Every gizmo names the LÖVE property it writes
   (`setLinearAcceleration` …), so the export reads in the same vocabulary.
4. **The timeline is a layer you add.** Adding a lane is explicit; an effect with none is visibly and
   structurally simpler, including in what it exports (see the particle runtime architecture).

**Must survive:** multi-emitter composites, the timeline with bursts and per-lane easing, live push
into a running game, per-emitter shaders, atlases with animated and variant playback, project
import/export. **Owes the export:** kick-start on start (done in P3) and the tier-0 guarantee.

### Particles — GPU backend

The GPU-particle specification was implemented as a standalone library,
[Kyonru/gpuparticles](https://github.com/Kyonru/gpuparticles): analytic and stateful modes with
derived `mode = "auto"`, closed-form forces, O(1) analytic warm-up, a native-ParticleSystem fallback
behind the same API (`getBackend()`), numeric GPU tests and a `bench/` project. Verified 2026-10-16.

What remains is Feather-side: a **second export target** in the particle tool, chosen when an effect
needs counts or forces the native system cannot reach. Timeline lanes are pure functions of time, so
a lane becomes a uniform or a baked LUT texture. **The rule:** an effect that does not need the GPU
backend must not be given it. This also addresses the remaining `variants` atlas limitation: those
atlases still draw in N calls on LÖVE 11 because `ParticleSystem` exposes no per-particle data to a
shader (68 methods, verified). See the particle runtime architecture in
`packages/runtime-lua/plugins/particle-system-playground/README.md`.

### Inspector — refinements left partial

- **C4** — 27 swallowed errors remain (44 → 27; 11 now surface, 10 named deliberate), mostly
  clipboard and `invoke`. Each should become a decision rather than a default.
- **6.1 Logs** — filtered-view export is implemented and covered in the Inspector browser suite.
- **6.7 Plugins** — acceptance not yet shown: a plugin author can tell from this page alone why
  their plugin is not appearing ("not installed" / "installed and off" / "incompatible").
- **Design direction (see `skills/feather-desktop-app/references/design-rules.md`)** — agreed, applied only where C0 required it.

### Duplication between the apps

Measured 2026-09-11: `src/utils/arrays.ts` (28 lines), `cache.ts` (80) and `timers.ts` (64) are
byte-identical between Inspector and Studio. Candidates for `packages/ui` or a small shared package,
but only if the sharing is a contract (see `apps/docs/architecture.md`). `assets.ts` and `file.ts` differ; `lib`, `hooks`,
`store` and `components` share no files.

### The architecture audit

`inspector-improvements/` (audited 2026-09-10) is a separate, proposed set of workstreams —
connection budgets, per-session state, plugin capability enforcement, transactional package
installs, MCP request correlation. Its repository-boundary findings that belonged to the completed
architecture migration have already landed.

The plugin audit's P0/P1 boundary is nevertheless closed: the runtime bounds plugin payload bytes,
depth, nodes, strings and binary totals before transport, Inspector independently validates before
rendering, and structured health plus a bounded error panel explain any rejection. Capability-scoped
Lua contexts and manager decomposition remain post-v4 architecture work.
