# Shader Graph

Feather plugin that validates GLSL shaders authored in the Shader Graph visual editor.

The desktop editor owns the graph UI and GLSL code generation. This runtime plugin only compiles the generated LÖVE shader source inside the connected game process so validation matches the user's graphics driver and LÖVE version.

The node library is inspired by common visual shader graph systems, including Unity Shader Graph's category model: Artistic, Channel, Input, Math, Procedural, Utility, and UV. Feather's implementation is intentionally smaller and LÖVE-focused.

Several higher-level nodes and presets are also inspired by common VFX Shader Graph recipes, including texture strength, opacity, dissolve masks, water displacement, fake 2.5D sprite cards, and vertex displacement. Feather includes both a self-contained procedural water preset and a texture-noise water preset that uses an uploaded color noise texture. Unity-specific camera depth effects are not copied directly because LÖVE 2D shaders do not expose Unity's scene depth buffer in the same way.

## Workflow

1. Open **Shader Graph** in Feather.
2. On first open, Feather loads the **Water Shimmer** template so there is a complete graph ready to tune, validate, edit, and apply.
3. Drag nodes from the palette onto the canvas. Common sections, including Fake 3D, stay open by default, while specialized sections such as Complex, Quaternion, Pattern, Pixel Perfect, Vertex, and SDF start collapsed so the palette is easier to scan.
4. Connect compatible ports by type.
5. Connect the final `vec4` color into **Fragment Output**.
6. Use **Custom Function** when a graph needs a small hand-written GLSL function. Function parameters become input ports; the return value and `out` parameters become output ports.
7. Insert **Preview** nodes between `vec4` effects when you want an inline love.js probe that shows the RGBA result up to that point while still passing the color downstream.
8. Use the right panel tabs while authoring: **Controls** for Template Controls and root Parameter nodes, **Selection** for the selected node or edge inspector, and **Output** for diagnostics, generated GLSL, validation, preview, and apply actions. Selecting a node opens **Selection** automatically. Use the canvas toolbar or press Space to switch empty-canvas drags between select-box mode and pan mode.
9. Check **Graph Diagnostics** on the Output tab before validating. Blocking diagnostics catch missing outputs, stale connections, invalid custom functions, missing textures, and subgraph reference cycles locally.
10. Use **Validate** to compile in the running LÖVE game after local diagnostics are clear.
11. Toggle **Preview On** to draw the shader on a temporary circle, line, or rectangle in the center of the running game when you are not ready to apply it to particles. Upload a preview texture when the shader should run against a real sprite instead of a generated shape. While preview is enabled, graph edits, shape changes, preview color changes, and uploaded texture changes re-apply automatically through a throttled live preview so the attached game stays responsive. Leaving the Shader Graph page, switching sessions, or turning Preview Off clears the connected-game overlay so it does not keep drawing in the background.
12. Use **Apply** to send the generated shader to the selected Particle System Playground emitter.
13. Export/import `.feathershgh` files when you want to save or share editable graph projects. New template graphs export as version 3 files; older version 1/2 graphs still import as plain editable graphs.

Select a node and edit **Node Name** in the inspector when a graph needs more descriptive labels. Renaming a node changes the canvas label only; the original node type stays visible in the inspector and code generation is unchanged.

## Node Palette

Palette sections are collapsible and remember their open/closed state across app restarts. Use **Expand all** or **Collapse all** when browsing the full library. Search matches node labels, node ids, and category names; matching categories open while the search is active, then return to the saved collapsed state when the search is cleared.

## Right Panel Controls

The right panel starts on **Controls** so an effect can be tuned without hunting through the graph. Template presets show their curated **Template Controls** first, followed by **Shader Controls**, which collects root-level `FloatParameter`, `Vec2Parameter`, `Vec3Parameter`, `Vec4Parameter`, `ColorParameter`, `BooleanParameter`, and `TextureParameter` nodes in one place.

Shader Controls let you rename the exposed control, edit its default value or texture upload, inspect the generated uniform name, and jump back to the source node. Unconnected parameters stay visible with a small warning so reusable knobs are easy to find before they are wired. When editing inside a subgraph, Shader Controls still show root graph parameters; using a row's select action returns to the root graph and selects that parameter node.

