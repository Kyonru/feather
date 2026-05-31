# Texture Lab

Texture Lab generates small procedural PNG textures for Feather's creative tools. It is meant for effect sprites and masks, not full image editing.

Open **Texture Lab** from the Creative sidebar group, Command Center, or the standalone showcase. It works without a connected game because generation happens in the browser with deterministic TypeScript/ImageData helpers.

## What To Generate

Texture Lab includes focused generators for common LÖVE effects:

- **Particle sprites**: soft circles, sparks, streaks, rings, smoke puffs, stars, slashes, trail blobs, comet tails, and rain slashes.
- **Masks**: circles, ellipses, rounded rectangles, radial masks, and thresholded noise masks.
- **Noise and maps**: clouds, cellular spots, dissolve noise, water noise, height-style grayscale maps, and directional gradients.
- **Pixel patterns**: checkers, dithers, scanlines, and palette ramps.
- **Spline paths**: editable trails, ribbons, stroke masks, and lightning paths.

Use the shared controls to adjust size, seed, softness, falloff, contrast, threshold, scale, distortion, tileability, pixelated preview, alpha mode, and color ramp.
Use **Reset values** to restore the current generator's default controls and seed.

## Spline Paths

Choose **Spline Trail**, **Spline Ribbon**, **Spline Mask**, or **Spline Lightning** when a texture needs a custom path. Drag points in the preview editor, double-click to add a point, and press Delete or Backspace to remove the selected point when the path has more than two points.

Spline presets give quick starting shapes such as Slash, Comet Tail, Ribbon S, Lightning, and Ellipse Border. Control points share a consistent fill, border color, and border width; the selected point uses a separate highlighted fill and border. Use Width, Feather, Taper, Tension, Jitter, and Samples to shape the rasterized path. Lightning jitter is seed-driven, so the same recipe and seed regenerate the same texture.

## Particle Playground

In Particle Playground, open an emitter's texture controls and choose **Generate texture**. Applying a generated texture uses the same upload path as importing a PNG, so scratch project export can embed the generated texture bytes in `.featherparticles` files.

Useful starting points:

- **Streak**, **Comet Tail**, and **Rain Slash** for trail-like particles.
- **Spline Trail**, **Spline Ribbon**, and **Spline Lightning** for custom particle trails, slash sprites, bolt textures, and curved masks.
- **Smoke Puff** for soft puffs and dust.
- **Spark** or **Star** with additive blending for magic, fire, and impact particles.

## Shader Graph

Shader Graph texture controls also include **Generate texture**:

- Preview Texture can use generated sprites as the source image.
- Texture Input, Texture Uniform Color, Texture Parameter, Template Controls, and Shader Controls can use generated PNGs as texture uniform uploads.

Generated shader textures are session uploads in v1. Export the PNG separately if you need to re-use it after importing a `.feathershgh` graph, because Shader Graph files do not embed texture bytes yet.

## Export

Use **Export PNG** to save the current generated texture. **Regenerate** keeps the same recipe and seed; **Randomize seed** gives the same generator a new deterministic variant.
