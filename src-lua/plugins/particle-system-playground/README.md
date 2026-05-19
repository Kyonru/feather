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
| `emit` / `emit-all` | Burst particles |
| `reset` / `reset-all` | Reset particle systems |
| `kick-start` | Advance the active emitter by configured kick-start steps |
| `export-code` | Return/copy generated Lua module code |
| `export-zip` | Return generated `init.lua` plus referenced assets |

## Export

Exports produce a Lua module shaped like:

```lua
local particles = {
  x = 400,
  y = 300,
  [1] = {
    system = ps1,
    blendMode = "alpha",
    shader = shader1,
    texturePath = "gfx/fire.png",
    texturePreset = "",
    shaderPath = "",
    shaderFilename = "shader.glsl",
    x = 0,
    y = 0,
    kickStartSteps = 0,
    kickStartDt = 1 / 60,
    emitAtStart = 0,
  },
}

return particles
```

ZIP export returns `init.lua` and any available texture/shader assets. Imported texture bytes are preserved for ZIP output. Game-path assets are read through `love.filesystem.read` when possible.

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
