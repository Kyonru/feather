# Session Replay QA Workflow

Use this when recording, inspecting, replaying, seeking, importing, or exporting Feather Session Replay data.

## Recording

- Read replay state before starting.
- Record one focused scenario per replay.
- Note scene, starting state, expected behavior, user inputs, and failure point.
- Stop recording soon after the relevant behavior to keep payloads small.

## Inspection

Use replay state plus:

- Logs for first warnings/errors.
- Observers for state transitions.
- Performance for spikes.
- Debugger state for paused source context.
- Plugin payloads for domain-specific state.

Seek to the earliest point that shows divergence, not only the final symptom.

## Playback And Seek

- Use list/load before playback when the selected replay is unclear.
- Seek by timestamp, checkpoint id, or checkpoint label when available.
- After seek, re-read logs/state if the playback action changes them.
- Stop playback when done to avoid confusing live-session state.

## Import And Export

- Treat replay files as diagnostic artifacts.
- Do not write files unless asked.
- When importing, identify required files and missing metadata.
- When exporting/loading, return payload metadata and the replay id/path, not large raw dumps.

## QA Output

Include replay id/name, time range, steps, expected result, actual result, first suspicious evidence, severity, and next verification.
