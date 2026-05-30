# Core Profiler

The Profiler is a core Feather runtime service, not a plugin. It is available as `DEBUGGER.profiler` in every debug session and stays stopped until you explicitly start a capture from the **Performance -> Profiler** tab or from Lua.

```lua
local updateWorld = DEBUGGER.profiler:wrap("World:update", updateWorld)

DEBUGGER.profiler:start()
DEBUGGER.profiler:begin("physics.step")
-- work
DEBUGGER.profiler:finish("physics.step")
```

Use `wrap(name, fn)` for functions you want to measure repeatedly, or pair `begin(name)` and `finish(name)` around scoped work. Names are grouped by their first `.` or `:` prefix, so `World:update` appears in the `World` group.

The desktop Profiler tab can start, stop, reset, snapshot, diff, filter, sort, and export captures. While stopped, wrapped functions call through normally without collecting timings.

## Debugger probes

The Debugger source view can start, stop, or snapshot the profiler from specific source lines. Use the stopwatch gutter beside breakpoints to add a probe:

- **Start profiling here** starts `DEBUGGER.profiler`.
- **Stop profiling here** stops it and pushes the latest profiler state.
- **Snapshot here** records a named snapshot without pausing execution.

Probes are explicit line-triggered capture controls. They reuse the debugger's existing line hook and do not add a separate call/return `debug.sethook`, so they are lighter and safer than global hook profilers. Add normal `wrap`, `begin`, and `finish` instrumentation around the code you want measured, then use probes to control when capture begins and ends.

Legacy `pluginManager:getPlugin("profiler")` access is no longer supported. Remove `profiler` from plugin include lists and migrate instrumentation to `DEBUGGER.profiler`.
