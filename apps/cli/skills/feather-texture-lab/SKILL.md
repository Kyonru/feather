---
name: feather-texture-lab
description: Use when an agent should create procedural textures, particle sprites, masks, atlases, or shader maps through Feather MCP Texture Lab tools.
---

# Feather Texture Lab

## Workflow

1. Discover generator capabilities:
   - Use `feather_texture_lab_generators`.
   - Read `feather_texture_lab_snapshot` or `feather://creative/texture-lab`.
2. Set a recipe:
   - Use `feather_texture_lab_set_recipe` with explicit size, seed, generator, palette, layers, and output intent.
   - Save or delete recipes only when requested with `feather_texture_lab_save_recipe` or `feather_texture_lab_delete_recipe`.
3. Generate:
   - Use `feather_texture_lab_generate` for a single texture.
   - Use `feather_texture_lab_generate_atlas` for frame sequences.
4. Return artifacts:
   - Provide filename, dimensions, recipe, atlas metadata, and base64 payload metadata.
   - Do not write generated PNG or ZIP files unless the user explicitly asks.

## Use Cases

Good first targets are particle sprites, normal/flow/ripple/distortion maps, masks, SDF-style glows, gradients, slash trails, and atlas frames.

## References

- Read `references/workflow.md` for generator selection, recipe fields, atlas handoff, shader maps, and artifact reporting.
