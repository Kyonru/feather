# Shader Graph Schema

Use this when creating, importing, exporting, or inspecting `.feathershgh` graph payloads.

## File Shape

Pass graph payloads to MCP as a JSON object with this shape:

```json
{
  "type": "feather.shader-graph",
  "version": 3,
  "exportedAt": "2026-06-20T00:00:00.000Z",
  "shaderName": "my-shader",
  "playgroundTarget": null,
  "activeTemplateInstanceId": null,
  "nodes": [],
  "edges": [],
  "subgraphs": []
}
```

`nodes` are React Flow nodes with `id`, `type: "shaderNode"`, `position`, and `data`.
`edges` connect `source`/`sourceHandle` to `target`/`targetHandle`.
`subgraphs` may be empty unless the graph uses reusable template instances.

## Minimal Root Graph

A usable fragment graph needs at least one node that outputs `vec4` and a `FragmentOutput` node:

```json
{
  "nodes": [
    {
      "id": "tex",
      "type": "shaderNode",
      "position": { "x": 0, "y": 0 },
      "data": { "label": "Texture", "nodeType": "TextureColor" }
    },
    {
      "id": "out",
      "type": "shaderNode",
      "position": { "x": 300, "y": 0 },
      "data": { "label": "Fragment Output", "nodeType": "FragmentOutput" }
    }
  ],
  "edges": [
    {
      "id": "tex-out",
      "source": "tex",
      "sourceHandle": "out",
      "target": "out",
      "targetHandle": "color"
    }
  ]
}
```

Add a `Preview` node and connect the same `vec4` output to its `color` input when the user is authoring visually.

## Node Data

Common node fields:

- `label`: human-readable node title.
- `nodeType`: one of the Shader Graph node types.
- `values`: default literal values keyed by port id.
- `uniformName`: optional parameter or texture uniform name.
- `customCode`: GLSL function source for `CustomFunction` nodes.
- `subgraphId`, `subgraphInputs`, `subgraphOutputs`: used by `SubgraphInstance`.

For literal constants, set `values.val`. For effect nodes, set defaults by input port id, for example `values: { "amp": 0.025, "freq": 28 }`.

## Parameters And Uniforms

Use parameter nodes for user-facing controls:

- `FloatParameter` -> `extern number u_<name>`
- `Vec2Parameter` -> `extern vec2 u_<name>`
- `Vec3Parameter` -> `extern vec3 u_<name>`
- `Vec4Parameter` or `ColorParameter` -> `extern vec4 u_<name>`
- `BooleanParameter` -> numeric extern converted with `step(0.5, value)`
- `TextureParameter` -> image parameter

Set `uniformName` without the `u_` prefix unless you deliberately need an exact name. The compiler sanitizes names and adds `u_` when missing.

Keep defaults in `values.val` so exported parameters are useful:

```json
{
  "id": "density",
  "type": "shaderNode",
  "position": { "x": -400, "y": 0 },
  "data": {
    "label": "Petal Density",
    "nodeType": "FloatParameter",
    "uniformName": "petal_density",
    "values": { "val": 0.75 }
  }
}
```

## Textures

Use `TextureColor` when sampling the source sprite at original UVs.
Use `SpriteTextureSample` for source sprite sampling with custom UV plus an alpha mask.
Use `SampleTexture` with `TextureInput`, `TextureParameter`, or `TextureUniformColor` when the effect needs an additional uploaded texture.

Texture uniforms need uploads before runtime preview or application. The Preview Texture only changes the source sprite; it does not satisfy independent texture slots.

## Custom Functions

`CustomFunction` nodes support one GLSL function. Supported input, return, and out parameter types are `float`, `vec2`, `vec3`, `vec4`, and `mat4`.

Rules:

- Provide one function only; no extra helper declarations after the closing brace.
- Use a return value or `out` parameters. Do not use `inout`.
- End simple statements with semicolons.
- Assign all `out` parameters.
- Keep loop bounds constant and modest for preview stability.
- Keep source self-contained; do not rely on helpers unless the code declares them inside the function body.

The node ports are inferred from the function signature:

```glsl
vec4 petal_overlay(vec4 base_color, vec2 uv, float time, vec4 tint) {
  return base_color + vec4(tint.rgb * 0.2, 0.0);
}
```

## Subgraphs

Use subgraphs for reusable node patterns with named controls. A `SubgraphInstance` references a `ShaderSubgraph` by `subgraphId`. Each subgraph defines:

- `inputs` and `outputs`: public interface ports.
- `inputMappings`: public input id to internal `SubgraphInput` output.
- `outputMappings`: public output id to internal `SubgraphOutput`.
- `nodes` and `edges`: internal graph.

For one-off MCP-created effects, a root graph with well-labeled nodes is usually enough. Use subgraphs when the effect has a reusable control surface, a preset-like structure, or multiple repeated internal stages.

## Validation Checklist

- Compile with `feather_shader_graph_compile` after import.
- Treat error diagnostics as blocking.
- Treat texture upload warnings as blocking if the graph uses extra texture slots.
- If a live session exists, run `feather_shader_graph_preview`.
- If no live session exists, export the graph and state that runtime preview was not run.
