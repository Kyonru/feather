# LuaStateMachinePlugin

The `LuaStateMachinePlugin` is a plugin for the [Feather Debugger](https://github.com/Kyonru/feather) that integrates with the [`lua-state-machine`](https://github.com/kyleconroy/lua-state-machine) library (or any compatible state machine implementation).
It automatically observes and tracks the current state of created state machine instances, making it easier to debug and visualize state transitions inside Feather.

## 📦 Installation

Place `lua-state-machine.lua` in your `feather/plugins/` directory (or wherever you keep your Feather plugins). You might need to modify the require path to match your project structure.

```lua
local LuaStateMachinePlugin = require("feather.plugins.lua-state-machine")
```

## ⚙️ Configuration

Register the plugin using the FeatherPluginManager.createPlugin function:

```lua
FeatherPluginManager.createPlugin(LuaStateMachinePlugin, "lua-state-machine", {
  machine = machine,
})
```

## Options

`machine` (required):
The state machine module or instance you want the plugin to wrap.

The plugin overrides the machine.create method to intercept and track all created state machine instances.

## 🔍 How It Works

### Hook into machine.create

- Every time a state machine is created, the plugin stores a reference to it inside self.states.

### Observation

- On each update cycle, the plugin observes the current state of every tracked machine and reports it to Feather.

Observed variables will appear in the observers tab of Feather:

### Debugger Metadata (getConfig)

- Type: `lua-state-machine`
- Color: `#253900`
- Icon: `workflow`

## 📊 Example

```lua
local machine = require("statemachine")

local debugger = FeatherDebugger({
  debug = true,
  plugins = {
    FeatherPluginManager.createPlugin(LuaStateMachinePlugin, "lua-state-machine", {
      machine = machine,
    }),
  },
})

function love.load()
  local machine = fsm.create({
    initial = "idle",
    events = {
      { name = "start", from = "idle", to = "running" },
      { name = "pause", from = "running", to = "paused" },
      { name = "resume", from = "paused", to = "running" },
    },
  })

  machine:start()
  machine:pause()
end
```

## ✅ Summary

The `LuaStateMachinePlugin` is useful for:

- Debugging multiple state machines at once.
- Tracking current state transitions in real-time.
- Keeping game/application flow transparent inside Feather.