## Template Presets And Subgraphs

Preset loading now keeps the root canvas clean. **Load preset** replaces the current graph with source nodes, one reusable **Subgraph** instance, and the final output node. **Insert preset** drops the same reusable instance into the current graph without expanding every internal node onto the root canvas.

Select the preset Subgraph instance to use **Template Controls** in the inspector. These controls are just the subgraph's public inputs: common knobs such as strength, speed, color, scale, threshold, and softness update the Subgraph node's disconnected input defaults. Source ports such as Source Color, UV, and Time stay wired on the root canvas. Texture slots, such as the Texture Noise Water noise texture, are backed by root texture input nodes and use the same texture upload path as normal Shader Graph texture nodes.

Double-click a Subgraph instance to enter it. Template subgraphs use explicit boundary nodes:

- **Subgraph Input** defines a public input port with a type, label, default value, optional min/max/step, and a role of source, control, or texture.
- **Subgraph Output** exposes one internal value as a public output.

Boundary nodes only appear in the palette while editing inside a subgraph. Root-level boundary nodes are diagnostics because they do not make sense outside a subgraph. Template diagnostics also report missing explicit outputs and disconnected Subgraph Output nodes before GLSL validation.

## Diagnostics

The editor runs a local diagnostics pass on every graph edit and after importing `.feathershgh` files. Errors block preview and apply because the generated shader would be misleading or incomplete; warnings describe defaults that still compile, such as an unconnected `Fragment Output` color falling back to the source texture. Click a diagnostic with a node target to select that node in the inspector.

Runtime validation is still the final compiler check. Driver-specific GLSL errors remain grouped by pixel and vertex stage, with the raw error text available to copy from the GLSL panel.

## Node Types

### Debug

Use **Preview** as an inline RGBA probe while building effect chains. It accepts a `vec4`, outputs the same `vec4`, and is safe to place between color/effect nodes because production GLSL treats it as a pass-through. The selected Preview node renders the graph up to that point inside the node with a lightweight WebGL preview target; other Preview nodes stay paused so large graphs do not run multiple preview runtimes at once. Embedded previews keep uploaded source and uniform textures inline, use a stable 16:9 aspect ratio, and preserve texture proportions while zooming. Use the node's game-preview button to send that same probe shader to a connected LÖVE game for runtime truth; game sends are deduped and throttled to about two updates per second, and the runtime overlay caches shader/drawable work while drawing a capped preview canvas. A disconnected Preview node shows a fallback until its RGBA input is connected.

### Showcase development

`npm run dev`, Tauri dev, and `npm run showcase:dev` serve the same real love.js preview target from `.showcase-dev/showcase-lovejs` when a love.js player is available. The helper builds a fresh `showcase.love` bundle from the standalone preview example plus the shared Shader Graph preview runtime for the main preview frame, and also writes a dedicated `/showcase-lovejs/webgl.html` target for inline Preview nodes so texture-heavy probes do not depend on love.js payload polling.

If the love.js player is not already available, the dev server looks at `SHOWCASE_LOVEJS_DIR`, `vendor/love.js`, and `.showcase-vendor/love.js`, then attempts to clone `https://github.com/2dengine/love.js`. Set `SHOWCASE_LOVEJS_SKIP_FETCH=1` when working offline and provide `SHOWCASE_LOVEJS_DIR` manually. If no real player is available, Feather falls back to the lightweight `public/showcase-lovejs` bridge.

### Custom

Use **Custom Function** for small GLSL snippets that are easier to express as code than as node chains.

```glsl
vec4 custom_tint(vec4 color, float strength) {
  return vec4(color.rgb * strength, color.a);
}
```

The editor parses the function signature in the node modal. Regular parameters become inputs, a non-`void` return value becomes a `Result` output, and `out` parameters become additional outputs:

```glsl
void custom_mask(vec2 uv, out float mask, out vec4 color) {
  mask = smoothstep(0.45, 0.5, length(uv - vec2(0.5)));
  color = vec4(vec3(mask), 1.0);
}
```

Keep custom functions self-contained and pass values in through ports. The node validates the signature and braces before saving, then the final shader should still be compiled with **Validate** against the connected LÖVE runtime.

