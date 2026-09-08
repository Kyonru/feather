# Performance

The **Performance** page helps separate game cost from Feather cost. It includes runtime health charts, Feather overhead telemetry, and the core profiler capture workspace.

## Health

The **Health** tab shows live runtime signals such as FPS, frame time, memory, disk activity, draw calls, canvas switches, shader switches, and texture memory.

Use pause/follow when a hitch happens, inspect recent spikes, then export the visible JSON window if you need to compare the data with another run.

## Overhead

The **Overhead** tab shows Feather's own runtime cost. It reports coarse timing and transport metrics such as update/draw cost, callback rehook checks, logger work, assets, plugin update/payload work, observers, profiler pushes, transport, GC, message counts, serialized bytes, binary bytes, deferred tasks, budget misses, and top plugin costs.

Use this tab when a connected game feels slower with Feather attached. If the overhead is high, close panels you are not using, stop explicit recordings/previews, or suspend the runtime from the session bar.

## Runtime Budget

Feather spreads non-critical work across frames using a runtime budget. Critical messages such as auth, hello/bye, fatal errors, command responses, debugger control, runtime suspend/resume, and explicit preview clear/hide actions remain immediate.

Non-critical work such as observer payloads, asset payloads, plugin UI pushes, profiler live uploads, performance details, binary drains, and GC steps can be deferred when the budget is exhausted.

Configure the budget from `feather.config.lua` only when you need to tune development overhead:

```lua
return {
  runtimeBudget = {
    maxFrameMs = 0.5,
    maxMessagesPerFrame = 20,
    maxSerializedBytesPerFrame = 32 * 1024,
  },
}
```

## Profiler

Use the core profiler in **Performance -> Profiler** for instrumented hot paths. It is available in every debug session and stays idle until you press **Record Capture** or call `DEBUGGER.profiler:start()`.

```lua
local updateWorld = DEBUGGER.profiler:wrap("World:update", updateWorld)

DEBUGGER.profiler:start()
DEBUGGER.profiler:begin("physics.step")
-- work
DEBUGGER.profiler:finish("physics.step")
```

The profiler workspace can record/finish captures, show top hotspots, open a per-function run comparison drawer, group rows, filter rows, save named snapshots, compare aggregate diffs, and export JSON. Capture uploads are deferred onto Feather's runtime update lane so stop/snapshot probes do not serialize large profiler payloads inside the measured function.

Debugger profiler probes can start, stop, snapshot, or wrap supported global/table functions from source lines. See [Profiler](profiler.md) and [Debugger](debugger.md) for the full workflow.

