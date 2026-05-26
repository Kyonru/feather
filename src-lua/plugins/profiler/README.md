# ProfilerPlugin

The `ProfilerPlugin` is a plugin for the [Feather Debugger](https://github.com/Kyonru/feather) that lets you **measure and compare the performance** of individual functions in your LÖVE project. Wrap any function to track call count, total time, average time, min, max, percent of captured time, and calls per second.

## 📦 Installation

The plugin lives in `feather/plugins/profiler/`. Require it from your project:

```lua
local ProfilerPlugin = require("feather.plugins.profiler")
```

## ⚙️ Configuration

Register the plugin using `FeatherPluginManager.createPlugin`:

```lua
FeatherPluginManager.createPlugin(ProfilerPlugin, "profiler")
```

No additional options are required.

## 🔍 How It Works

### Wrapping Functions

Call `profiler:wrap(name, fn)` to create an instrumented version of any function. The wrapper is transparent — it calls the original function and returns all of its results while recording timing data. Wrapped functions are error-safe: failures are re-raised with traceback details after the profiler records the elapsed time.

```lua
local profiler = debugger:getPlugin("profiler")

-- Wrap a function
local wrappedUpdate = profiler:wrap("World:update", world.update)

-- Use the wrapped version in place of the original
function love.update(dt)
  wrappedUpdate(world, dt)
end
```

Each wrapped function tracks:

| Metric    | Description                 |
| --------- | --------------------------- |
| **Calls** | Total number of invocations |
| **Total** | Cumulative wall-clock time  |
| **Avg**   | Average time per call       |
| **Min**   | Fastest recorded call       |
| **Max**   | Slowest recorded call       |
| **% Total** | Share of captured profiler time |
| **Calls/s** | Calls per second in the capture window |
| **Group** | Prefix before `.` or `:` in the sample name |

### Scoped Samples

For work that is easier to bracket than wrap, use `begin` and `finish` with the same name:

```lua
profiler:begin("physics.step")
world:step(dt)
profiler:finish("physics.step")
```

Scoped samples feed the same profiler table as wrapped functions, including groups, totals, averages, percent, and calls per second.

### Recursion Handling

If a wrapped function calls itself recursively, only the outermost invocation is timed. This avoids double-counting nested calls.

### Timer Resolution

The plugin automatically selects the best available timer:

1. `socket.gettime` (LuaSocket) — microsecond precision
2. `love.timer.getTime` — LÖVE's high-resolution timer
3. `os.clock` — fallback

### Debugger Metadata (`getConfig`)

- Type: `profiler`
- Icon: `timer`
- Tab name: `Profiler`

## 🎮 Actions

The plugin adds an interactive action to the Feather UI:

- **Start** → resumes profiling new calls.
- **Stop** → pauses profiling while preserving captured rows.
- **Snapshot** → saves a named capture snapshot for before/after comparisons.
- **Reset** → clears all collected profiling data (call counts and timings are zeroed out).

Recording is enabled by default for backwards compatibility. The dedicated **Performance → Profiler** view adds search, sorting, group filters, one-call hiding, before/after snapshots, diff columns, and JSON export while `/plugins/profiler` remains available as a generic plugin table.

### Sorting

The desktop app can update sorting via plugin params:

- `sortBy` — column key to sort by (default: `totalTime`)
- `sortDesc` — sort direction (default: `true`)

## 📊 Example

```lua
local ProfilerPlugin = require("feather.plugins.profiler")

local debugger = FeatherDebugger({
  debug = true,
  plugins = {
    FeatherPluginManager.createPlugin(ProfilerPlugin, "profiler"),
  },
})

local profiler = debugger:getPlugin("profiler")

-- Wrap expensive functions
local updatePhysics = profiler:wrap("updatePhysics", updatePhysics)
local renderScene   = profiler:wrap("renderScene", renderScene)
local runAI         = profiler:wrap("runAI", runAI)

function love.update(dt)
  debugger:update(dt)
  updatePhysics(dt)
  runAI(dt)
end

function love.draw()
  renderScene()
end
```
