---
name: feather-session-replay-qa
description: Use when an agent should record, inspect, replay, seek, import, export, or use Feather Session Replay for QA and regression debugging.
---

# Feather Session Replay QA

## Workflow

1. Check replay state:
   - Read `feather://sessions/{id}/session-replay`.
   - Use `feather_session_replay_state` before recording or playback.
2. Record a focused scenario:
   - Use `feather_session_replay_start_recording` and `feather_session_replay_stop_recording`.
   - Keep notes on expected behavior, inputs, scene, and failure point.
3. Inspect and replay:
   - Use load/list tools, `feather_session_replay_play`, `pause`, `seek`, and export tools.
   - Correlate replay position with logs, debugger state, performance, and plugin payloads.
4. Turn findings into reproducible QA output:
   - Include replay id/name, time range, expected result, actual result, and the first suspicious log or state change.

## Scope

Session Replay is for deterministic investigation when the game supports the recorded signals. If a runtime cannot replay a behavior, say exactly which missing input, plugin, or session state prevents reproduction.

## References

- Read `references/workflow.md` for recording, replay inspection, seek strategy, import/export handling, and QA output format.
