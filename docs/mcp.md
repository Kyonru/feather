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

For clients that require Streamable HTTP:

```bash
feather mcp --transport http
```

HTTP listens on `127.0.0.1:4006/mcp` by default and requires the same bearer token as the desktop bridge.

## Tokens And Options

The desktop writes MCP settings to `~/.feather/mcp.json`. The CLI resolves the bridge token in this order:

1. `--token`
2. `FEATHER_MCP_TOKEN`
3. `~/.feather/mcp.json`

Useful options:

| Option | Default | Description |
| --- | --- | --- |
| `--transport <stdio\|http>` | `stdio` | MCP transport. |
| `--host <host>` | `127.0.0.1` | HTTP host. Only localhost hosts are accepted. |
| `--port <port>` | `4006` | HTTP MCP port. |
| `--desktop-url <url>` | `http://127.0.0.1:4005` | Desktop MCP bridge URL. |
| `--token <token>` | | Bridge and HTTP bearer token. |

Example local client config:

```json
{
  "mcpServers": {
    "feather": {
      "command": "feather",
      "args": ["mcp"],
      "env": {
        "FEATHER_MCP_TOKEN": "feather-mcp-..."
      }
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
- `feather_debugger`
- `feather_console_eval`
- `feather_console`
- `feather_time_travel`
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

## Security

MCP access has two local servers:

- The desktop MCP bridge listens on `127.0.0.1:4005`.
- `feather mcp --transport http` listens on `127.0.0.1:4006/mcp`.

Both are localhost-only by default and token-protected. The desktop bridge rejects browser-origin requests except approved localhost origins.

Console eval remains separately gated by the existing Console plugin, `evalEnabled`, and matching `apiKey`. MCP does not bypass those gates.

`feather_send_command` is an advanced escape hatch. The bridge strips caller-supplied `appId`, `apiKey`, token, authorization, password, and secret fields before forwarding commands through the same desktop authorization path.

## Troubleshooting

### `MCP token is required`

Enable **Settings → Security → MCP Access**, pass `--token`, or set `FEATHER_MCP_TOKEN`.

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