### Input

Use input nodes as the raw data source for a shader.

| Node                       | Output          | Use                                                                                      |
| -------------------------- | --------------- | ---------------------------------------------------------------------------------------- |
| Texture Color              | `vec4`          | Current texture sample: `Texel(tex, texture_coords)`                                     |
| Texture Input              | `Image`         | Uploaded auxiliary texture uniform; add one node per extra texture                       |
| Texture Uniform Color      | `vec4`          | Compatibility helper that samples an uploaded auxiliary `Image` uniform at a supplied UV |
| Texture Coords             | `vec2`          | UV coordinates, usually the starting point for distortion effects                        |
| Screen Coords              | `vec2`          | Pixel/screen position, useful for screen-space patterns                                  |
| Vertex Color               | `vec4`          | LÖVE color/tint passed into the shader                                                   |
| Time                       | `float`         | Animated effects; emits `extern highp number u_time`                                     |
| Resolution                 | `vec2`          | Uses `love_ScreenSize.xy`                                                                |
| Float / Vec2 / Vec3 / Vec4 | typed constants | Editable values for colors, thresholds, speed, etc.                                      |

### Math

Math nodes shape scalar values. They are most useful for masks, thresholds, animation curves, and mixing amounts.

- `Add`, `Subtract`, `Multiply`, `Divide`: combine scalar values.
- `Power`: sharpen or soften masks.
- `Clamp`: keep values inside a range.
- `Lerp`: interpolate between two scalar values.
- `Step`, `Smoothstep`: build hard or soft thresholds.
- `Sin`, `Cos`: oscillation for wave and pulse effects.
- `Abs`, `Fract`, `Floor`: repeating patterns, bands, pixel stepping.
- `Min`, `Max`, `Modulo`, `Negate`, `Saturate`: scalar shaping and bounds.
- `Remap`: convert one scalar range into another, useful for mask tuning.

### Complex

Complex nodes treat a `vec2` as a complex number, where `x` is the real component and `y` is the imaginary component. They are useful for procedural UV warps, conformal-style transforms, spirals, inversions, and math-driven pattern generation.

- `Complex Conjugate`: outputs `(x, -y)`.
- `Complex Reciprocal`: outputs `1 / A`.
- `Complex Multiply`: multiplies two complex values.
- `Complex Divide`: divides one complex value by another.
- `Complex Exp`: complex exponential.
- `Complex Log`: complex logarithm.
- `Complex Power`: raises one complex value to another.

### Quaternion

Quaternion nodes treat a `vec4` as a quaternion, where `xyz` is the vector component and `w` is the scalar component. They are useful for building orientation math, rotating 3D vectors, and driving procedural 2D UV rotation through a Z-axis quaternion.

- `Quaternion Inverse`: inverse/conjugate for undoing a rotation.
- `Quaternion From Euler`: builds a quaternion from Euler angles in degrees.
- `Quaternion From Angle Axis`: builds a quaternion from an angle in degrees and an axis vector.
- `Quaternion To Angle Axis`: extracts angle and axis values from a quaternion.
- `Quaternion From To Rotation`: builds the rotation from one direction vector to another.
- `Quaternion Multiply`: combines two quaternion rotations.
- `Quaternion Rotate Vector`: rotates a `vec3` by a quaternion.
- `Quaternion Slerp`: spherical interpolation between two quaternions.

### Symmetry

Symmetry nodes fold or tile UV coordinates before sampling. They are useful for kaleidoscope effects, mirrored sprites, repeating motifs, procedural tiles, and compact pattern authoring.

- `Reflection Symmetry`: mirrors UVs across a line defined by position and direction, with optional glide offset.
- `Rotation Symmetry`: folds UVs into radial sectors around a position. `Order` controls the number of repeated sectors.
- `Tiling Symmetry`: maps UVs into local tile coordinates and also outputs cell index and cell position. `Mode` is stepped from `0` to `3`: `0` Square, `1` Hexagon, `2` Triangle, `3` Herringbone.

### Random

Random nodes generate deterministic pseudo-random values from a `vec2` seed. They are useful when combined with tile indices, screen positions, UV cells, or other stable values.

