# MemorySnapshotPlugin

The `MemorySnapshotPlugin` lets you take **point-in-time memory snapshots** of your LÖVE game and **diff between them** to find memory leaks. It captures `collectgarbage("count")` plus the size and entry count of any tables you register for tracking.

## Installation

```lua
local MemorySnapshotPlugin = require("plugins.memory-snapshot")
```

## Configuration

```lua
FeatherPluginManager.createPlugin(MemorySnapshotPlugin, "memory-snapshot", {
  maxSnapshots = 100,     -- max snapshots stored (oldest trimmed)
  autoInterval = 0,       -- seconds between auto-snapshots (0 = off)
})
```

## Options

| Option         | Type   | Default | Description                                        |
| -------------- | ------ | ------- | -------------------------------------------------- |
| `maxSnapshots` | number | `100`   | Maximum snapshots stored (FIFO overflow).          |
| `autoInterval` | number | `0`     | Auto-snapshot interval in seconds. `0` = disabled. |

## Tracking Tables

Register tables you want to monitor. Use a getter function so the plugin always measures the live table:

```lua
local mem = DEBUGGER.pluginManager:getPlugin("memory-snapshot")
if mem then
  -- Track a global entities table
  mem.instance:trackTable("entities", function() return entities end)

  -- Track a cache
  mem.instance:trackTable("spriteCache", function() return spriteCache end)

  -- Track nested data
  mem.instance:trackTable("world.bodies", function() return world:getBodies() end)

  -- Stop tracking
  mem.instance:untrackTable("spriteCache")
end
```

Each snapshot records the **entry count** and **estimated byte size** (recursive, cycle-safe) for every tracked table.

## Taking Snapshots

### From the desktop UI

Click **Take Snapshot** in the plugin actions.

### From game code

```lua
mem.instance:takeSnapshot("before level load")
-- ... load level ...
mem.instance:takeSnapshot("after level load")
```

## Diffing Snapshots

Click **Diff First ↔ Last** to compare the oldest and newest snapshots. The diff view shows:

- **GC Memory** delta (total Lua heap)
- Per-table **count** and **size** deltas
- **Status** indicators: `▲ grew`, `▼ shrunk`, `— same`, `▲ leak?`

To diff specific snapshots, enter their IDs in the **Diff Snapshot A** and **Diff Snapshot B** inputs, then click **Diff First ↔ Last** again or toggle the view.

## Actions

| Action            | Description                                          |
| ----------------- | ---------------------------------------------------- |
| Take Snapshot     | Capture current GC memory + tracked table sizes      |
| Force GC          | Run `collectgarbage("collect")` and report freed mem |
| Diff First ↔ Last | Switch to diff view comparing first & last snapshots |
| Show List         | Switch back to snapshot list view                    |
| Clear             | Remove all snapshots                                 |
| Export            | Save snapshots to a JSON file via save dialog        |

## Desktop UI

### Snapshot list view

| Column         | Description                          |
| -------------- | ------------------------------------ |
| #              | Snapshot ID                          |
| Label          | Snapshot label                       |
| GC Memory      | Total Lua GC memory at snapshot time |
| Δ vs Prev      | Memory change from previous snapshot |
| Tracked Tables | Summary of tracked tables and counts |
| Time (s)       | Game time when snapshot was taken    |

### Diff view

| Column     | Description                    |
| ---------- | ------------------------------ |
| Metric     | GC Memory or table name        |
| Snapshot A | Value in earlier snapshot      |
| Snapshot B | Value in later snapshot        |
| Delta      | Difference (with sign)         |
| Status     | `▲ grew`, `▼ shrunk`, `— same` |

## Tips for Finding Leaks

1. Take a snapshot at a **known-clean state** (e.g., main menu)
2. Play through a level or trigger the suspected leak scenario
3. Return to the clean state
4. Take another snapshot
5. **Diff** — if GC memory or table sizes grew, you have a leak
6. Use **Auto Interval** (e.g., every 10s) to watch growth over time
7. **Force GC** before snapshots to exclude dead-but-uncollected objects
