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
