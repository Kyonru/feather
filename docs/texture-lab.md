# Texture Lab

Texture Lab generates small procedural PNG textures for Feather's creative tools. It is meant for effect sprites and masks, not full image editing.

Open **Texture Lab** from the Creative sidebar group, Command Center, or the standalone showcase. It works without a connected game because generation happens in the browser with deterministic TypeScript/ImageData helpers.

## What To Generate

Texture Lab includes focused generators for common LÖVE effects:

- **Particle sprites**: soft circles, sparks, streaks, rings, smoke puffs, stars, trail blobs, and rain slashes.
- **Masks**: circles, ellipses, rounded rectangles, radial masks, thresholded noise masks, and image-to-mask conversion.
- **SDF and glow**: circle and ring distance fields, soft outlines, inner/outer glow masks, and editable spline distance strokes.
- **Noise and maps**: clouds, cellular spots, dissolve noise, water noise, height-style grayscale maps, and directional gradients.
- **Shader maps**: height-derived normal maps, flow maps, radial swirl flow, water ripple normals, and directional distortion maps.
- **Pixel patterns**: checkers, dithers, scanlines, and palette ramps.
- **Shapes and polygons**: layered polygons, stars, rings, spline strokes, dots, and seeded repeat/scatter patterns.
- **Spline paths**: editable trails, ribbons, stroke masks, and lightning paths.

Choosing a generator or spline path preset loads that preset's default controls. Use the shared controls to adjust dimensions, seed, softness, falloff, contrast, threshold, scale, distortion, tileability, pixelated preview, alpha mode, and color ramp. Size presets include tiny pixel-friendly outputs such as `4 x 4`, `8 x 8`, and `16 x 16`, plus larger square sizes and a Custom mode for explicit width and height. Choose **Solid Color** in Color ramp to bake a single selected color into the generated shape.
Use **Reset values** to restore the current generator's default controls and seed.

## Image-To-Mask

Choose an image mask generator to import a PNG/JPG/WebP/BMP and turn it into a mask texture. Texture Lab can extract source alpha, luminance, thresholded brightness, a color-key selection, or an outline/edge mask. Threshold acts as tolerance, Softness blends the edge, and the Color Key mask includes a color picker for the keyed source color.

Alpha masks write transparency into the output alpha channel. Luminance, threshold, color-key, and edge masks bake opaque grayscale PNGs, which makes them useful as Shader Graph mask textures for color-key, masked water, shimmer, heat haze, and distortion workflows.

## SDF, Glow, And Outline Masks

Choose an SDF / glow generator when you need scalable masks or VFX glow sprites. **SDF Circle**, **SDF Ring**, and **Spline SDF Stroke** bake opaque grayscale distance-style fields that are useful for shader thresholding, soft rings, ripple masks, and crisp UI/game VFX. **Soft Outline**, **Inner Glow**, and **Outer Glow** bake alpha-shaped sprites for halos, selection rings, shield rims, and particle accents.

Threshold controls the base radius, Softness controls the distance spread or glow width, and Falloff shapes glow intensity. **Spline SDF Stroke** uses the normal spline editor, so you can drag points, use path presets, and still export/apply the result as a generated PNG.

## Atlas And Flipbook Export

Use **Create Atlas** when one PNG should contain multiple frames. Texture Lab opens a first-class atlas workspace: the normal generator controls stay on the left, the selected frame stays editable in the center preview/editor, and a right panel owns the frame grid, layout, playback, seeded fills, onion skin, and frame actions.

Atlas controls set the layout, frame count, FPS, seed step, and Particle Playground playback mode:

- **Lifetime** uses LÖVE particle quads so each particle progresses through the atlas over its lifetime.
- **Variants** uses the atlas as randomized particle sprite variants. Feather caps this mode lower because it expands to grouped emitter systems for runtime/export parity.

Creating an atlas copies the current generated recipe into every frame slot. **Fill frames** can overwrite the full sheet with editable seeded recipe frames for sparks, smoke, rain, dissolve loops, or impact rings. Select any generated frame and the main editor switches to that frame's recipe, including spline and polygon editing. Individual frames can also be replaced with custom PNG/JPG/WebP/BMP uploads; uploaded bitmap frames are replace-only, not pixel-editable. When onion skin is enabled, the selected-frame preview tints the previous frame red and the next frame green so hand-authored motion changes are easier to compare.

