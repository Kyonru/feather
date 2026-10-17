# Particle Effects Workflow

Use this when creating, previewing, tuning, exporting, or QAing Particle Playground systems.

## Effect Planning

Name the feel before tuning:

- Burst: impact, explosion, hit spark.
- Loop: aura, campfire, weather, engine trail.
- Trail: slash, projectile, comet.
- Ambient: dust, pollen, embers, rain, snow.

Pick parameters that support that feel: spawn rate, lifetime, speed, spread, gravity, radial acceleration, size over life, color over life, opacity, blend mode, and texture.

## Creation And Tuning

- Read the current composite first.
- Create or select a composite and emitter deliberately.
- Change a few high-impact params at a time.
- Use named emitters when multiple layers are needed.
- Prefer generated Texture Lab sprites for soft glows, streaks, dots, smoke, and atlas frames.

## Runtime Preview

- Emit or play the system after parameter changes.
- Inspect logs if runtime preview fails.
- Inspect performance when increasing count, lifetime, or overdraw.
- If no live session exists, still export the composite and state that runtime preview was not run.

## Export Choices

- Project export: preserves editable Particle Playground state.
- Code export: useful for game integration.
- ZIP export: useful when textures or atlas assets must travel with the effect.

## Quality Checks

- The effect should read at gameplay scale.
- Burst effects should end cleanly.
- Looping effects should avoid visible pops.
- Trails should match motion direction.
- Particle count and overdraw should be bounded.
