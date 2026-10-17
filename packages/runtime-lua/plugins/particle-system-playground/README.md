# Particle System Playground Runtime Plugin

This built-in plugin backs Feather's Particle System Playground page. It lets the desktop create scratch particle composites, preview them locally in love.js, optionally show them in the running game on demand, edit registered game-owned composites, and export a Lua module/ZIP.

The feature is inspired by [ReFreezed/HotParticles](https://github.com/ReFreezed/HotParticles), a particle effect editor/exporter for LÖVE. Feather's implementation is clean-room and does not vendor upstream code or assets.

The plugin id is:

```lua
particle-system-playground
```

## Game API

Game code can register an existing composite for inspection and live editing:

```lua
local playground = DEBUGGER.pluginManager:getPlugin("particle-system-playground").instance

playground:addComposite("Fire", function()
  return fireParticles
end)

playground:removeComposite("Fire")
```

`addComposite(name, getter)` expects `getter()` to return a HotParticles-style table:

```lua
{
  x = 400,
  y = 300,
  [1] = {
    system = love.graphics.newParticleSystem(image, 1000),
    blendMode = "alpha",
    shader = nil,
    texturePath = "gfx/fire.png",
    texturePreset = "",
    shaderPath = "",
    shaderFilename = "",
    x = 0,
    y = 0,
    kickStartSteps = 0,
    kickStartDt = 1 / 60,
    emitAtStart = 0,
  },
}
```

Game composites are not drawn by this plugin. The game remains responsible for drawing them. Feather edits their `ParticleSystem` values and metadata best-effort in place.

## Scratch Composites

Scratch composites are created from the playground. Studio and the browser showcase keep an aspect-locked local love.js simulation docked in the center workbench, so particle authoring works without Inspector or a connected game. When Studio is attached, the plugin owns `love.ParticleSystem` instances in the connected game only while **Show in Game** is enabled.

The surrounding workbench keeps composite and emitter selection on the left, the simulation in the largest center region, and complete emitter properties on the right. **Preview & Assets** retains composite movement, texture import/generation, and shader editing. **Timeline** adds a resizable layer below the simulation instead of replacing it. Pane sizes persist per tool, and the simulation ground can switch between dark, neutral, light, and checker calibration surfaces without changing the exported effect.

Built-in scratch templates include Fire, Explosion, Smoke, Sparkles, Muzzle Flash, Magic Burst, Dust Puff, Complex Composite, Snowfall, Rainfall, Storm Rain, and Falling Leaves. Complex Composite is a five-emitter example with staggered timeline clips for a core pulse, expanding ring, smoke bloom, spark trails, and dust wake. Storm Rain layers heavy foreground streaks, a background rain sheet, ground splashes, and low mist. Snowfall, Rainfall, Storm Rain, and Falling Leaves use Ambient timeline mode for continuous background effects.

Emitter texture controls include **Generate texture**, which opens Texture Lab and applies the generated PNG through the same upload path as imported images. This is useful for quickly creating soft circles, sparks, streaks, smoke puffs, trail blobs, comet tails, rain slashes, editable spline trails, spline ribbons, lightning strokes, masks, and atlas/flipbook sheets without leaving Feather. Scratch project export embeds those generated texture bytes the same way it embeds uploaded texture files.

Texture Lab atlas metadata is preserved for particle emitters. **Lifetime** atlas playback uses LÖVE particle quads so a particle progresses through the sheet over its life. **Variants** playback splits emission across grouped systems with one quad per frame, which gives randomized sprite variants for sparks, rain streaks, and smoke puffs while keeping exports consistent with the editor preview.

Composite preview `x`/`y` and preview movement patterns change emitter positions via `ParticleSystem:setPosition(...)`. They do not translate the whole particle cloud during draw. Already-emitted particles keep moving naturally.

Connected-game scratch preview work is dormant until **Show in Game** is explicitly enabled. Opening the Particle Playground page in Feather does not draw anything in the attached game. While shown in game, scratch previews use a reduced runtime emission budget and capped simulation step so authoring effects do not consume the full game-frame particle budget. Hiding the game preview, leaving the page, switching sessions, or disabling preview sends an inactive signal that stops, resets, and mutes plugin-owned scratch previews. Only the active scratch composite is updated/drawn; switching composites replaces the runtime preview target instead of keeping older composites alive.

If Feather runtime work is suspended from the session bar while **Show in Game** is already active, the in-game overlay keeps animating from the last payload the game received. Edits in Feather stay local until the runtime is resumed, and **Hide in Game** remains available so the overlay can be cleared without re-enabling the rest of Feather's sampling work. Starting a new connected-game preview while suspended is disabled.

Scratch composites can pause the plugin-owned preview without changing emitter settings or exported code. Individual emitters can also be disabled; disabled emitters remain in the composite metadata but are skipped by preview update/draw, composite emit/reset actions, and generated runtime modules.

## Timeline Preview

The playground includes a composite timeline for authoring multi-emitter effects like a small video editor. Use the header **Play** action for a quick preview, or open the **Timeline** layer to edit clips and keyframes while keeping the simulation visible. The timeline has three modes:

- **One-shot** plays once and stops scheduling at Duration.
- **Loop** wraps at Duration, restarts clip scheduling each cycle, and preserves live particle tails across wraps.
- **Ambient** starts once, advances to Duration, then holds final lane values. Continuous emitters with `Emitter Lifetime = -1` keep emitting after their clip's Stop At until the effect is stopped; finite emitter lifetimes still stop continuous emission after their lifetime.

Each emitter appears as a track with a clip that controls when the emitter enters. The selected emitter expands inline to show curated property lanes for common beginner-friendly automation:

- opacity
- emission rate
- speed scale
- size scale
- direction
- spread
- offset X/Y

Emitter properties remain the base values. Timeline lanes override or multiply those base values while the preview or exported effect plays. Speed and size lanes are multipliers; emission rate, direction, spread, offsets, and opacity are direct lane values. A clip's **Emit At** time controls when the emitter enters, **Stop At** is the latest normal emission-window time, and **Burst Particles** controls how many particles fire at entry. Drag a clip body to move the emission window, drag its edges to resize it, and use the precision inspector for exact values. Lane keyframes can be added at the playhead or by double-clicking a lane; drag keyframes left/right to retime them and edit exact values in the inspector. Each expanded lane draws a small curve through its keyframes so changes over time are visible on the track. The selected keyframe's **Curve to next key** controls the outgoing segment to the following keyframe, with linear, hold, sine, quad, cubic, quart, expo, back, elastic, and bounce presets. The final key in a lane has no outgoing segment, so its curve selector is inactive. Timeline zoom and snap are remembered as editor preferences. Scratch composites keep an in-memory undo/redo stack for authoring edits; use the toolbar buttons, `Cmd/Ctrl+Z`, `Cmd/Ctrl+Shift+Z`, or `Ctrl+Y` to move between emitter, texture, shader, and timeline changes. Finite **Emitter Lifetime** can stop continuous emission earlier than Stop At; `-1` keeps emission alive for the whole clip in One-shot/Loop mode and keeps Ambient continuous emission alive after Stop At. The emitter-level **Default Burst** value is used as the clip burst fallback. Existing particles keep living after Stop At or Emitter Lifetime according to Particle Life, and the timeline shows that tail as a non-editable extension after the clip. Ambient clips with `Emitter Lifetime = -1` also show a subtle continuation segment to make the held continuous emission visible. Reordering or deleting emitters keeps each timeline track attached to its emitter instead of leaving timing values behind on the old slot.

Stop and Reset Playhead reset playback state, but they do not rewrite the emitter's base rate or lifetime. When playback starts again, the clip window restores the saved emitter lifetime before starting each clip and then mutes emission outside the clip/lifetime intersection.

Emitter property edits and motion presets update the saved base values even while the timeline preview is paused or muted, so playing the timeline after choosing a preset keeps the authored rate, speed, and acceleration instead of capturing the muted preview state.

The Timeline layer keeps play, pause, stop, and seek editor-local until **Show in Game** is enabled. In standalone Studio and the browser showcase those controls drive the local love.js monitor; when attached they additionally sync to the connected LÖVE preview only while Show in Game is active and the runtime is not suspended. When the game preview is active, timeline controls sync to the connected LÖVE preview while the Timeline layer keeps its own playhead animation smooth between runtime state updates. Timeline automation applies when playback/seek/editing asks for it, not as idle per-frame work for every saved composite. Seeking resets the preview systems and fast-forwards from `0` to the playhead with capped fixed steps so the canvas matches the authored timeline. Paused timelines mute continuous emission at the playhead so one-shot templates do not keep spawning particles while stopped. Looping timelines preserve live particle tails across the cycle boundary while scheduling the next cycle's clips; one-shot timelines stop scheduling at the duration; Ambient timelines hold at Duration without rescheduling clip bursts.

Game-owned composites support timeline automation best-effort. Feather can adjust `ParticleSystem` values and emit scheduled bursts, but draw-only behavior such as opacity depends on the game drawing the registered systems.

Supported preview movement patterns:

- `none`
- `circle`
- `figure-eight`
- `irregular`

Movement is preview-only behavior and is not exported as runtime logic.

## Desktop Protocol

The desktop uses Feather's existing plugin protocol:

- `handleRequest()` returns the current composite list, active composite, active emitter, metadata, and particle properties.
- `handleParamsUpdate()` receives debounced property updates from the UI.
- `handleActionRequest()` handles selection, emitter/composite mutations, asset changes, and exports.

Important actions:

| Action | Effect |
| --- | --- |
| `new-composite` | Create a scratch composite |
| `delete-composite` | Delete the active scratch composite |
| `add-system` | Add an emitter to a scratch composite |
| `remove-system` | Remove an emitter from a scratch composite |
| `select-composite` | Select the active composite |
| `select-system` | Select the active emitter |
| `runtime-preview` | Mark the desktop playground preview active/inactive for the selected composite |
| `set-texture` | Apply a texture preset, game path, or uploaded base64 texture |
| `set-shader` | Apply inline shader source or a shader path |
| `set-timeline` | Replace the active composite timeline |
| `restore-composite` | Restore a scratch composite authoring snapshot for undo/redo |
| `timeline-control` | Play, pause, stop, or seek the active composite timeline |
| `emit` / `emit-all` | Reset/restart enabled emitters in the active composite, then burst particles |
| `reset` / `reset-all` | Reset enabled emitters in the active composite |
| `kick-start` | Advance the active emitter by configured kick-start steps |
| `export-code` | Return/copy generated Lua module code |
| `export-zip` | Return generated `init.lua` plus referenced assets |
| `export-project` | Save the active composite as an editable `.featherparticles` project |
| `import-project` | Import a `.featherparticles` project as a new scratch composite |

## Project Files

Particle projects use a portable JSON format with the `.featherparticles` extension:

```json
{
  "type": "feather.particle-system-playground",
  "version": 2,
  "exportedAt": "2026-05-26T00:00:00Z",
  "name": "Explosion",
  "composite": {
    "x": 400,
    "y": 300,
    "previewEnabled": true,
    "movement": { "pattern": "none" },
    "systems": [],
    "timeline": {
      "duration": 3,
      "loop": false,
      "tracks": []
    }
  }
}
```

Saving a project preserves the editable composite settings, emitter metadata, particle properties, shader source, timeline clips/keyframes, texture atlas metadata, and any texture bytes Feather can capture. Uploaded and generated preset textures round-trip inside the JSON file. Game-path textures are embedded when `love.filesystem.read` can access them; otherwise the project keeps the path and falls back to a generated/default texture if that path is unavailable on import.

Importing a project always creates a new scratch composite and selects it. Existing composites are left untouched, and duplicate names receive a numeric suffix. Version 1 project files still import; Feather migrates them to a default 3 second timeline with one clip per emitter starting at `0`.

## Export

Exports produce a Lua module that can be dropped into a game and driven through a small lifecycle API:

```lua
local particleEffect = require("particles.fire")
local particles = particleEffect.init()

function love.update(dt)
  particleEffect.update(dt)
end

function love.draw()
  particleEffect.draw()
end

particleEffect.play({
  x = 400,
  y = 300,
  r = 0,
  mode = "one-shot",
})
```

Generated modules return `{ init, update, draw, play, pause, stop, setMode, getMode, setLoop, isLooping, emit, release }`. `init()` prepares shared assets, prewarms one pooled playback instance, embeds the saved timeline, and returns a `particles` table with composite position, a compatibility `systems` alias for the prewarmed/latest playback instance, and active `instances`.

`play(payload)` expects a `ParticlePayload` table with optional `x`, `y`, `r`, `mode`, `loop`, and `systemIndex`. One-shot and Loop calls check out independent pooled timeline instances, so multiple calls can overlap like separate explosion or hit effects without resetting earlier particles. Ambient calls, used by weather templates such as Storm Rain, reuse the currently active ambient instance and retarget its position instead of stacking another full set of particle systems. Texture and shader assets stay shared, and finished one-shot instances are recycled for later plays. Clip burst counts and continuous emission are controlled by the saved timeline and emitter properties, not by the payload. `r` is an optional direction offset added to authored emitter/timeline directions; omit it or pass `0` to match the editor. `mode` can be `"one-shot"`, `"loop"`, or `"ambient"` and wins over legacy `loop`; omit both to use the saved timeline default. `setMode(mode)` changes the active mode override, `getMode()` returns the resolved mode, `setLoop(true)` maps to Loop, `setLoop(false)` maps to One-shot, `setLoop(nil)` clears the override, and `isLooping()` returns whether the resolved mode is Loop. `emit(payload)` remains as a compatibility alias for `play(payload)`. `pause()` stops timeline advancement and mutes continuous emission without clearing particles, and `stop(resetParticles)` resets the playhead and optionally clears live particles. `update(dt)` advances all active timeline instances and particle systems. One-shot exports stop scheduling at the timeline duration; looping exports wrap and restart emitter lifetimes each cycle without clearing existing particle-life tails; Ambient exports hold final lane values and keep infinite-lifetime continuous emission alive until stopped. Ambient exports still update native LÖVE particle systems every frame, but authored timeline property setters run on a low-frequency cadence unless play, retarget, pause, stop, or mode changes dirty the instance. Disabled emitters stay in the exported metadata and are skipped by `update`, `draw`, and `play`.

Timeline lane data compiles into a per-effect playback plan. Empty lanes do not emit runtime lane work, same-value lanes become constants, linear/hold lanes use a tiny numeric sampler, and only lanes with complex easing embed the shared evaluator. Generated modules also avoid setter churn by caching last-applied values with small thresholds for emission rate, speed/size scale, offsets, spread, direction, and opacity. Scale-style lanes clamp negative overshoot to `0`, and opacity clamps to `0..1`, so elastic/back curves remain expressive without producing invalid particle sizes or alpha.

ZIP export returns `init.lua` and any available texture assets. Shader source is embedded in `init.lua` as Lua strings so generated modules do not need to read `.glsl` files at runtime. Imported texture bytes are preserved for ZIP output. Game-path texture assets are read through `love.filesystem.read` when possible.

## Shaders

The desktop editor includes built-in particle shader presets such as glow, smoke, sparkle, dissolve, ring, and energy effects. Presets are plain LÖVE pixel shader source and can be edited before applying.

Animated presets may declare:

```glsl
extern number u_time;
```

When a scratch composite is drawn, the plugin sends `u_time` with `love.timer.getTime()` if the active shader accepts it. Shaders that do not declare `u_time` are unaffected.

## Notes

- This is a Feather-owned clean-room runtime/plugin implementation.
- It does not depend on upstream HotParticles code or assets.
- It does not import `.hotparticles` project files.
- Registered game composites can be edited, but exports are only complete when the plugin has enough texture/shader metadata or uploaded asset bytes.

## Runtime architecture: one program, three hosts

The particle tool is the only one whose output is code someone ships.

Three principles:

- **One program, three hosts.** The in-game plugin, the love.js preview and the exported file run
  the same code deciding the same things.
- **The runtime simulates; Lua orchestrates.** Lua's job per frame is to decide what changed. If
  nothing changed, its job is nothing.
- **Exported code is the product.** No dead branches, no `pcall` around calls that cannot fail, no
  configuration the project does not use.

The work that implemented them, all done 2026-09-10 (code comments cite these IDs):

| Phase | Delivered |
| --- | --- |
| **P1** — One semantic core | `core.lua` is the only definition of a keyframe; all hosts require it; clamps live in `Core.resolve` |
| **P2** — Change detection | `apply.lua` is the only setter caller and sends only what moved; lanes compiled once; `pcall` off the per-frame path. A constant composite issues 6 setter calls, not 3,600 |
| **P3** — Lifecycle | `lifecycle.lua` warms on start in all hosts and pools with a bound; neither touches `love` |
| **P4** — Atlas variants | The N-draw fan-out stays (a LÖVE 11 limit; see the Feather-side GPU export target in `ROADMAP.md`); its sync cost dropped 9x and is skipped when nothing moved |
| **P5** — Generated code | The export embeds `core.lua` and `apply.lua` verbatim and defines no semantics; tier 0 exports no update loop. 2,169 frame comparisons, zero mismatches |

**Particles §1 — the situation that was fixed.** Keyframe semantics existed four times: the plugin
(`init.lua`), the preview (`showcase_preview/main.lua`), the exporter's string literals, and the
TypeScript curve editor (`easing.ts`). They had drifted, which is why the export did not match the
preview. Now `core.lua` is the only Lua definition, every host requires it, and `easing.ts` is held
to it by `particleEasingContract.test.ts` (all 26 easings). `particleCoreIsSingular.test.ts` fails
if any host re-defines the semantics.

**Particles §2 — the premise.** LÖVE 11's `ParticleSystem` simulates on the CPU in C++; the GPU
draws. There are no compute shaders. So the goals are: no per-particle work in Lua, no per-frame
work the value does not need, and the GPU doing the varying where a shader can.

**Particles §4.2 — per-frame cost is allocation, not time.** Before P2, six emitters cost 0.28% of a
60fps frame but churned 166 KB/s of garbage, identically whether lanes were keyframed or constant —
fresh `sizes` tables, `unpack`, and `pcall` on every setter. GC pressure is what produces hitches.
`pcall` is gone from the per-frame path (guarded); input authored outside the repo is still
validated. LuaJIT does not JIT on arm64 macOS, so measurements there are the pessimistic case.
Reproduce with `love scripts/bench-particle-timeline`.

**Particles §4.3 — clamps are semantics.** `emissionRate`, `speedScale` and `sizeScale` clamp to
`≥ 0` and `opacity` to `[0, 1]`, inside `Core.resolve`. Overshoot easings are supposed to leave
`[0, 1]` — `inElastic` reaches −37% — so without the clamps the preview drew negative sizes the export
never would. Do not "fix" a host by copying the clamps into it; that is another implementation.

**Particles §4.5 — warming.** `kickStartSteps` / `kickStartDt` are honoured on start in all three
hosts (`lifecycle.lua`). An authored value, including zero, wins; otherwise `ambient` warms one
particle lifetime and `loop` / `one-shot` do not. Steps are capped and `kickStartDt` is clamped to
1/10. A prewarmed system that hits `setBufferSize` silently stops emitting.

**Particles §5 — the architecture.** In `plugins/particle-system-playground/`: `core.lua` evaluates
lanes, clamps and decides what changed, and never touches LÖVE; `apply.lua` is the only code that
calls a setter and issues only the setters whose value changed; `lifecycle.lua` builds, pools and
warms. The exported file embeds `core.lua` and `apply.lua` verbatim.

**Particles §5.1 — curves are baked, not simplified.** A lane is a pure function of time, so it is
sampled once into a flat array at `ceil(duration * 120)` samples — two per 60fps frame, exact as far
as anyone can observe (a `hold` step at 64 samples is 64% wrong; at one per frame it is 0%). Constant
lanes are a number, not an array. The editor evaluates directly while a keyframe is dragged and
bakes on release.

**Particles §5.2 — an effect pays only for the tier it uses.** Tier 0: everything is native
properties — setters at load, zero per-frame Lua, and the export has no update loop at all (the Hot
Particles shape). Tier 1: the effect keyframes something — one baked sample and a changed-value
check per varying lane. The tier is derived from the effect, never chosen in the UI. Asserted both
ways in the export tests.
