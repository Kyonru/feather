# Particle System Playground Runtime Plugin

This built-in plugin backs Feather's Particle System Playground page. It lets the desktop create scratch particle composites, preview them in the running game, edit registered game-owned composites, and export a Lua module/ZIP.

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

Scratch composites are created from the desktop playground. The plugin owns their `love.ParticleSystem` instances, updates them, and draws them in the running game.

Composite preview `x`/`y` and preview movement patterns change emitter positions via `ParticleSystem:setPosition(...)`. They do not translate the whole particle cloud during draw. Already-emitted particles keep moving naturally.

Scratch composites can pause the plugin-owned preview without changing emitter settings or exported code. Individual emitters can also be disabled; disabled emitters remain in the composite metadata but are skipped by preview update/draw, composite emit/reset actions, and generated runtime modules.

## Timeline Preview

The playground includes a 3 second composite timeline for authoring multi-emitter effects like a small video editor. Open the Timeline tab to edit it. Each emitter appears as a track with a clip that controls when the emitter enters. Expanding a track exposes curated property lanes for common beginner-friendly automation:

- opacity
- emission rate
- speed scale
- size scale
- direction
- spread
- offset X/Y

Emitter properties remain the base values. Timeline lanes override or multiply those base values while the preview or exported effect plays. Speed and size lanes are multipliers; emission rate, direction, spread, offsets, and opacity are direct lane values. Clips can emit a burst when their start time is crossed.

The desktop sends play, pause, stop, and throttled seek updates to the real LÖVE preview. Seeking resets the preview systems and fast-forwards from `0` to the playhead with capped fixed steps so the canvas matches the authored timeline. Looping timelines wrap and restart emitters at the cycle boundary; non-looping timelines stop scheduling at the duration.

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

particleEffect.emit({
  x = 400,
  y = 300,
  r = 0,
  amount = 24,
})
```

Generated modules return `{ init, update, draw, emit, release }`. `init()` creates all exported emitters, applies their ParticleSystem settings, runs any kick-start steps, emits configured startup bursts, embeds the saved timeline, and returns a `particles` table with composite position and emitter metadata.

`emit(payload)` expects a `ParticlePayload` table with `x`, `y`, `r`, and `amount`. It resets/restarts enabled exported emitters, resets timeline time to `0`, and starts scheduled clips/bursts. `update(dt)` advances timeline playback and particle systems. Non-looping exports stop scheduling at the timeline duration; looping exports wrap and restart emitters each cycle. Disabled emitters stay in the exported metadata and are skipped by `update`, `draw`, and `emit`.

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
