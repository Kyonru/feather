# Session Replay

Session Replay combines input replay with developer-selected state checkpoints so a playthrough can be recorded, exported, imported, and reproduced later.

Feather orchestrates the recording and playback. Your game decides which state matters and, when you want deterministic reproduction, how that state is restored.

It does not serialize your whole game. Reliable reproduction comes from deterministic inputs plus optional restore callbacks for the state streams you care about.

## Enable The Plugin

Session Replay is development-only and opt-in:

```lua
-- feather.config.lua
return {
  include = { "session-replay" },
}
```

Run through the CLI or VS Code extension so production builds can stay Feather-free:

```bash
feather run path/to/my-game
```

## Minimal Capture

Use guarded calls from game code:

```lua
if DEBUGGER then
  DEBUGGER:replayState("player", {
    x = player.x,
    y = player.y,
    health = player.health,
  })
end
```

`DEBUGGER:replay("player", state)` is available as a shorthand. State must be JSON-serializable: strings, numbers, booleans, arrays, and tables with string keys.

Session Replay stores sparse deltas. If a named state stream serializes to the same value as the previous sample, Feather skips it. Periodic keyframes are still written so longer recordings have stable checkpoints.

## Recording Files And Flushes

When a session starts, Feather creates the replay folder and baseline files up front:

- `manifest.json`
- `initial.json`
- `inputs.jsonl`
- `state-0001.jsonl`

Input and state events are then captured in memory first and flushed to disk in small batches from the plugin update loop, on stop, and before export/load. This keeps input callbacks lightweight so the first captured key, mouse, touch, or joystick event is not also paying the cost of opening replay files.

You can tune the tradeoff:

```lua
return {
  include = { "session-replay" },
  pluginOptions = {
    ["session-replay"] = {
      flushInterval = 0.2,
      flushMaxLines = 128,
    },
  },
}
```

Lower values reduce possible data loss if the game crashes mid-recording. Higher values reduce disk I/O during heavy input or state capture.

## Reliable Restore

For reliable reproduction, register a capture and restore pair:

```lua
if DEBUGGER then
  DEBUGGER:replayRegister("player", function()
    return {
      x = player.x,
      y = player.y,
      health = player.health,
    }
  end, function(state)
    player.x = state.x
    player.y = state.y
    player.health = state.health
  end)
end
```

During recording, Feather calls the capture function and stores deltas. During playback, it calls the restore function at the recorded timestamps while also replaying inputs.

Feather does not deep-copy or restore arbitrary Lua objects. Prefer compact state streams such as player position, current room, RNG seed, quest flags, or a game-defined checkpoint.

## Initial Baseline

When a recording starts, Session Replay captures an initial baseline for registered state streams and writes it to `initial.json`. Playback restores that baseline once before replaying inputs and timed state deltas.

For most games, the registered capture function is enough:

```lua
if DEBUGGER then
  DEBUGGER:replayRegister("game", captureSceneCheckpoint, restoreSceneCheckpoint)
end
```

For a specific scene, save point, or cutscene moment, pass an explicit baseline when starting:

```lua
if DEBUGGER then
  DEBUGGER:startSessionReplay({
    initialStates = {
      game = captureSceneCheckpoint(),
      combat = captureCombatCheckpoint(),
    },
  })
end
```

If you want full manual control, disable automatic initial capture and set baseline streams yourself:

```lua
if DEBUGGER then
  DEBUGGER:startSessionReplay({ captureInitial = false })
  DEBUGGER:replayInitialState("game", captureSceneCheckpoint())
end
```

## Seeded And Procedural Content

For roguelikes, procgen arenas, randomized loot, and other seed-driven systems, avoid recording every fixed generated object when a seed can recreate it. Store the seed in the initial baseline, regenerate the fixed world during restore, then apply only the mutable state that changed during play.

That usually looks like:

