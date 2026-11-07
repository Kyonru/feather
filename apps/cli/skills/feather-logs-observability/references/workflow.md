# Logs And Observability Workflow

Use this when diagnosing behavior from logs, observers, assets, runtime messages, or telemetry.

## Evidence Sources

- Logs: errors, warnings, repeated messages, plugin logs, runtime notices.
- Observers: focused values that should change over time.
- Assets: loaded files, dimensions, missing or duplicate loads.
- Performance: frame time, memory, message volume, overhead.
- Plugins: domain-specific payloads.
- Debugger: paused source context when logs point to a line.

## Timeline Construction

Build a short timeline:

1. First user-visible symptom.
2. First relevant warning/error.
3. Observer value before and after the symptom.
4. Asset or plugin state changes near the symptom.
5. Performance spike or runtime suspend/resume event.

Separate repeating aftermath logs from the first cause.

## Refresh Strategy

- Refresh logs when the user has just reproduced the issue.
- Refresh observers after changing instrumentation.
- Refresh assets after loading screens or file changes.
- Refresh plugins after plugin actions or parameter changes.

Call out stale timestamps instead of over-interpreting them.

## Adding Observers

When code edits are appropriate:

- Add narrow observers around the suspect system.
- Track scalars, booleans, small strings, IDs, or counts.
- Avoid dumping large tables every frame.
- Remove or gate noisy observers if they are temporary.

## Output

Lead with the timeline and evidence, then the most likely cause, then the next concrete check or patch.
