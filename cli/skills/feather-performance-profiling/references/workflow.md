# Performance Profiling Workflow

Use this when frame time, memory, runtime overhead, hotspots, or regressions matter.

## Baseline Metrics

Record:

- FPS and frame time.
- Update versus draw balance.
- Memory and allocation growth.
- Message count and byte volume.
- Feather overhead.
- Scene, platform, build mode, and active plugins.

Do not compare captures from different scenes or platforms as if they are equivalent.

## Capture Strategy

- Capture a short, repeatable scenario.
- Note the user action or replay segment that triggers the issue.
- Prefer profiler tools and performance resources before adding instrumentation.
- If captures are noisy, run multiple passes and compare the pattern, not one frame.

## Common Hotspots

- Per-frame table allocation in update/draw loops.
- Repeated image/font/audio loads.
- Unbounded particles or draw calls.
- Excessive logs or observer payloads.
- Expensive shader passes or canvas churn.
- Plugin payloads emitted every frame without active interest.
- Pathfinding, collision, sorting, or layout inside tight loops.

## Fix Patterns

- Cache assets and computed data.
- Move static work out of `love.update` and `love.draw`.
- Bound particles, logs, replay captures, and plugin payloads.
- Batch draw work where the codebase already has batching patterns.
- Lower preview/debug sampling while keeping user-facing behavior intact.

## Re-measurement

Report before/after values for the same scenario, the specific change made, residual risk, and whether more profiling is needed.