```lua
local function captureReplay()
  return {
    world = {
      seed = run.seed,
      levelId = currentLevel.id,
      pickups = capturePickupOwnership(),
    },
    players = capturePlayers(),
  }
end

local function restoreReplay(state)
  if state.world then
    run.seed = state.world.seed
    loadLevel(state.world.levelId)
    generateArenaFromSeed(run.seed)
    restorePickupOwnership(state.world.pickups)
  end

  if state.players then
    restorePlayers(state.players)
  end
end

if DEBUGGER then
  DEBUGGER:replayRegister("run", captureReplay, restoreReplay)
end
```

The seed is baseline state: it restores the deterministic layout once. Ownership, destroyed walls, opened doors, collected pickups, enemy health, or any other state that changes after generation should still be captured as mutable replay state.

The multiplayer example uses this pattern. Gems and obstacles are generated from a seed, then replay captures player positions, scores, gamepad axis state, and gem ownership.

## Reproduction Boundaries

Session Replay is a repro aid, not a full save-state emulator. It records inputs, timing, and the state streams your game provides. It does not automatically capture Lua globals, random number generator state, physics solver internals, timers, coroutines, loaded assets, entities created before recording, or anything else your game does not expose.

For reliable playback, start from a known checkpoint. If recording begins after the game has already been running, playback can diverge unless your capture/restore handler includes enough state to rebuild that moment.

Good checkpoint candidates include:

- current scene or level
- player position, inventory, health, and score
- RNG seed or deterministic random state
- important entities and their simulation state
- timers, cooldowns, quest flags, and trigger state
- camera or viewport state when input depends on it

The intended promise is: Feather orchestrates inputs and developer-selected checkpoints; your game defines what "same starting point" means.

## Integration Cost

Session Replay has a real integration cost. It asks your game to describe what matters for reproduction, and that can become architectural debt if Feather calls are scattered through gameplay code.

Treat Session Replay as an advanced repro tool, not a required setup step. It is usually worth the cost when you need to reproduce bugs from playtests, roguelike runs, input-heavy interactions, long setup sequences, or hard-to-hit timing issues. For simple projects, input-only replay or normal logs may be enough.

Keep the cost small:

- Prefer one or a few centralized replay adapters instead of many `DEBUGGER:replayState()` calls across entities.
- Put capture and restore code near existing save, checkpoint, level-loading, or debug-state systems.
- Capture semantic state such as `levelId`, seeds, player state, inventory, flags, and entity snapshots instead of raw object graphs.
- Use seeds and IDs for fixed generated content, then capture only mutable differences.
- Guard all usage with `if DEBUGGER then ... end`, or hide it behind a tiny local wrapper such as `devReplay.register(...)`.
- Keep production builds Feather-free; replay files and runtime code are development artifacts.

A healthy integration looks like this:

```lua
local function captureReplay()
  return saveSystem.captureDebugCheckpoint()
end

local function restoreReplay(state)
  saveSystem.restoreDebugCheckpoint(state)
end

if DEBUGGER then
  DEBUGGER:replayRegister("game", captureReplay, restoreReplay)
end
```

Avoid wiring Feather into every gameplay branch. This shape is fragile:

```lua
-- Avoid spreading this pattern everywhere.
if DEBUGGER then
  DEBUGGER:replayState("enemy_17", enemy)
end
```

Session Replay mitigates some of the setup cost:

- Input capture works without state capture, so you can start with replaying controls only.
- `DEBUGGER:replayRegister()` gives one central capture/restore hook for a whole game, scene, or run.
- Initial baselines are captured automatically from registered streams at recording start.
- `initialStates` lets you define scene-specific or moment-specific baselines without sampling them forever.
- Sparse deltas skip repeated identical state.
- Release and upload safety checks treat replay files and Session Replay runtime footprints as development-only.

Feather should not try to magically serialize the whole game to avoid this cost. That would be more surprising and more dangerous than an explicit adapter. The safest model is: Feather records inputs and transports replay data; your game owns the checkpoint contract.

## Replay Adapter

Use a Replay Adapter when you want Session Replay without spreading Feather-specific calls throughout the game. The adapter is one project-local file that owns capture, restore, baseline, and optional programmatic controls.

