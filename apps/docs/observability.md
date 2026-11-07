# Observability

The **Observability** page lets you inspect values the game explicitly exposes. Use it for player state, camera state, gameplay flags, counters, and other runtime data you want to watch while the game runs.

## Observe Values

Register values from Lua:

```lua
debugger:observe("player", player)
debugger:observe("camera", camera)
debugger:observe("physics.contacts", contacts)
```

The page tracks first seen, last seen, last changed, value size, change counts, and recent value history for each observer. Key prefixes such as `player.x`, `player.health`, or `physics.contacts` become useful group filters.

## Watch Cheap Values

Prefer `watch` for small values that can be read on demand:

```lua
debugger:watch("player.health", function()
  return player.health
end)
```

Watches are evaluated when Observability asks for data instead of forcing Feather to serialize larger tables in the background. This is the preferred shape for values you know you will inspect often.

## Panel-Driven Refresh

Observability is dormant when you are not using it. Logs, errors, debugger control, and a low-rate performance heartbeat stay live, but observer serialization wakes up when the Observability page is opened or when another explicit workflow asks for observer data.

Opening the page sends runtime interest and requests a fresh payload. Leaving the page lets Feather stop the expensive observer work again.

## Table Limits And Large Values

Large tables can be expensive to serialize. Feather applies safety limits for depth, key count, and payload size so one huge table does not stall the game. Long strings can be sent through the hybrid binary path according to `binaryTextThreshold`.

For complex game state:

- expose focused keys instead of whole globals;
- use `watch` for scalar values;
- group related values with prefixes;
- use Console pins for short-lived inspection;
- avoid observing large entity lists every frame unless you are actively debugging them.

## Diffs, History, And Export

Use search, group filters, sorting, and changed markers to find values that moved recently. Inspect value history and diffs when you need to know what changed between updates, then export the visible observer set as JSON for sharing or offline comparison.

