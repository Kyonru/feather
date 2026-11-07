# Texture Lab Workflow

Use this when creating procedural textures, particle sprites, masks, shader maps, or atlases.

## Generator Selection

- Particle sprite: soft circle, glow, streak, smoke, spark, slash, trail.
- Mask: shape, image-to-mask, SDF-style glow, thresholded noise.
- Shader map: normal, flow, ripple, distortion.
- Atlas: frame sequence for particles, animated masks, flipbooks.
- Utility texture: gradients, noise, ramps, color swatches.

Call `feather_texture_lab_generators` before assuming exact generator fields.

## Recipe Fields

Set these explicitly when relevant:

- Width and height.
- Generator id.
- Seed.
- Palette/colors.
- Layers and layer blend modes.
- Shape/path controls.
- Atlas enabled, frame count, columns, rows, padding.
- Output intent in the recipe name or response.

## Generation

- Use single texture generation for one PNG payload.
- Use atlas generation for frame sequences.
- Save/delete recipes only when asked.
- Do not write PNG or ZIP files unless asked.

## Handoff

- For particles, include sprite dimensions and atlas metadata.
- For Shader Graph, include map purpose and intended texture slot.
- For masks, include expected alpha semantics.
- For normal/flow/distortion maps, include coordinate/channel meaning.

## Quality Checks

- Texture dimensions match use case.
- Alpha is meaningful for sprites and masks.
- Tiling textures tile cleanly if intended.
- Atlas frames have stable sizing and padding.
- Generated maps are not over-saturated unless the shader expects that.
