# Shader Effect Cookbook

Use these recipes as starting points for creative shader graph requests. Favor explicit controls and readable node labels.

## Universal Structure

Most fragment effects follow this graph:

1. `TextureCoords` and optionally `Time`.
2. Source color from `TextureColor` or a custom UV sample.
3. One or more masks, UV transforms, or color transforms.
4. A named compositing node or `CustomFunction`.
5. `FragmentOutput` and a connected `Preview` node.

Expose controls as parameter nodes when the user may tune the effect later. Good common controls are amount/intensity, speed, scale, color, threshold, softness, direction, and density.

## Teleport / Phase Shift

Visual ingredients:

- Radial sweep ring moving outward.
- Horizontal slice jitter or scanline shimmer.
- Brief UV displacement near the sweep.
- Bright edge glow.
- Dissolve or alpha restoration.

Suggested nodes:

- `TextureCoords`, `Time`, `FloatParameter` for `progress`, `FloatParameter` for `intensity`, `ColorParameter` for glow.
- Use `TwirlUV`, `WaveDistort`, or a small `CustomFunction` for coupled sweep/jitter UV math.
- Use `SpriteTextureSample` or `SampleTexture` after UV warp.
- Composite with `HitFlash`, `Dissolve2D`, `ChromaticAberration`, or custom `vec4` output.

Quality notes:

- Let `progress` work from 0 to 1, even if `Time` also animates.
- Keep alpha stable before and after the teleport.
- Use smoothstep bands, not hard step-only edges.

## Falling Flower Petals

Visual ingredients:

- Several drifting petal shapes falling from top to bottom.
- Sinusoidal wind and rotation.
- Slight size and speed variation.
- Petal tint with soft vein/highlight.

Suggested graph:

- Source: `TextureColor`, `TextureCoords`, `Time`.
- Controls: `petal_density`, `fall_speed`, `wind_drift`, `petal_size`, `petal_color`.
- Use a `CustomFunction` for the looped procedural petal overlay; a node-only graph is usually too large.
- Composite the overlay over `TextureColor` and preserve source alpha with `max(base.a, petalAlpha)`.

Performance guardrails:

- Use a constant loop count from 12 to 32.
- Use deterministic hash from loop index, not texture lookups.
- Fade petals near spawn/despawn to avoid popping.

## Dissolve / Burn Away

Visual ingredients:

- Noise threshold mask.
- Colored edge band.
- Optional shimmer or smoke color.

Suggested nodes:

- `TextureColor`, `TextureCoords`, `FloatParameter threshold`, `FloatParameter softness`, `ColorParameter edgeColor`.
- Prefer `Dissolve2D` unless the user needs special noise or directional behavior.
- For directional dissolve, remap UV or use a custom function that mixes `uv.y` or `uv.x` into the threshold.

Quality notes:

- Keep `softness` non-zero.
- Give threshold a 0..1 default.
- Preserve alpha outside the dissolve.

## Water / Heat Shimmer

Visual ingredients:

- Subtle animated UV displacement.
- Smooth noise or layered waves.
- Optional mask to protect transparent edges.

Suggested nodes:

- `WaterDisplace` -> `SampleTexture` for procedural water.
- `MaskedWaterDisplace` for sprites or shorelines.
- `WaveDistort` for stylized flags, heat haze, or magic.
- Controls: speed, amplitude, scale, mask threshold.

Quality notes:

- Keep amplitude small, usually `0.005..0.04`.
- If the source has transparent boundaries, prefer masked displacement.

## Fire / Magical Flame

Visual ingredients:

- Upward UV flow.
- Noise threshold or color ramp.
- Warm-to-hot color blend.
- Flicker over time.

Suggested nodes:

- `TextureCoords`, `Time`, `TilingOffset`, `GradientNoise` or `FBMNoise`.
- `ColorRamp`, `HitFlash`, `BlendAdd`, or a custom color function.
- Controls: flame height, flicker speed, noise scale, base color, hot color.

Quality notes:

- Use vertical UV bias so flame narrows or fades upward.
- Avoid full-screen saturation; keep alpha shaped by source or mask.

## Portal / Vortex

Visual ingredients:

- Centered twirl.
- Radial ring or SDF circle.
- Energy noise or truchet pattern.
- Additive/bright rim.

Suggested nodes:

- `CenteredUV`, `TwirlUV`, `PolarCoordinates`, `VoronoiCells`, `SDFCircle`, `SDFSampleStrip`, `HitFlash`.
- Controls: twist strength, ring radius, ring width, energy color, rotation speed.

Quality notes:

- Separate UV rotation from ring mask so users can tune motion and silhouette independently.

## Hit Flash / Damage Pulse

Visual ingredients:

- Brief mix toward a color.
- Optional checker/noise mask.
- Optional outline/rim.

Suggested nodes:

- `HitFlash` for simple flash.
- `Checkerboard`, `VoronoiCells`, `Fresnel2D`, or `Outline2D` for richer masks.
- Controls: amount, color, mask scale.

Quality notes:

- Use `amount` as a parameter so the game can drive the pulse.

## Shield / Energy Field

Visual ingredients:

- Rim glow.
- Cellular noise.
- Hex or ring SDF.
- Soft additive edge.

Suggested nodes:

- `Fresnel2D`, `VoronoiCells`, `SDFCircle`, `SDFSampleStrip`, `BlendAdd`, `HitFlash`.
- Controls: energy color, cell scale, rim power, pulse speed.

Quality notes:

- Keep the core source texture visible unless the user asks for a full replacement.

## Scanline / Hologram

Visual ingredients:

- Horizontal scanlines.
- Channel offset.
- Opacity flicker.
- Optional vertical sweep bar.

Suggested nodes:

- `TextureCoords`, `Time`, `ChromaticAberration`, `Opacity2D`, `HitFlash`, or custom scan mask.
- Controls: line density, sweep speed, opacity, color, glitch amount.

Quality notes:

- Make line density resolution-aware when possible.
- Avoid hard transparency that makes sprites unreadable.

## When To Use CustomFunction

Use `CustomFunction` when:

- The effect needs a bounded loop, such as procedural petals, rain streaks, stars, sparks, or layered rings.
- Multiple outputs depend on the same random seed or phase.
- The graph would need many repeated node chains.
- A compact formula is clearer than a broad node network.

Do not use `CustomFunction` just to bypass simple existing nodes like `HitFlash`, `Dissolve2D`, `WaveDistort`, `Outline2D`, or `WaterDisplace`.
