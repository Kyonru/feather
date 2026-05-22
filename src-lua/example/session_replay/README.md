# Session Replay Examples

These are CLI-managed LÖVE projects. Run them from the repository root:

```bash
npm run feather -- run src-lua/example/session_replay/single_player
npm run feather -- run src-lua/example/session_replay/multiplayer
npm run feather -- run src-lua/example/session_replay/adapter
```

- `single_player/` shows direct `DEBUGGER:replayRegister()` usage with a reproducible scene and an intentionally divergent scene.
- `multiplayer/` shows a seeded arena, local multiplayer input, gamepad axis capture, and mutable pickup ownership.
- `adapter/` shows the recommended Replay Adapter shape: `main.lua` talks to `dev/replay.lua`, and the adapter delegates capture/restore to game systems.

## Reproducible vs Divergent Scenarios

The single-player example demonstrates a game-defined capture and restore handler:

```bash
npm run feather -- run src-lua/example/session_replay/single_player
```

Open Feather's **Session Replay** page and use **Start Recording**, **Stop & Load**, and **Replay**. You can also use `F5` to record, `F6` to stop and load, and `F7` to replay from inside the example.

Press `Tab` inside the single-player example to switch between two scenes:

- `reproducible_scene.lua` captures enough checkpoint state to replay from a stable baseline.
- `divergent_scene.lua` intentionally omits a moving hazard from its checkpoint state, showing how replay can drift when recording starts after the game has already been running or when simulation state is not restored.

The reproducible scene relies on Session Replay's initial baseline capture: when recording starts, the registered `game` state is stored once, then later playback restores that baseline before applying input and state deltas.

## Multiplayer & Roguelike (RNG) based Scenarios

There is also a local multiplayer variant with two players and optional gamepad-axis capture for player two:

```bash
npm run feather -- run src-lua/example/session_replay/multiplayer
```

The multiplayer example also stores an initial `multiplayer` baseline when recording starts from `F5`, so both players, scores, gem ownership, and gamepad axis state are restored before replayed inputs run. Its arena is generated from a replayed seed, which mirrors the pattern many roguelikes use: restore the seed for fixed generated content, then replay only the mutable state that changed.

## Minimizing Feather specific code

The adapter example shows the recommended integration shape: gameplay code requires `dev.replay`, while all capture/restore and Feather-specific calls stay inside one adapter file.

```bash
npm run feather -- run src-lua/example/session_replay/adapter
```
