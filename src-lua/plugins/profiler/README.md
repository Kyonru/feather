# ProfilerPlugin

The `ProfilerPlugin` is a plugin for the [Feather Debugger](https://github.com/Kyonru/feather) that lets you **measure and compare the performance** of individual functions in your LÖVE project. Wrap any function to track call count, total time, average time, min, and max — all displayed in a sortable table inside the Feather desktop app.

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

Call `profiler:wrap(name, fn)` to create an instrumented version of any function. The wrapper is transparent — it calls the original function and returns all of its results while recording timing data.

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

- **Reset** → clears all collected profiling data (call counts and timings are zeroed out).

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
