---
name: feather-plugin-iteration
description: Use when an agent should inspect, configure, enable, or invoke Feather built-in or live-session plugin behavior through MCP.
---

# Feather Plugin Iteration

## Workflow

1. Inspect the catalog:
   - Use `feather_list_plugins`, `feather_get_plugin`, `feather://plugins/catalog`, or `feather://plugins/{pluginId}`.
2. Inspect live state:
   - Use `feather_get_live_plugin_state` or `feather://sessions/{id}/plugins/{pluginId}`.
3. Refresh and act:
   - Use `feather_refresh_plugin` before diagnosing stale payloads.
   - Use `feather_plugin_action` for explicit actions.
   - Use `feather_plugin_params` for runtime parameters.
   - Use `feather_plugin_set_enabled` only when the plugin is safe and the user intent is clear.
4. Prefer plugin-specific tools:
   - Shader Graph, Particle Playground, Texture Lab, Session Replay, Console, and Time Travel have dedicated MCP tools. Use those before generic plugin actions.

## Limits

Do not install, update, or remove plugins through MCP. Use `feather plugin install`, `feather plugin update`, and `feather plugin remove` for project file changes.
