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

The desktop Profiler tab is organized around capture sessions. Use **Record Capture** to start collecting instrumented samples, **Finish Capture** to freeze the run, and **Record New Capture** to reset and start fresh. The capture header summarizes elapsed time, total measured work, sample count, and the hottest function.

The **Hotspots** panel highlights the top functions by captured time before you dive into the table. Click a hotspot to focus the result list, save named snapshots for before/after comparisons, then use the diff selector, filters, sorting, and JSON export for deeper analysis. While stopped, wrapped functions call through normally without collecting timings. Large profiler payloads are deferred onto Feather's runtime update lane, so stop and snapshot actions do not serialize the capture inside the profiled function or debugger line hook.

Click a hotspot or table row to open the **Run Comparison** drawer for that function. Feather keeps a bounded history of exact invocation samples for the current capture, so you can compare two runs directly, compare a run against the previous/first/best/median baseline, and see delta, percent change, ratio, and median distance. The run strip has its own zoom and horizontal scroll controls so long captures stay inspectable without widening the drawer. Snapshot diffs remain aggregate-only; detailed run strips apply to the current capture until you reset or start a new capture.

## Debugger probes

The Debugger source view can start, stop, or snapshot the profiler from specific source lines. Use the stopwatch gutter beside breakpoints to add a probe:

- **Start profiling here** starts `DEBUGGER.profiler`.
- **Stop profiling here** stops it and schedules the latest profiler state for upload.
- **Snapshot here** records a named snapshot without pausing execution.
- **Profile function here** installs a wrapper for supported global/table functions, equivalent to assigning `target = DEBUGGER.profiler:wrap(label, target)`.

Probes are explicit capture controls. Start/stop/snapshot probes reuse the debugger's existing line hook and do not add a separate call/return `debug.sethook`, so they are lighter and safer than global hook profilers. Profile Function probes wrap resolvable `_G` table targets as soon as they sync to the game; locals and closures still need manual `wrap`, `begin`, or `finish` instrumentation.

Legacy `pluginManager:getPlugin("profiler")` access is no longer supported. Remove `profiler` from plugin include lists and migrate instrumentation to `DEBUGGER.profiler`.