The atlas panel shows the full sheet, frame grid, selected-frame metadata, and frame source type. **Export Atlas ZIP** writes `atlas.png`, `atlas.json`, and `frames/frame-000.png` style frame files. The JSON includes columns, rows, frame size, frame count, FPS, playback mode, and the editable recipe data where available.

## Saved Recipes

Use **Saved recipes** to keep named local favorites such as `blue spark`, `rain slash thin`, or `water mask noise`. Saving stores the full editable recipe in app settings, including spline points, shape layers, colors, seed, size, and alpha controls. Saving with an existing name updates that recipe; loading restores it into the current Texture Lab editor.

Saved recipes are local convenience presets. Export the generated PNG when you need a portable asset, and save or export project files separately when using the texture in Particle Playground or Shader Graph. If Atlas / Flipbook is enabled, saved recipes also keep the atlas settings.

## Spline Paths

Choose **Spline Trail**, **Spline Ribbon**, **Spline Mask**, or **Spline Lightning** when a texture needs a custom path. Drag points in the preview editor, double-click to add a point, and press Delete or Backspace to remove the selected point when the path has more than two points.

Spline presets give quick starting shapes such as Slash, Comet Tail, Ribbon S, Lightning, and Ellipse Border. Control points share a consistent fill, border color, and border width; the selected point uses a separate highlighted fill and border. Use Width, Feather, Taper, Tension, Jitter, and Samples to shape the rasterized path. Lightning jitter is seed-driven, so the same recipe and seed regenerate the same texture.

## Shapes And Polygons

Choose **Shapes & Polygons** to compose a texture from a small stack of vector-style layers. Add Polygon, Star, Ellipse, Rect, Ring, Spline, or Dot layers, then adjust fill color, stroke color, size, opacity, blend mode, and repeat behavior. The preview editor exposes move and resize handles for the selected layer. Polygon, star, and spline layers also expose draggable points; double-click to add a point and press Delete or Backspace to remove one while keeping enough points for the selected layer.

Shape presets such as Triangle, Hex Badge, Starburst, Ring Sigil, Scatter Dots, Pixel Confetti, and Soft Polygon Mask reset the layer stack to useful defaults. Repeat modes can build grids, radial symbols, or seeded scatter patterns while staying deterministic for the same recipe and seed.

## Particle Playground

In Particle Playground, open an emitter's texture controls and choose **Generate texture**. Applying a generated texture uses the same upload path as importing a PNG, so scratch project export can embed the generated texture bytes in `.featherparticles` files.

Atlas textures also carry playback metadata into Particle Playground. Use **Lifetime** for frame-over-particle-life flipbooks, or **Variants** when each particle should pick from a sheet of seeded sprite variants. Particle project export preserves atlas metadata and generated ZIP export includes an atlas sidecar JSON next to the texture.

Useful starting points:

- **Streak**, **Trail Blob**, and **Rain Slash** for quick trail-like particles.
- **Spline Trail** with the **Comet Tail** or **Slash** path preset, plus **Spline Ribbon** and **Spline Lightning**, for custom particle trails, slash sprites, bolt textures, and curved masks.
- **Shapes & Polygons** for badges, sigils, confetti, simple sprite icons, and reusable alpha masks.
- **Smoke Puff** for soft puffs and dust.
- **Spark** or **Star** with additive blending for magic, fire, and impact particles.

## Shader Graph

Shader Graph texture controls also include **Generate texture**:

- Preview Texture can use generated sprites as the source image.
- Texture Input, Texture Uniform Color, Texture Parameter, Template Controls, and Shader Controls can use generated PNGs as texture uniform uploads.
- Shader map generators create opaque RGB data for water, heat haze, shimmer, and mask-driven offsets. Normal maps encode tangent-space normals in RGB; flow and distortion maps encode signed offsets in red/green.

Generated shader textures are session uploads in v1. Export the PNG separately if you need to re-use it after importing a `.feathershgh` graph, because Shader Graph files do not embed texture bytes yet. Atlas sheets apply to Shader Graph as normal texture uploads; use the exported `atlas.json` metadata manually if a graph needs to know the sheet layout.

## Export

Use **Export PNG** to save the current generated texture, or **Export Atlas ZIP** when Atlas / Flipbook is enabled. **Regenerate** keeps the same recipe and seed; **Randomize seed** gives the same generator a new deterministic variant.
