# Feather Plugins

Feather plugins are any Lua modules that extend the functionality of the debugger.

## Creating a plugin

To create a plugin, you need to create a Lua module that exports a table with the following functions:

- `init(config)`: This function is called when the plugin is initialized.
- `update(dt, feather)`: This function is called every frame.
- `onerror(msg, feather)`: This function is called when an error occurs. Errors in this function will close the game abruptly.
- `handleRequest(request, feather)`: This function is called when a request is received.
- `handleActionRequest(request, feather)`: This function is called when an action request is received.
- `handleParamsUpdate(request, feather)`: This function is called when a params update request is received.
- `finish(feather)`: This function is called when the server is closed.
- `getConfig()`: This function returns the configuration for the plugin. Sent to the client app.

To help with the implementation, Feather provides the `FeatherPlugin` class, which you can extend to create your plugin.

```lua
local FeatherPlugin = require("feather.plugins.base")

local MyPlugin = Class({
  __includes = FeatherPlugin,
})

function MyPlugin:init(config)
  -- Do something with the config
end

function MyPlugin:update(dt, feather)
  -- Do something with the dt and feather
end

function MyPlugin:onerror(msg, feather)
  -- Do something with the msg and feather
end

function MyPlugin:handleRequest(request, feather)
  -- Do something with the request and feather
end

function FeatherPlugin:handleActionRequest(request, feather)
  --- Do something with the request and feather
end

function FeatherPlugin:handleParamsUpdate(request, feather)
  --- Do something with the request and feather
  return {}
end

function MyPlugin:finish(feather)
  -- Do something with the feather
end

function MyPlugin:getConfig()
  -- Return the configuration for the plugin
  return {
    type = "my-plugin",
    color = "#ff0000",
    icon = "my-plugin-icon",
  }
end

return MyPlugin
```

### Plugin lifecycle

The FeatherPluginManager will handle the lifecycle of the plugin and call the appropriate functions. Here's a breakdown of the plugin lifecycle:

#### Initialization

- `init(config)`: This function is called when the plugin is initialized.
- `getConfig()`: This function returns the configuration for the plugin when the Feather app is initialized. Sent to the client app.

#### Request Handling

- `handleRequest(request, feather)`: This function is called when a request is received. (GET)
- `handleActionRequest(request, feather)`: This function is called when an action request is received. (POST)
- `handleParamsUpdate(request, feather)`: This function is called when a params update request is received. (PUT)

#### Update

- `update(dt, feather)`: This function is called every frame. (Called after the request handling)

#### Error Handling

- `onerror(msg, feather)`: This function is called when an error occurs. Errors in this function will close the game abruptly. No frame is rendered after this function is called.

#### finish

- `finish(feather)`: This function is called when the server is closed.

## Registering a plugin

To register a plugin, you need to create an instance of it and pass it to the FeatherPluginManager. The FeatherPluginManager will handle the lifecycle of the plugin and call the appropriate functions.

```lua
local MyPlugin = require("my-plugin")

local plugin = FeatherPluginManager.createPlugin(MyPlugin, "my-plugin", {
  -- Plugin options
})
```

## Plugin options

The plugin options are passed to the plugin's constructor. Here's an example of a plugin with options:

```lua
local MyPlugin = require("my-plugin")

local plugin = FeatherPluginManager.createPlugin(MyPlugin, "my-plugin", {
  option1 = "value1",
  option2 = "value2",
})
```

### Feather Options

By default, every plugin has the following properties available:

- `self.logger`: A logger that logs messages to the Feather logger.
- `self.observer`: A logger that logs messages to the Feather observer.

## Plugin configuration

Feather plugins can return configuration that is sent to the client. This configuration is used to display the plugin in the plugins tab.

Here's an example of a plugin with configuration:

```lua
local MyPlugin = require("my-plugin")

function MyPlugin:getConfig()
  return {
    type = "my-plugin",
    color = "#ff0000",
    icon = "my-plugin-icon",
  }
end
```

## Using Plugin Actions

Feather plugins can also be used to trigger actions from game code at runtime.

```lua
local debugger = FeatherDebugger({
  debug = true,
  plugins = {
    FeatherPluginManager.createPlugin(ScreenshotPlugin, "screenshots", {
      screenshotDirectory = "screenshots",
      fps = 30,
      gifDuration = 5,
    }),
  },
})

function love.keypressed(key)
  if key == "f1" then
    debugger:action("screenshots", "screenshot", {})
  elseif key == "f2" then
    debugger:action("screenshots", "gif", { duration = 3, fps = 60 })
  end
end
```

## Plugin examples

Here are some examples of Feather plugins:

- [Hump's Signal Plugin](../src-lua/plugins/hump/signal/README.md)
- [Lua State Machine Plugin](../src-lua/plugins/lua-state-machine/README.md)
- [Screenshot Plugin](../src-lua/plugins/screenshots/README.md)

## Plugin documentation

Each plugin should have a README file that explains how to use it and provides examples.
