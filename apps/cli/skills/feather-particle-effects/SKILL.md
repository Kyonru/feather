---
name: feather-particle-effects
description: Use when an agent should create, preview, tune, export, or QA particle systems with Feather MCP Particle Playground tools.
---

# Feather Particle Effects

## Workflow

1. Read the playground state:
   - Use `feather_particles_snapshot` or `feather://creative/particle-system-playground`.
2. Create the effect:
   - Use `feather_particles_new_composite` for a new composite.
   - Use `feather_particles_select` and `feather_particles_set_params` to tune emitters, timelines, colors, sizes, speeds, and texture references.
3. Preview and iterate:
   - Use `feather_particles_action` for runtime-backed actions and wait for `plugin:action:response`.
   - Inspect logs/performance when particles affect frame time.
4. Export:
   - Use `feather_particles_export_project`, `feather_particles_export_code`, or `feather_particles_export_zip`.
   - Return generated payload metadata to the user; do not write files unless requested.

## Quality Bar

Name the intended feel of the effect, the important parameters changed, and how it should be triggered in game code.

## References

- Read `references/workflow.md` for particle effect recipes, parameter tuning, preview/export checks, and performance guardrails.
