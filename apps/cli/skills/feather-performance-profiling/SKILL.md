---
name: feather-performance-profiling
description: Use when an agent needs to profile frame time, memory, runtime overhead, hotspots, or performance regressions in a Feather session.
---

# Feather Performance Profiling

## Workflow

1. Establish a baseline:
   - Read `feather://sessions/{id}/performance`.
   - Note FPS, frame time, update/draw balance, memory, message volume, and Feather overhead.
2. Capture hotspots:
   - Use available profiler MCP tools or plugin actions before adding instrumentation.
   - Prefer short captures around the slow scene or interaction.
3. Correlate with logs and state:
   - Read logs and observer snapshots for scene transitions, entity counts, particle counts, asset loads, or shader changes.
4. Make the smallest performance edit:
   - Reduce allocations, repeated asset loads, excessive logs, expensive draw loops, or unbounded plugin payloads.
5. Re-measure:
   - Compare the same scenario before and after the change.

## Guardrails

Do not optimize from one frame. Use repeatable captures, and call out when a result is noisy because the game, platform, or session changed.

## References

- Read `references/workflow.md` for baseline metrics, capture strategy, common hotspots, fixes, and re-measurement format.