- `Random Integer Range`: deterministic integer-like float between `Min` and `Max`.
- `Random Circle`: random point inside or on a unit circle. `Mode` is stepped from `0` to `1`: `0` In, `1` On.
- `Random Sphere`: random point inside or on a unit sphere. `Mode` is stepped from `0` to `1`: `0` In, `1` On.
- `Random Rotation`: random quaternion rotation.
- `Random Color`: random HSV color within editable min/max HSV ranges; outputs both RGB and HSV.

### Vector

Vector nodes convert between packed colors/vectors and scalar channels.

- `Split Vec4`: split a `vec4` into RGBA floats.
- `Combine4`: combine RGBA floats into a `vec4`.
- `Split RGB` / `Combine RGB`: unpack and repack `vec3` values.
- `Combine2`, `Combine3`: build `vec2` or `vec3`.
- `SplitVec2`, `SplitVec3`: unpack vector channels.
- `Swizzle Vec2`: get `xy` and `yx` variants.
- `Normalize`, `Length`, `Dot`: `vec4` RGB utility operations.
- `Distance Vec2`, `Length Vec2`, `Normalize Vec2`, `Dot Vec2`: UV/vector math for 2D masks.
- `Add`, `Subtract`, `Multiply`, and `Divide` variants for `vec2`, `vec3`, and `vec4`: component-wise vector math.
- `Scale Vec2`, `Scale Vec3`, `Scale Vec4`: multiply a vector by a scalar.

### Color

Color nodes transform an existing `vec4`.

- `Desaturate`: mix a color toward grayscale.
- `One Minus`: invert a scalar mask.
- `Hue Shift`: rotate color hue.
- `Invert Color`: invert RGB by an editable amount.
- `Contrast`: adjust contrast around 0.5.
- `Posterize`: reduce colors to a fixed number of bands.
- `Multiply Color`: multiply two `vec4` values.
- `Lab Convert`: converts a `vec4` between RGB, Lab, and LCH. `From` and `To` use `0` RGB, `1` Lab, `2` LCH.
- `Lab Complementary`: returns the perceptual complementary color by flipping the Lab `a` and `b` axes.
- `Lab Split Scheme`: outputs two colors offset around the LCH hue circle by an editable angle.
- `Lab Dual Scheme`: outputs a rectangle/tetradic color scheme from the source color and angle.

### Composite

Composite nodes combine colors and masks so beginners can layer effects without rebuilding common shader math.

- `Composite`: combines color `A` and color `B`. `Mode` is stepped from `0` to `4`: `0` Over, `1` In, `2` Out, `3` Atop, `4` Xor.
- `Effect Mix`: mixes a base color and effect color by a mask and opacity.
- `Alpha Mask`: turns sprite alpha into a soft mask and an optionally masked color.
- `Luma Mask`: turns perceived brightness into a soft mask.
- `Mask Range`: isolates a scalar range with soft edges.
- `Color Key Mask`: selects pixels close to a target color with tolerance/softness controls, returning both a mask and masked RGBA.
- `Palette Swap`: remaps one to three source colors to replacement colors using pair count, tolerance, softness, and strength controls, returning swapped RGBA and a match mask.
- `Gradient Map`: maps a mask/noise value between two colors.
- `Mask Combine`: outputs common mask combinations such as multiply, add, max, min, and subtract.
- `Blend Modes`: outputs normal, multiply, screen, overlay, add, and difference blends from the same inputs.
- `Color Ramp`: maps a value through low, middle, and high colors.

For a simple composition flow, connect `Texture Color -> Luma Mask -> Gradient Map`, then feed the original texture and mapped color into `Effect Mix` before `Fragment Output`.

### Noise

Noise nodes create procedural variation.

- `Simple Noise`: deterministic hash noise from UV.
- `Truchet Tiles`: procedural Truchet tiling with square, triangle, and hex layout modes; supports randomized rotation, reflection, and optional time-based scrolling; outputs tile UV, tile index, and a line mask.
- `Ripple`: UV distortion using sine waves.
- `Voronoi Cells`: cellular mask for sparks, shields, energy, and organic breakup.
- `Checkerboard`: alternating square mask.

### Pattern

Pattern nodes create anti-aliased geometric masks from UVs.

