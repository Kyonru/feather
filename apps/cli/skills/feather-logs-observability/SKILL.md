---
name: feather-logs-observability
description: Use when an agent needs to diagnose Love2D behavior from Feather logs, observer values, assets, runtime messages, or telemetry.
---

# Feather Logs And Observability

## Workflow

1. Start with live session context:
   - Read `feather://sessions`, then `feather://sessions/{id}/logs`, `observers`, `assets`, and `performance`.
   - Use refresh tools when the snapshot looks stale.
2. Separate signal from noise:
   - Group errors, warnings, repeated logs, observer changes, and recent plugin payloads by time.
   - Check whether runtime suspend/resume or plugin settings affected data freshness.
3. Ask for targeted observers when code changes are needed:
   - Add or update lightweight observers around the suspected system.
   - Avoid broad object dumps that will hide timing-sensitive behavior.
4. Verify with a second snapshot after the fix or action.

## Output

Summarize the timeline: what changed first, what the runtime reported, which observer or log confirms it, and the next concrete check.

## References

- Read `references/workflow.md` for evidence collection, timeline construction, observers, and stale-snapshot handling.
