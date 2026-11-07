# MCP

Feather can run as a local [Model Context Protocol](https://modelcontextprotocol.io/specification/2025-06-18) server for AI clients. The MCP server exposes sanitized live session context, plugin state, and creative-tool workflows through the Feather desktop app.

MCP is for local development automation. It is disabled by default and should stay disabled unless a local MCP client is actively connected.

## Setup

1. Start the Feather desktop app.
2. Open **Settings → Security → MCP Access**.
3. Enable MCP access.
4. Copy the generated client config or use the CLI directly:

```bash
feather mcp
```

`feather mcp` defaults to stdio, which is the best transport for local desktop AI clients.

For Codex or Claude Code, Feather can install the persistent MCP client entry:

```bash
feather mcp setup --client codex
feather mcp setup --client claude
```

Codex setup updates `~/.codex/config.toml`. Claude setup defaults to user scope and updates `~/.claude.json`; use `--scope project` to write `.mcp.json` in the current project, or `--scope local` to add a project-local entry under `~/.claude.json`. Setup does not copy the MCP token into client config; the CLI reads the token from `~/.feather/mcp.json` when the client starts the server. Restart the client after setup.

For clients that require Streamable HTTP:

```bash
feather mcp --transport http
```

HTTP listens on `127.0.0.1:4006/mcp` by default. HTTP clients authenticate to this server with its **own** bearer token, not with Inspector's: on first HTTP start it creates one in `~/.feather/mcp-gateway.json` (readable by you only) and reuses it, so client configuration survives restarts. Pass `--http-token` or set `FEATHER_MCP_HTTP_TOKEN` to choose it yourself.

## One Server, Two Applications

`feather mcp` is the one server you configure, but the state behind it lives in two separate applications: **Feather Inspector** (live sessions, logs, debugging, plugins) and **Feather Studio** (shaders, particles, textures). The server starts with either, both, or neither running, and routes each tool to the application that owns it. A tool whose application is not running or not authorized says which one and what to do.

Read `feather://status` or call `feather_status` to see what is available: each backend's reachability, version, features, and a remedy for anything missing.

## Tokens And Options

Each connection has its own credential, so rotating one never breaks another:

| Credential | Authenticates | Where it comes from |
| --- | --- | --- |
| Inspector bridge token | the server → Inspector (`127.0.0.1:4005`) | `--token`, then `FEATHER_MCP_TOKEN`, then `~/.feather/mcp.json` (written by Inspector when **Settings → Security → MCP Access** is on) |
| Studio token | the server → Studio (`127.0.0.1:4007`) | `--studio-token`, then `FEATHER_STUDIO_MCP_TOKEN`, then `~/.feather/studio-mcp.json` (written by Studio at every launch) |
| Gateway HTTP token | HTTP clients → this server (`127.0.0.1:4006`) | `--http-token`, then `FEATHER_MCP_HTTP_TOKEN`, then `~/.feather/mcp-gateway.json` (created on first HTTP start) |

Every call to a backend has a deadline (the game wait it carries plus a margin), so a stalled application fails with `… did not answer within N ms` instead of hanging. HTTP request bodies are limited to 1 MiB.

Useful options:

| Option | Default | Description |
| --- | --- | --- |
| `--transport <stdio\|http>` | `stdio` | MCP transport. |
| `--host <host>` | `127.0.0.1` | HTTP host. Only localhost hosts are accepted. |
| `--port <port>` | `4006` | HTTP MCP port. |
| `--desktop-url <url>` | `http://127.0.0.1:4005` | Desktop MCP bridge URL. |
| `--token <token>` | `~/.feather/mcp.json` | Inspector bridge token. |
| `--studio-url <url>` | `http://127.0.0.1:4007` | Studio creative endpoint. |
| `--studio-token <token>` | `~/.feather/studio-mcp.json` | Studio token. |
| `--http-token <token>` | `~/.feather/mcp-gateway.json` | Bearer token HTTP clients present to this server. |
| `--allow-raw-commands` | off | Expose `feather_send_command` (see Security). |

Example local client config:

```json
{
  "mcpServers": {
    "feather": {
      "command": "feather",
      "args": ["mcp"]
    }
  }
}
```

The Codex setup command writes the equivalent TOML server entry:

```toml
[mcp_servers.feather]
command = "feather"
args = ["mcp"]
```

Claude setup writes the JSON server entry with `type = "stdio"` in the selected scope:

```json
{
  "mcpServers": {
    "feather": {
      "type": "stdio",
      "command": "feather",
      "args": ["mcp"]
    }
  }
}
```

## Resources

Feather MCP resources are JSON-only snapshots. Secret-like fields such as `appId`, `apiKey`, bearer tokens, passwords, and secret fields are redacted.

| Resource | Description |
| --- | --- |
| `feather://sessions` | Connected and recently seen session summaries. |
| `feather://sessions/{id}/config` | Sanitized runtime config snapshot. |
| `feather://sessions/{id}/logs` | Recent logs. |
| `feather://sessions/{id}/performance` | Recent performance metrics. |
| `feather://sessions/{id}/debugger` | Debugger status and paused frame state. |
| `feather://sessions/{id}/plugins` | Live plugin payload map. |
| `feather://sessions/{id}/plugins/{pluginId}` | Live payload for one plugin. |
| `feather://sessions/{id}/assets` | Asset catalog metadata. |
| `feather://sessions/{id}/observers` | Observability payloads. |
| `feather://sessions/{id}/session-replay` | Session Replay status, loaded recording, and replay list. |
| `feather://plugins/catalog` | Built-in plugin catalog metadata. |
| `feather://plugins/{pluginId}` | Built-in metadata for one plugin. |
| `feather://creative/shader-graph` | Desktop-local Shader Graph snapshot. |
| `feather://creative/particle-system-playground` | Particle Playground snapshot. |
| `feather://creative/texture-lab` | Desktop-local Texture Lab snapshot. |

## Tools

Session and runtime tools:

- `feather_list_sessions`
- `feather_get_session_snapshot`
- `feather_refresh`
- `feather_runtime`
- `feather_debugger_state`
- `feather_debugger_enable`
- `feather_debugger_set_breakpoints`
- `feather_debugger_step`
- `feather_debugger_continue`
- `feather_debugger_inspect_frame`
- `feather_debugger_line_context`
- `feather_debugger`
- `feather_console_eval`
- `feather_console`
- `feather_time_travel`
- `feather_session_replay_state`
- `feather_session_replay_list`
- `feather_session_replay_start`
- `feather_session_replay_stop`
- `feather_session_replay_load`
- `feather_session_replay_play`
- `feather_session_replay_seek`
- `feather_session_replay_stop_playback`
- `feather_session_replay_import`
- `feather_session_replay_delete`
- `feather_session_replay`
- `feather_send_command`

Plugin tools:

- `feather_list_plugins`
- `feather_get_plugin`
- `feather_get_live_plugin_state`
- `feather_refresh_plugin`
- `feather_plugin_action`
- `feather_plugin_params`
- `feather_plugin_set_enabled`

Creative tools:

- `feather_create_shader`
- `feather_create_particle_system`
- `feather_create_texture`
- `feather_shader_graph_snapshot`
- `feather_shader_graph_compile`
- `feather_shader_graph_preview`
- `feather_shader_graph_clear_preview`
- `feather_shader_graph_import`
- `feather_shader_graph_export`
- `feather_particles_snapshot`
- `feather_particles_new_composite`
- `feather_particles_select`
- `feather_particles_set_params`
- `feather_particles_action`
- `feather_particles_export_project`
- `feather_particles_export_code`
- `feather_particles_export_zip`
- `feather_texture_lab_generators`
- `feather_texture_lab_snapshot`
- `feather_texture_lab_set_recipe`
- `feather_texture_lab_save_recipe`
- `feather_texture_lab_delete_recipe`
- `feather_texture_lab_generate`
- `feather_texture_lab_generate_atlas`

Texture Lab and Particle Playground binary outputs are returned as JSON/base64 payload metadata. MCP does not write generated files automatically.

## Creating Creative Assets

Use the high-level creation tools first:

- `feather_create_shader` creates a Shader Graph workspace shader from Feather graph JSON or standalone GLSL. Pass `validateInGame: true` to route it through the live `shader-graph` plugin compiler, or `previewInGame: true` to show it in a connected Love2D session.
- `feather_create_particle_system` creates and updates a composite in Studio's active local Particle Playground workspace, then can attach texture/shader payloads and return project/code/ZIP asset payloads without a running game. Pass `sessionId` to target a live game; live-only operations such as `emitCount`, `emit`, and `runtime-preview` require it.
- `feather_create_texture` creates a Texture Lab PNG or atlas payload from a recipe, generator, and dimensions. It returns base64 metadata and can optionally save the recipe in the desktop workspace.

The lower-level Shader Graph, Particle Playground, Texture Lab, and generic plugin tools remain available when an MCP client needs precise step-by-step control.

## Step Debugging

Use the debugger-specific tools when an MCP client needs to drive a paused Love2D session:

- `feather_debugger_state` returns debugger status, the paused frame, locals/upvalues, recent logs, and nearby source lines from the debugger `sourceRoot`.
- `feather_debugger_enable` enables the step debugger and can set `pauseOnError`.
- `feather_debugger_set_breakpoints` merges or replaces breakpoints and returns rejected breakpoint details from the runtime.
- `feather_debugger_step` supports `over`, `into`, and `out`, waits for the next `debugger:paused` message, then returns updated state.
- `feather_debugger_continue` resumes execution and waits for `debugger:resumed`.
- `feather_debugger_inspect_frame` requests locals/upvalues for a stack frame.
- `feather_debugger_line_context` reads source context for the current pause, a stack frame, or an explicit file/line inside the game source root.

The generic `feather_debugger` tool is still available for raw debugger actions, but the dedicated tools are the recommended MCP path for agent-led debugging.

## Session Replay

Use the Session Replay tools when an MCP client needs to record or reproduce a run:

- `feather_session_replay_state` returns current recording/playback status, loaded recording payload metadata, and the replay list.
- `feather_session_replay_list` refreshes saved replay summaries.
- `feather_session_replay_start` starts recording with optional Session Replay options such as `id` or `initialStates`.
- `feather_session_replay_stop` stops recording and returns updated status/list state.
- `feather_session_replay_load` loads a replay payload by `id` or `path`, returning replay files as JSON/base64 metadata.
- `feather_session_replay_play` starts playback for the selected or provided replay, with optional `seekTo`.
- `feather_session_replay_seek` jumps by time, checkpoint id, or checkpoint label, optionally resuming playback.
- `feather_session_replay_stop_playback` stops playback.
- `feather_session_replay_import` imports replay files supplied by the MCP client.
- `feather_session_replay_delete` deletes a saved replay.

Replay payloads are returned through MCP as JSON/base64 metadata. MCP does not write replay archives or files directly.

## Security

MCP access has two local servers:

- The desktop MCP bridge listens on `127.0.0.1:4005`.
- `feather mcp --transport http` listens on `127.0.0.1:4006/mcp`.

Both are localhost-only by default and token-protected. The desktop bridge rejects browser-origin requests except approved localhost origins.

Console eval remains separately gated by the existing Console plugin, `evalEnabled`, and matching `apiKey`. MCP does not bypass those gates.

`feather_send_command` is an advanced escape hatch that forwards arbitrary command objects, bypassing the review the typed tools carry, so it is **off unless you pass `--allow-raw-commands`** (or set `FEATHER_MCP_ALLOW_RAW_COMMANDS=1`). The bridge strips caller-supplied `appId`, `apiKey`, token, authorization, password, and secret fields — at any depth — before forwarding commands through the same desktop authorization path.

## Troubleshooting

### `Feather Inspector MCP access is not configured`

Session and debugger tools need Inspector. Enable **Settings → Security → MCP Access**, pass `--token`, or set `FEATHER_MCP_TOKEN`. Creative tools keep working without it while Studio runs.

### `Feather Studio is not running` / `invalid or missing Studio MCP token`

Start Feather Studio; it publishes a fresh token to `~/.feather/studio-mcp.json` at each launch. If Studio runs elsewhere, pass `--studio-url` and `--studio-token`.

### `… did not answer within N ms`

The application accepted the request but did not respond in time — it may be busy, paused in a debugger, or stuck. The game's own wait is reported separately.

### `Desktop bridge 403: MCP bridge is disabled`

Enable MCP Access in the desktop app.

### Connection refused

Start the Feather desktop app. Live-session tools require the desktop bridge.

### `No connected Feather sessions`

Start a game with `feather run path/to/game` or pass a specific `sessionId` when multiple sessions are connected.

### `creative executor is not available`

Open the Feather desktop app UI. Texture Lab and desktop-local creative workflows are executed by the React app behind the authenticated bridge.

## References

- [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18)
- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture)
- [MCP transports](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