- `Zig Zag`: stripe mask bent into triangular zig zags.
- `Sine Waves`: stripe mask following sine waves.
- `Round Waves`: stripe mask made from arc segments.
- `Dots`: repeating dot grid with row offset and radius controls.
- `Spiral`: Archimedean spiral mask.
- `Whirl`: radial stripe mask twisted around the center.

### Halftone

Halftone nodes create print-style dot patterns from grayscale or RGB input.

- `Halftone Mono`: converts a scalar base value into a halftone mask.
- `Halftone Color`: applies separate red, green, and blue halftone screens. `Mode` is stepped from `0` to `2`: `0` Circle, `1` Smooth, `2` Square.
  `Scale` controls dot density: higher values make smaller, denser dots; lower values make larger, more separated dots.

### Pixel Perfect

Pixel Perfect nodes create derivative-based one-pixel primitive masks. They are useful for crisp procedural guides, outlines, reticles, scan marks, debug overlays, and pixel-art effects. Use `Pixelate` when you want chunky texture sampling; use these nodes when you want exact single-pixel marks.

- `Pixel Point`: one-pixel mask at a UV position.
- `Pixel Point Grid`: repeating one-pixel point grid.
- `Pixel Ray`: one-pixel infinite ray.
- `Pixel Rays`: repeated parallel one-pixel rays.
- `Pixel Line`: one-pixel line segment between two UV points.
- `Pixel Lines`: repeated one-pixel line segments.
- `Pixel Circle`: one-pixel circular outline.
- `Pixel Polygon`: one-pixel regular polygon outline.

### UV

UV nodes transform texture coordinates before sampling.

- `Tiling And Offset`: scale and offset UVs.
- `Rotate UV`: rotate UVs around the center.
- `Twirl UV`: swirl UVs toward the center.
- `Polar Coordinates`: convert UVs into radius/angle space.

### Fake 3D

Fake 3D nodes create 2.5D sprite illusions without generating mesh geometry. They work by warping UVs, sampling the current sprite texture at those warped coordinates, and layering simple depth, shadow, and packed-atlas tricks. Use them for tilted cards, parallax sprites, chunky stacked-sprite looks, and pseudo 3D Sprite-style effect experiments that still need to run as regular LÖVE shaders.

- `Sprite Texture Sample`: samples LÖVE's current sprite texture `tex` at a custom UV and masks alpha, which makes it the usual sampler after `Billboard UV` or `Parallax UV`.
- `Billboard UV`: projects regular sprite UVs into a tilted card; outputs the projected UV, an inside mask, and a 0-1 depth value.
- `Parallax UV`: offsets UVs by a height or mask value and a view direction.
- `Fake Depth Shade`: shades a color from a depth value using screen derivatives, a simple light direction, ambient light, and rim strength.
- `Billboard Shadow`: creates a soft rectangular card shadow that can be composited behind a tilted sprite.
- `Atlas Slice UV`: maps local UVs into one slice of a packed atlas; slices are laid out left-to-right, top-to-bottom.
- `Stacked Sprite Sample`: composites up to 16 packed atlas slices back-to-front and outputs RGBA, mask, and depth. Keep the `Layers` value at or below the real number of atlas slices; extra slices are clamped for preview and game performance.

For a simple fake card, connect `Texture Coords -> Billboard UV -> Sprite Texture Sample -> Fake Depth Shade`, then composite `Billboard Shadow` behind the shaded sprite before `Fragment Output`. For stacked sprites, upload a packed atlas with `Texture Input`, connect it to `Stacked Sprite Sample`, and set `Columns`, `Rows`, and `Layers` to match the atlas layout.

### SDF

Signed distance field nodes create crisp procedural shape masks from UVs. Feather's SDF set follows the common primitive/sample/boolean structure used by Shader Graph SDF node collections.

**Primitives**

- `SDF Line`: vertical line mask with position and width controls.
- `SDF Circle`: circle centered at a position with a radius.
- `SDF Rectangle`: rectangle centered at a position with width, height, and corner radius.
- `SDF Polygon`: regular polygon with position, radius, side count, and corner radius.

**Sampling**

- `SDF Sample`: converts an SDF value into an anti-aliased filled mask.
- `SDF Sample Strip`: converts a distance range into an anti-aliased outline/ring mask.

