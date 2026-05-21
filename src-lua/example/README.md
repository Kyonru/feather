# Feather Lua Examples

Run these examples from the repository root with LÖVE:

```bash
love src-lua --demo
love src-lua --test-auto
love src-lua --test-ws
love src-lua --test-cli
love src-lua --plugin-ui
love src-lua --hot-reload
love src-lua --e2e
```

`--demo` is the default when no flag is passed.

The CLI injection example is a standalone LÖVE project with no Feather require:

```bash
npm run feather -- run src-lua/example/test_cli
npm run feather -- run src-lua -- --test-cli
npm run feather -- run src-lua --config src-lua/example/test_cli/feather.config.lua -- --test-cli
```

It includes a `feather.config.lua` so the CLI can demonstrate project-local configuration.

The hot reload example demonstrates the opt-in `hot-reload` plugin module reload flow:

```bash
love src-lua --hot-reload
```

Open Feather's **Debugger** tab, select `example/hot_reload/gameplay.lua`, edit that file, then press **Reload** or enable **Watch**.

The session replay example demonstrates the opt-in `session-replay` plugin with a game-defined capture and restore handler:

```bash
npm run feather -- run src-lua/example/session_replay
```

Open Feather's **Session Replay** page and use **Start Recording**, **Stop & Load**, and **Replay**. You can also use `F5` to record, `F6` to stop and load, and `F7` to replay from inside the example.

Press `Tab` inside the single-player example to switch between two scenes:

- `reproducible_scene.lua` captures enough checkpoint state to replay from a stable baseline.
- `divergent_scene.lua` intentionally omits a moving hazard from its checkpoint state, showing how replay can drift when recording starts after the game has already been running or when simulation state is not restored.

The reproducible scene relies on Session Replay's initial baseline capture: when recording starts, the registered `game` state is stored once, then later playback restores that baseline before applying input and state deltas.

There is also a local multiplayer variant with two players and optional gamepad-axis capture for player two:

```bash
npm run feather -- run src-lua/example/session_replay_multiplayer
```

The multiplayer example also stores an initial `multiplayer` baseline when recording starts from `F5`, so both players, scores, gem ownership, and gamepad axis state are restored before replayed inputs run. Its arena is generated from a replayed seed, which mirrors the pattern many roguelikes use: restore the seed for fixed generated content, then replay only the mutable state that changed.

The Lua E2E example is meant for automation. It runs assertions through LÖVE and exits on its own:

```bash
npm run test:lua:e2e
```
