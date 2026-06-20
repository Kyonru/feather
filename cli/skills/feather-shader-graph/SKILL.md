---
name: feather-shader-graph
description: Use when an agent should create, compile, preview, import, export, or iterate Love2D shaders through Feather MCP Shader Graph tools.
---

# Feather Shader Graph

## Workflow

1. Read the current graph:
   - Use `feather_shader_graph_snapshot` or `feather://creative/shader-graph`.
2. Create or modify deliberately:
   - Use high-level creation tools when available, then import with `feather_shader_graph_import`.
   - Keep uniforms, texture slots, and generated GLSL/Love2D shader code explicit.
3. Validate:
   - Use `feather_shader_graph_compile` for diagnostics.
   - Use `feather_shader_graph_preview` for runtime-backed previews when a session is connected.
4. Export:
   - Use `feather_shader_graph_export` and return code or base64 preview metadata to the user.
   - Do not write shader files unless the user asked for a file edit.

## Runtime Notes

If preview needs a game session, route through the `shader-graph` plugin action and wait for the plugin response. If no session is connected, produce a local graph/export and clearly state preview was not run.
