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

Scratch composites are created from the playground. The browser showcase shows a floating, aspect-locked local love.js preview by default. In the Feather/Tauri app, particle preview is connected-game only for now: the plugin owns `love.ParticleSystem` instances in the connected game only when **Show in Game** is enabled.

Built-in scratch templates include Fire, Explosion, Smoke, Sparkles, Muzzle Flash, Magic Burst, Dust Puff, and Complex Composite. Complex Composite is a five-emitter example with staggered timeline clips for a core pulse, expanding ring, smoke bloom, spark trails, and dust wake.

Composite preview `x`/`y` and preview movement patterns change emitter positions via `ParticleSystem:setPosition(...)`. They do not translate the whole particle cloud during draw. Already-emitted particles keep moving naturally.

Connected-game scratch preview work is dormant until **Show in Game** is explicitly enabled. Opening the Particle Playground page in Feather does not draw anything in the attached game. Hiding the game preview, leaving the page, switching sessions, or disabling preview sends an inactive signal so the game stops updating and drawing plugin-owned scratch previews. Only the active scratch composite is updated/drawn; switching composites replaces the runtime preview target instead of keeping older composites alive.

Scratch composites can pause the plugin-owned preview without changing emitter settings or exported code. Individual emitters can also be disabled; disabled emitters remain in the composite metadata but are skipped by preview update/draw, composite emit/reset actions, and generated runtime modules.

## Timeline Preview

The playground includes a 3 second composite timeline for authoring multi-emitter effects like a small video editor. Use the header **Play** action for a quick preview, or open the Timeline tab to edit clips and keyframes. Each emitter appears as a track with a clip that controls when the emitter enters. The selected emitter expands inline to show curated property lanes for common beginner-friendly automation:

- opacity
- emission rate
- speed scale
- size scale
- direction
- spread
- offset X/Y

Emitter properties remain the base values. Timeline lanes override or multiply those base values while the preview or exported effect plays. Speed and size lanes are multipliers; emission rate, direction, spread, offsets, and opacity are direct lane values. A clip's **Emit At** time controls when the emitter enters, **Stop At** is the latest time it can create new particles, and **Burst Particles** controls how many particles fire at entry. Drag a clip body to move the emission window, drag its edges to resize it, and use the precision inspector for exact values. Lane keyframes can be added at the playhead or by double-clicking a lane; drag keyframes left/right to retime them and edit exact values in the inspector. Each expanded lane draws a small curve through its keyframes so changes over time are visible on the track. The selected keyframe's **Curve to next key** controls the outgoing segment to the following keyframe, with linear, hold, sine, quad, cubic, quart, expo, back, elastic, and bounce presets. The final key in a lane has no outgoing segment, so its curve selector is inactive. Timeline zoom and snap are remembered as editor preferences. Finite **Emitter Lifetime** can stop continuous emission earlier than Stop At; `-1` keeps emission alive for the whole clip. The emitter-level **Default Burst** value is used as the clip burst fallback. Existing particles keep living after Stop At or Emitter Lifetime according to Particle Life, and the timeline shows that tail as a non-editable extension after the clip. Reordering or deleting emitters keeps each timeline track attached to its emitter instead of leaving timing values behind on the old slot.

Stop and Reset Playhead reset playback state, but they do not rewrite the emitter's base rate or lifetime. When playback starts again, the clip window restores the saved emitter lifetime before starting each clip and then mutes emission outside the clip/lifetime intersection.

Emitter property edits and motion presets update the saved base values even while the timeline preview is paused or muted, so playing the timeline after choosing a preset keeps the authored rate, speed, and acceleration instead of capturing the muted preview state.

The Timeline tab keeps play, pause, stop, and seek editor-local until **Show in Game** is enabled. In the browser showcase those controls drive the local love.js monitor; in Feather they sync to the connected LÖVE preview only while Show in Game is active. When the game preview is active, timeline controls sync to the connected LÖVE preview while the Timeline tab keeps its own playhead animation smooth between runtime state updates. Timeline automation applies when playback/seek/editing asks for it, not as idle per-frame work for every saved composite. Seeking resets the preview systems and fast-forwards from `0` to the playhead with capped fixed steps so the canvas matches the authored timeline. Paused timelines mute continuous emission at the playhead so one-shot templates do not keep spawning particles while stopped. Looping timelines preserve live particle tails across the cycle boundary while scheduling the next cycle's clips; non-looping timelines stop scheduling at the duration.

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

Saving a project preserves the editable composite settings, emitter metadata, particle properties, shader source, timeline clips/keyframes, and any texture bytes Feather can capture. Uploaded and generated preset textures round-trip inside the JSON file. Game-path textures are embedded when `love.filesystem.read` can access them; otherwise the project keeps the path and falls back to a generated/default texture if that path is unavailable on import.

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
  loop = false,
})
```

Generated modules return `{ init, update, draw, play, pause, stop, setLoop, isLooping, emit, release }`. `init()` creates all exported emitters, applies their ParticleSystem settings, runs any kick-start steps, emits configured startup bursts, embeds the saved timeline, and returns a `particles` table with composite position and emitter metadata.

`play(payload)` expects a `ParticlePayload` table with optional `x`, `y`, `r`, `loop`, and `systemIndex`. It resets/restarts enabled exported emitters, resets timeline time to `0`, and starts the authored timeline exactly as it plays in the editor. Clip burst counts and continuous emission are controlled by the saved timeline and emitter properties, not by the payload. `r` is an optional direction offset added to authored emitter/timeline directions; omit it or pass `0` to match the editor. `loop` overrides the exported timeline loop setting for that play call; omit it to use the saved timeline default. `setLoop(true)` and `setLoop(false)` change the active override while playback is running, `setLoop(nil)` clears it back to the saved default, and `isLooping()` returns the resolved current loop state. `emit(payload)` remains as a compatibility alias for `play(payload)`. `pause()` stops timeline advancement without clearing particles, and `stop(resetParticles)` resets the playhead and optionally clears live particles. `update(dt)` advances timeline playback and particle systems. Non-looping exports stop scheduling at the timeline duration; looping exports wrap and restart emitter lifetimes each cycle without clearing existing particle-life tails. Disabled emitters stay in the exported metadata and are skipped by `update`, `draw`, and `play`.

Timeline easing and lane application are exported from the same shared Lua timeline runtime used by the plugin preview path. Scale-style lanes clamp negative overshoot to `0`, and opacity clamps to `0..1`, so elastic/back curves remain expressive without producing invalid particle sizes or alpha.

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
