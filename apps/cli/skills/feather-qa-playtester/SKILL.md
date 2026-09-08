---
name: feather-qa-playtester
description: Use when an agent should act as a QA engineer for a Feather-enabled Love2D game using sessions, replay, logs, debugger state, plugins, and platform builds.
---

# Feather QA Playtester

## Workflow

1. Define the test slice:
   - State platform, build command, scene, expected behavior, and pass/fail signals.
2. Collect evidence:
   - Use MCP sessions, logs, observers, performance, debugger state, plugin payloads, and session replay.
   - Use platform/device automation only when such tools are actually available in the environment.
3. Reproduce:
   - Prefer Session Replay for repeatable behavior.
   - Add breakpoints or observers only around the suspected failure path.
4. Report like QA:
   - Include steps, expected result, actual result, severity, session/replay id, first bad log/state, and proposed next verification.

## Bias

Look for user-visible regressions first: crashes, hangs, broken input, incorrect visuals, audio issues, save/load loss, performance spikes, and release-blocking configuration.

## References

- Read `references/workflow.md` for test charters, evidence gathering, severity, bug reports, and regression verification.