**Booleans**

- `SDF Boolean`: outputs hard union, intersection, and difference.
- `SDF Soft Boolean`: outputs smoothed union, intersection, and difference with a smoothing control.

SDF primitives include centered defaults, so a newly dropped circle, rectangle, polygon, or sampled strip produces a visible shape before every input is wired manually.

### Effect

Effect nodes are higher-level building blocks for common 2D game shaders.

| Node                 | Use                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------ |
| Sample Texture       | Samples the texture at a supplied UV, useful after UV distortion                                       |
| Texture Strength     | Sharpens texture alpha and boosts color intensity, useful for cracks, glows, and impact marks          |
| Opacity              | Multiplies texture alpha by a scalar fade value                                                        |
| Centered UV          | Converts UV into `uv - 0.5` and distance from center                                                   |
| Fresnel / Rim 2D     | Radial edge mask for glow/rim effects on sprites and particles                                         |
| Sprite Outline       | Samples neighboring alpha around the current sprite to create a configurable outline color             |
| Wave Distort         | Animated UV wave for water, heat, magic, flags                                                         |
| Water Displace       | Procedural animated noise displacement for water, heat shimmer, and magic surfaces                     |
| Masked Water         | Water displacement constrained by texture alpha, useful when only opaque regions should move           |
| Water Noise UV     | Scrolls tiled noise UVs using sprite width, noise width, speed, and time                              |
| Water Displace V2  | Displaces UVs from RGB noise texture channels                                                         |
| Dissolve             | Noise threshold dissolve with a colored edge                                                           |
| Hit Flash            | Mixes texture color toward a flash color                                                               |
| Vignette             | Darkens or fades toward UV edges                                                                       |
| Pixelate             | Snaps UVs to a lower-resolution grid                                                                   |
| Chromatic Aberration | Splits red/blue samples away from an adjustable center offset                                          |

### Output

`Fragment Output` is the required final node for pixel shaders. If no color is connected, codegen falls back to `Texel(tex, texture_coords)`.

### Vertex

Vertex nodes are optional. Use them only when you need to change vertex positions.

- `Vertex Position`: original vertex position.
- `Vertex Wave 2D`: offsets vertex XY positions with a time-driven sine/cosine wave.
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
- **Pixel Perfect Circle**: one-pixel circular ink line over the source texture.
- **Chromatic Aberration**: RGB channel split with an editable center offset.
- **Alpha Composite**: Porter-Duff compositing between overlapping procedural shapes.
- **Lab Complementary**: perceptual complementary color mix using Lab/LCH color space.
- **Posterize**: toon/retro color bands.
- **Halftone Dots**: comic-print treatment with posterized color, RGB dot screens, warm paper tint, and vignette.
- **Twirl Portal**: centered UV swirl.
- **Complex Power Warp**: bends centered UVs with complex-number power math.
- **Rotating Texture**: time-driven UV rotation.
- **Quaternion UV Rotate**: rotates centered UVs through a generated Z-axis quaternion.
- **Symmetry Kaleidoscope**: folds UVs through rotation and reflection symmetry before sampling.
- **Random Color Tiles**: uses tile cell indices as stable random seeds for deterministic HSV colors.
- **Checker Flash**: checker mask mixed into a flash color.
- **Pattern Whirl**: radial procedural whirl mask mixed into the texture.
- **Voronoi Energy**: cellular energy/shield mask.
- **Truchet Tiles**: animated procedural randomized arc tiles mixed into the texture.
- **Tiled Offset**: tiled UV sampling.
- **Texture Strength**: alpha/intensity shaping for marks, cracks, and glows.
- **Opacity Fade**: straightforward alpha fade control.
- **Vertex Wave**: vertex-stage wobble with a normal texture pass.
- **Water Shimmer**: self-contained procedural UV displacement.
- **Texture Noise Water**: texture-noise water shader with uploaded `water.png` as the preview texture and uploaded `simplex-noise-64.png` bound to `simplex`.
- **SDF Circle Mask**: soft procedural circle clip.
- **SDF Rounded Rectangle**: rounded rectangle clip using an SDF primitive.
- **SDF Ring Glow**: procedural ring highlight using SDF strip sampling.
- **SDF Hex Badge**: visibly clips the texture with a smaller regular polygon mask.
- **SDF Crescent**: difference of two circle fields.
- **Masked Water Shimmer**: alpha-constrained displacement that keeps transparent edges stable.

