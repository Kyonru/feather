# shader-graph

Feather plugin that validates GLSL shaders authored in the Shader Graph visual editor.

## Actions

### `compile-shader`

Attempts to compile the provided GLSL source using `love.graphics.newShader`. Returns whether each stage compiled successfully, along with the driver error string if it failed.

**Params**

| Field | Type | Description |
|-------|------|-------------|
| `pixelSource` | `string` | GLSL pixel (fragment) shader source |
| `vertexSource` | `string` | GLSL vertex shader source (optional) |

**Response**

```lua
-- success
{ status = "ok" }

-- failure
{ status = "error", pixelError = "...", vertexError = "..." }
```

`pixelError` / `vertexError` are `nil` when that stage compiled successfully.

## Notes

- Validation runs on the game process — a live LÖVE session must be connected.
- The plugin uses `pcall` so a bad shader never crashes the game.
- No draw calls are made; the shader object is discarded immediately after compilation.
