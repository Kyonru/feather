# Shader Visual Quality

Use this before final validation of a shader graph.

## Output Quality

- Preserve source texture detail unless the request is explicitly full-screen, abstract, or replacement-only.
- Preserve source alpha for sprite effects. If adding an overlay, use alpha compositing or `max(base.a, overlay.a)` deliberately.
- Use `smoothstep` and derivative-aware masks for soft edges; reserve hard `step` for pixel-art or deliberate glitches.
- Keep colors balanced. Add bright glow with restraint so white sprites and UI remain legible.
- Avoid one-note animation. Layer at least two motion signals for natural effects: drift plus rotation, ring plus shimmer, UV warp plus dissolve.
- Make loops continuous by using `fract(time * speed + seed)` and fading spawn/despawn boundaries.

## Controls

Expose controls that match user vocabulary:

- Amount/intensity for strength.
- Speed for time scale.
- Scale/density/count for frequency.
- Size/radius/width for spatial dimensions.
- Threshold/softness for masks.
- Color/tint/glow color for palette.
- Direction/wind/drift for motion.

Use defaults that show the effect immediately but do not destroy the source. Parameter defaults should be useful in `lastGeneratedGlsl.parameters`.

## Performance

- Keep fragment loops constant and modest. Use 8..16 for small overlays, 24..32 for dense petals/sparks, and avoid higher counts unless required.
- Prefer built-in nodes for common operations; their emitted GLSL is already tuned for this graph.
- Avoid extra texture uniforms unless the effect clearly needs them.
- Avoid expensive nested loops in `CustomFunction`.
- If using noise in many places, reuse a calculated value inside a custom function instead of recomputing hashes unnecessarily.

## Graph Readability

- Label nodes by role, not only type: `Sample Warped Sprite`, `Petal Overlay`, `Dissolve Edge`, `Final Composite`.
- Place inputs and controls on the left, processing nodes in the middle, preview/output on the right.
- Connect the final color to both `FragmentOutput.color` and a `Preview.color` node when authoring an effect.
- Use parameter nodes for user controls instead of burying tunable values inside custom GLSL.
- Keep `shaderName` descriptive and filename-safe.

## Validation

Always run `feather_shader_graph_compile` after import or modification.

If a live session exists:

- Run `feather_shader_graph_preview`.
- Check that the preview shape fits the effect. Use `rectangle` for full-sprite overlays, `circle` for particle/rim effects, and `line` for trail-like shaders.
- If the preview reports texture upload issues, either upload the texture through Texture Lab/Shader Graph or remove the extra texture dependency.

If no live session exists:

- Compile locally.
- Export the graph.
- Tell the user that runtime preview was not run because no Feather session was connected.

## Common Failure Modes

- A graph compiles but looks like a pass-through: confirm the final output edge targets `FragmentOutput.color`.
- Preview is black or transparent: inspect alpha math and source texture assumptions.
- Extra texture node errors: upload a texture or use source `TextureColor`/`SpriteTextureSample`.
- Glitch effects are too harsh: reduce displacement amount, add smoothstep, or expose intensity.
- Procedural particles pop: fade in/out by phase near 0 and 1.
- Sprite edge swims during distortion: mask displacement by source alpha or use `MaskedWaterDisplace`.