Load a preset, tune its Template Controls, validate it, then double-click the Subgraph if you want to inspect or edit the full internal graph. Presets are intended as editable starting points, not black boxes.

## Practical Tips

- Start most shaders with `Texture Coords` and `Texture Color`.
- Distort UV first, then use `Sample Texture` to read the texture at the modified UV.
- Use `ColorParameter`, `FloatParameter`, and the other Parameter nodes for effect knobs that should appear in Shader Controls.
- Use `Vec4Constant` and `FloatConstant` for internal values that are part of the graph recipe rather than public controls.
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

### Water Shimmer

`Texture Coords + Time + speed + amplitude + scale -> Water Displace -> Sample Texture -> Fragment Output`

This is the self-contained version of the classic LÖVE water displacement pattern: scroll noise, convert it into an XY offset, then sample the texture at the displaced UV. Use low amplitude values such as `0.01` to `0.04`; texture-space displacement gets strong quickly.

### Texture Noise Water

Load the **Texture Noise Water** preset to reproduce a texture-noise water shader. Upload `water.png` as the preview texture, then upload `simplex-noise-64.png` for the `simplex` texture uniform. The graph follows this structure:

`Texture Coords + Time + Noise Width + Sprite Width + Speed -> Water Noise UV -> Texture Input(simplex) -> Sample Texture -> Water Displace V2 -> Sample Texture -> Fragment Output`

This preset is based on Alex J. Griffith's LÖVE water shader post: [alexjgriffith.com/3.html](https://alexjgriffith.com/3.html). Feather keeps the node and preset names generic, while preserving the article's `water.png` plus `simplex-noise-64.png` texture-noise approach.

The original `simplex-noise-64.png` is a color noise texture, so Feather samples it through a `Texture Input` node instead of trying to replace it with scalar procedural noise. That keeps the red, green, and blue channel displacement behavior intact, and the same pattern works for future multi-texture shaders.

### Masked Water

`Texture Color + Texture Coords + Time + speed + amplitude + scale + mask threshold -> Masked Water -> Fragment Output`

The masked version only uses the displaced sample when both the current pixel alpha and displaced source alpha are above the threshold. It is useful for water tiles, shoreline sprites, and particle textures where transparent edges should not smear.

### UV Transform

`Texture Coords -> Rotate UV/Twirl UV/Tiling And Offset -> Sample Texture -> Fragment Output`

Use this for portals, rotating particles, scrolling texture strips, and tiled materials.

### Outline

`Texture Color + Texture Coords + Float thickness + Vec4 outline color -> Sprite Outline -> Fragment Output`

Good for sprites, interactable objects, and particle silhouettes. The outline node paints transparent pixels adjacent to sprite alpha, so the original sprite remains unchanged while the outline color fills the silhouette edge.

### Dissolve

`Texture Color + Texture Coords + cutoff + softness + edge color -> Dissolve -> Fragment Output`

Animate the cutoff value externally or edit it in the graph while prototyping.

### Texture Strength

`Texture Color + Power + Strength -> Texture Strength -> Fragment Output`

Use `Power` to make alpha thinner or wider and `Strength` to brighten the visible color. This is useful for impact decals, ground cracks, soft glows, and particle textures where you want to tune intensity without editing the source image.

### Opacity

`Texture Color + Opacity -> Opacity -> Fragment Output`

Keep this near the end of a graph when you want a simple overall fade.

### Vertex Wave

`Vertex Position + Time + amplitude + frequency -> Vertex Wave 2D -> Vertex Output`

Pair it with a normal fragment path such as `Texture Color -> Fragment Output`. Vertex Output expects local/object-space vertex positions; Shader Graph applies LÖVE's `transform_projection` matrix automatically. It works best on sprites or meshes with enough vertices to show deformation; a single quad will wobble at its corners.

### Rim Glow

`Texture Coords -> Fresnel / Rim 2D -> Hit Flash amount`

