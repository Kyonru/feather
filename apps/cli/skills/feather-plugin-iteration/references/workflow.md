# Plugin Iteration Workflow

Use this when inspecting, configuring, enabling, or invoking Feather built-in or live-session plugin behavior.

## Catalog First

Inspect catalog metadata before acting:

- Plugin id, name, source directory, description, version.
- Capabilities and safety posture.
- Whether the plugin is disabled or opt-in.
- Known MCP actions and notes.

Use `feather_get_plugin` for a specific plugin and `feather_list_plugins` for discovery.

## Live State

- Read live plugin state before sending actions.
- Refresh plugin payloads when stale or after an action.
- Compare catalog capabilities to live config before assuming a feature is available.
- If no session exists, limit work to catalog metadata and local project files.

## Action Safety

- Prefer dedicated tools for Shader Graph, Particle Playground, Texture Lab, Session Replay, Console, and Time Travel.
- Use generic `feather_plugin_action` only for plugin actions without dedicated tools.
- Use `feather_plugin_params` for runtime parameters, not project-file changes.
- Enable/disable plugins only when user intent is clear and the plugin is safe for the current session.

## Limits

MCP plugin iteration does not install, update, or remove project plugins. Use CLI plugin commands for project mutations.

## Output

Report plugin id, catalog state, live state freshness, action taken, response summary, and any safety limit or missing session.
