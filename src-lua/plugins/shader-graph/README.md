# Shader Graph

Feather plugin that validates GLSL shaders authored in the Shader Graph visual editor.

The desktop editor owns the graph UI and GLSL code generation. This runtime plugin only compiles the generated LÖVE shader source inside the connected game process so validation matches the user's graphics driver and LÖVE version.

## Workflow

1. Open **Shader Graph** in Feather.
2. Drag nodes from the palette onto the canvas.
3. Connect compatible ports by type.
4. Connect the final `vec4` color into **Fragment Output**.
5. Use **Validate** to compile in the running LÖVE game.
6. Use **Apply** to send the generated shader to the selected Particle System Playground emitter.
7. Export/import `.feathershgh` files when you want to save or share editable graph projects.

## Node Types

### Input

Use input nodes as the raw data source for a shader.

| Node | Output | Use |
|---|---|---|
| Texture Color | `vec4` | Current texture sample: `Texel(tex, texture_coords)` |
| Texture Coords | `vec2` | UV coordinates, usually the starting point for distortion effects |
| Screen Coords | `vec2` | Pixel/screen position, useful for screen-space patterns |
| Vertex Color | `vec4` | LÖVE color/tint passed into the shader |
| Time | `float` | Animated effects; emits `extern number u_time` |
| Resolution | `vec2` | Uses `love_ScreenSize.xy` |
| Float / Vec2 / Vec3 / Vec4 | typed constants | Editable values for colors, thresholds, speed, etc. |

### Math

Math nodes shape scalar values. They are most useful for masks, thresholds, animation curves, and mixing amounts.

- `Add`, `Subtract`, `Multiply`, `Divide`: combine scalar values.
- `Power`: sharpen or soften masks.
- `Clamp`: keep values inside a range.
- `Lerp`: interpolate between two scalar values.
- `Step`, `Smoothstep`: build hard or soft thresholds.
- `Sin`, `Cos`: oscillation for wave and pulse effects.
- `Abs`, `Fract`, `Floor`: repeating patterns, bands, pixel stepping.

### Vector

Vector nodes convert between packed colors/vectors and scalar channels.

- `Split`: split a `vec4` into RGBA floats.
- `Combine`: combine RGBA floats into a `vec4`.
- `Combine2`, `Combine3`: build `vec2` or `vec3`.
- `SplitVec2`, `SplitVec3`: unpack vector channels.
- `Normalize`, `Length`, `Dot`: vector utility operations.

### Color

Color nodes transform an existing `vec4`.

- `Desaturate`: mix a color toward grayscale.
- `One Minus`: invert a scalar mask.
- `Hue Shift`: rotate color hue.

### Noise

Noise nodes create procedural variation.

- `Simple Noise`: deterministic hash noise from UV.
- `Ripple`: UV distortion using sine waves.

### Effect

Effect nodes are higher-level building blocks for common 2D game shaders.

| Node | Use |
|---|---|
| Sample Texture | Samples the texture at a supplied UV, useful after UV distortion |
| Centered UV | Converts UV into `uv - 0.5` and distance from center |
| Fresnel / Rim 2D | Radial edge mask for glow/rim effects on sprites and particles |
| Alpha Outline | Samples neighboring alpha to create sprite outlines |
| Wave Distort | Animated UV wave for water, heat, magic, flags |
| Dissolve | Noise threshold dissolve with a colored edge |
| Hit Flash | Mixes texture color toward a flash color |
| Vignette | Darkens or fades toward UV edges |
| Pixelate | Snaps UVs to a lower-resolution grid |
| Chromatic Aberration | Splits red/blue samples away from center |

### Output

`Fragment Output` is the required final node for pixel shaders. If no color is connected, codegen falls back to `Texel(tex, texture_coords)`.

### Vertex

Vertex nodes are optional. Use them only when you need to change vertex positions.

- `Vertex Position`: original vertex position.
- `Transform Matrix`: LÖVE transform/projection matrix.
- `Mat x Vec`: matrix/vector multiplication.
- `Vertex Output`: final vertex position.

## Preset Flows

The Shader Graph page includes complete preset graphs:

- **Texture Pass**: baseline texture output.
- **Outline**: alpha outline around a sprite.
- **Wave**: animated UV distortion.
- **Dissolve**: noise dissolve with edge color.
- **Hit Flash**: damage/selection flash.
- **Rim Glow**: 2D fresnel-style edge glow.
- **Pixelate**: retro low-resolution sampling.
- **Chromatic Aberration**: RGB channel split.

Load a preset, validate it, then inspect how the nodes are connected. Presets are intended as editable starting points, not black boxes.

## Practical Tips

- Start most shaders with `Texture Coords` and `Texture Color`.
- Distort UV first, then use `Sample Texture` to read the texture at the modified UV.
- Use `Vec4Constant` for editable colors like outline, flash, and dissolve edge color.
- Use `FloatConstant` for user-tunable controls such as thickness, amount, speed, cutoff, and softness.
- Prefer `Smoothstep` over `Step` for effects that should have soft edges.
- Keep masks as `float` values until the final color mix.
- For particle shaders, preserve alpha unless you intentionally want to change particle fade behavior.
- Validate often. Some shader mistakes only appear on the active LÖVE runtime or graphics driver.

## Common Recipes

### Texture Pass

`Texture Color -> Fragment Output`

Use this as the baseline when debugging.

### UV Distortion

`Texture Coords -> Wave Distort -> Sample Texture -> Fragment Output`

Add `Time`, `FloatConstant` amplitude, frequency, and speed inputs to animate it.

### Outline

`Texture Color + Texture Coords + Float thickness + Vec4 outline color -> Alpha Outline -> Fragment Output`

Good for sprites, interactable objects, and particle silhouettes.

### Dissolve

`Texture Color + Texture Coords + cutoff + softness + edge color -> Dissolve -> Fragment Output`

Animate the cutoff value externally or edit it in the graph while prototyping.

### Rim Glow

`Texture Coords -> Fresnel / Rim 2D -> Hit Flash amount`

Feed texture color and a glow color into `Hit Flash`.

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
- When vertex source is provided, validation compiles the combined pixel + vertex source because Feather applies shader graph output as a single LÖVE shader source.
