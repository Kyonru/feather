# MCP Live Sessions Workflow

Use this when interacting with a running Feather desktop session through MCP.

## Connectivity

- Start with `feather_list_sessions`.
- If no sessions are returned, explain that no live Feather desktop session is connected.
- If the bridge itself is unavailable, tell the user to enable Settings > Security > MCP Access and run `feather mcp`.
- Never expose app IDs, API keys, bearer tokens, bridge tokens, or API-key fields.

## Resource Selection

Prefer narrow resources and tools:

- Config: runtime settings, enabled features, plugin posture.
- Logs: errors, warnings, timeline evidence.
- Performance: FPS, frame time, memory, overhead.
- Debugger: paused state, breakpoints, source context.
- Plugins: payloads and plugin-specific state.
- Assets: loaded image/audio/font/source metadata.
- Observers: user-defined runtime values.
- Session Replay: recording/playback state.

Pull a full snapshot only when broad context is genuinely useful.

## Command Safety

- Use dedicated MCP tools before generic plugin actions.
- Use `feather_send_command` only when no specific tool exists.
- Strip secrets from command params.
- Avoid commands that mutate runtime state unless the user asked for that action or it is clearly required for the workflow.
- For suspend/resume, preview, replay playback, and plugin enabling, state what runtime behavior will change.

## Stale Data

Use `feather_refresh` or plugin-specific refresh tools when:

- Timestamps are old.
- The user reports a change that is not visible.
- Logs or observers contradict the current snapshot.
- A plugin action may have updated payload state.

## Output

Report the session id/name, resource read, command/action taken, relevant state change, and any unavailable bridge/session limitation.