Feed texture color and a glow color into `Hit Flash`.

### Procedural Mask Mix

`Texture Coords -> Checkerboard/Voronoi Cells -> Hit Flash amount`

Feed texture color and a highlight color into `Hit Flash`. This is a quick way to prototype shield, scan, grid, glitch, or energy effects.

### Truchet Tiles

`Texture Coords + tile size + mode + seed + line width + time + scroll speed -> Truchet Tiles mask -> Hit Flash amount`

The Truchet node creates randomized procedural tiles. `Tile Mode` follows the source-style Truchet layout options: `0` square, `1` triangle, `2` hexagon. The default preset stays on `0` because that is the classic quarter-circle Truchet pattern shown in most references. The preset wires `Time` and a `Scroll Speed` vector so the pattern moves over time. It also outputs per-tile UVs and a tile index for more advanced procedural recipes, but the `Mask` output is the fastest path for visible arc patterns.

### Chromatic Aberration

`Texture Coords + amount + center offset -> Chromatic Aberration -> Fragment Output`

The offset input shifts the split center from `vec2(0.5)`. Use small values such as `vec2(0.08, 0.0)` to bias the red/blue separation toward one side of a sprite or screen effect.

### About Depth Fade

Depth fade is a useful Unity particle technique for softening intersections against scene geometry. Feather does not include a depth fade node yet because LÖVE's standard 2D shader path does not provide the same camera depth texture. For now, approximate soft edges with texture alpha, `Opacity`, `Vignette`, dissolve masks, or custom game-provided shader uniforms.

## Actions

### `compile-shader`

Attempts to compile the provided GLSL source using `love.graphics.newShader`. Returns whether each stage compiled successfully, along with the driver error string if it failed.

**Params**

| Field          | Type     | Description                          |
| -------------- | -------- | ------------------------------------ |
| `pixelSource`  | `string` | GLSL pixel (fragment) shader source  |
| `vertexSource` | `string` | GLSL vertex shader source (optional) |

**Response**

```lua
-- success
{ status = "ok" }

-- failure
{ status = "error", pixelError = "...", vertexError = "..." }
```

`pixelError` / `vertexError` are `nil` when that stage compiled successfully.

### `preview-shader`

Compiles the provided GLSL source, creates a temporary padded shape texture, and draws it in-game with the shader until preview is cleared. Repeated identical preview payloads reuse cached shader, drawable, texture, and parameter state; the overlay renders through a capped preview canvas so live authoring does not monopolize the attached game's frame time. This is useful for sprite shaders, especially outline graphs, before applying the shader to a Particle System Playground emitter.

**Params**

| Field          | Type       | Description                                                      |
| -------------- | ---------- | ---------------------------------------------------------------- |
| `pixelSource`  | `string`   | GLSL pixel (fragment) shader source                              |
| `vertexSource` | `string`   | GLSL vertex shader source (optional)                             |
| `shape`        | `string`   | `circle`, `line`, or `rectangle`; defaults to `circle`           |
| `color`        | `number[]` | Preview element RGBA color, normalized `0..1`; defaults to white |
| `size`         | `number`   | Temporary texture size in pixels; defaults to `128`              |
| `previewKey`   | `string`   | Optional client-computed cache key for deduping live preview work |

**Response**

```lua
-- success
{ status = "ok", shape = "circle", color = { 1, 1, 1, 1 } }

-- failure
{ status = "error", pixelError = "...", vertexError = "..." }
```

### `clear-preview`

Clears the active temporary shader preview.

## Notes

- Validation runs on the game process — a live LÖVE session must be connected.
- The plugin uses `pcall` so a bad shader never crashes the game.
- Validation discards shader objects immediately; previews keep cached shader, drawable, texture, and capped canvas state only for the preview window.
- Preview and apply are disabled while blocking graph diagnostics are present.
- When vertex source is provided, validation compiles the combined pixel + vertex source because Feather applies shader graph output as a single LÖVE shader source.
- Runtime preview is drawn by the Shader Graph plugin itself, so it does not require a Particle System Playground target.
- Shader graph input definitions may provide `defaultValue`, `min`, `max`, and `step` metadata; the inspector uses those values for disconnected input editors.