Create the scaffold:

```bash
feather replay init --dir path/to/my-game
```

This creates:

```text
dev/replay.lua
```

If `feather.config.lua` exists, the command also enables the `session-replay` plugin. Use `--no-config` to skip that update, `--path <path.lua>` to choose another adapter path, or `--force` to overwrite an existing adapter.

Then wire the adapter once:

```lua
local replay = require("dev.replay")

function love.load()
  replay.register()
end

function love.keypressed(key)
  if key == "f5" then
    replay.start()
  elseif key == "f6" then
    replay.stop()
  elseif key == "f7" then
    replay.play()
  end
end
```

Edit `dev/replay.lua` so its `capture()` and `restore()` functions call your game systems. A good adapter usually delegates to existing save, checkpoint, scene-loading, or debug-state modules:

```lua
local function capture()
  return saveSystem.captureDebugCheckpoint()
end

local function restore(state)
  saveSystem.restoreDebugCheckpoint(state)
end
```

The adapter can be required in production safely because it no-ops when `DEBUGGER` is unavailable. Production release builds should still exclude replay files and Feather runtime artifacts.

## Input Coverage

Session Replay records keyboard, mouse button, touch, joystick, and gamepad callbacks.

Mouse movement, touch movement, and joystick/gamepad axes are intentionally disabled by default because they can produce a lot of data. Enable them when the game needs that input stream:

```lua
-- feather.config.lua
return {
  include = { "session-replay" },
  pluginOptions = {
    ["session-replay"] = {
      captureMouseMove = true,
      captureTouchMove = true,
      captureJoystickAxis = true,
    },
  },
}
```

Keyboard and mouse polling are virtually mirrored during playback for `love.keyboard.isDown`, `love.keyboard.isScancodeDown`, `love.mouse.isDown`, and `love.mouse.getPosition`. Joystick and gamepad replay is callback-driven, so prefer handling axes through `love.gamepadaxis` or `love.joystickaxis` when you want deterministic replay.

## Desktop Workflow

1. Open **Session Replay** in the Feather app.
2. Click **Start Recording**.
3. Play through the bug or scenario.
4. Click **Stop & Load**.
5. Click **Replay** to reproduce it in the connected game.
6. Click **Export** to save a `.featherreplay` file.
7. Later, click **Import** and **Replay** to reproduce the same session.

The page shows available replay sessions, recording status, duration, input count, initial state count, state event count, state streams, and missing restore handlers.

## Examples

The repository includes runnable examples:

```bash
npm run feather -- run src-lua/example/session_replay/single_player
npm run feather -- run src-lua/example/session_replay/multiplayer
npm run feather -- run src-lua/example/session_replay/adapter
```

The single-player example includes two scenes. Press `Tab` to switch between a reproducible checkpoint scene and a divergent scene that intentionally omits a moving hazard from its replay state. The multiplayer example uses a seeded arena, showing how roguelike-style games can restore fixed generated content from a seed while replaying mutable state such as players, scores, and pickups. The adapter example keeps all Feather-specific replay calls inside `dev/replay.lua`.

## Programmatic Control

```lua
if DEBUGGER then
  DEBUGGER:startSessionReplay()

  -- play through a repro

  DEBUGGER:stopSessionReplay()
  DEBUGGER:playSessionReplay()
end
```

## Local Files

Recordings are written under Love2D save data:

```text
feather_replays/<replay-id>/
  manifest.json
  initial.json
  inputs.jsonl
  state-0001.jsonl
```

These are development artifacts. `feather doctor --production` and upload safety checks flag `feather_replays/`, `.featherreplay` files, and Session Replay runtime footprints before production builds or uploads.

## Limits

- V1 is local-first. Replay files stay in Love2D save data or exported `.featherreplay` archives.
- Exported `.featherreplay` files are local archives, not cloud sync.
- Determinism still depends on your game. Capture and restore RNG seeds, level state, and important simulation state when inputs alone are not enough.
- Structural sub-field diffs may come later; V1 compares each named state stream by stable JSON output.
