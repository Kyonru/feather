---
name: feather-mcp-live-sessions
description: Use when an agent should inspect or control a running Feather desktop session through MCP.
---

# Feather MCP Live Sessions

## Preconditions

- Feather desktop must be running.
- Settings > Security > MCP Access must be enabled.
- Start the MCP server with `feather mcp` for stdio clients, or `feather mcp --transport http` for localhost HTTP clients.

## Workflow

1. Discover sessions with `feather://sessions` or `feather_list_sessions`.
2. Pull a full snapshot with `feather_session_snapshot` before sending commands.
3. Read narrow resources when possible:
   - `feather://sessions/{id}/config`
   - `feather://sessions/{id}/logs`
   - `feather://sessions/{id}/performance`
   - `feather://sessions/{id}/debugger`
   - `feather://sessions/{id}/plugins`
   - `feather://sessions/{id}/assets`
   - `feather://sessions/{id}/observers`
4. Use explicit tools before the escape hatch. Reserve `feather_send_command` for advanced runtime commands and strip app IDs, API keys, MCP tokens, and secret fields from inputs.
5. If the bridge is unavailable, say that the desktop bridge is unavailable and give the exact local command or setting needed.

## Safety

Never expose app IDs, API keys, bearer tokens, or MCP bridge tokens in notes, tool arguments, resources, or generated artifacts.

## References

- Read `references/workflow.md` for MCP session discovery, resource selection, command safety, and unavailable-bridge handling.
