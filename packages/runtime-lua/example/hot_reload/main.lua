local FeatherDebugger = require("feather")
local FeatherPluginManager = require("feather.plugin_manager")
local HotReloadPlugin = require("plugins.hot-reload")

local state = {
  time = 0,
  pulse = 0,
}

local function gameplay()
  return require("example.hot_reload.gameplay")
end

function love.load()
  state.font = love.graphics.newFont(28)
  state.smallFont = love.graphics.newFont(14)

  DEBUGGER = FeatherDebugger({
    debug = true,
    host = "127.0.0.1",
    port = 4004,
    sessionName = "Hot Reload Example",
    deviceId = "hot-reload-example",
    sampleRate = 0.5,
    wrapPrint = true,
    defaultObservers = true,
    captureScreenshot = false,
    __DANGEROUS_INSECURE_CONNECTION__ = true, -- Only for development; requires matching setting in plugin
    plugins = {
      FeatherPluginManager.createPlugin(HotReloadPlugin, "hot-reload", {
        -- Development-only remote code execution. Keep this disabled in real
        -- projects unless you explicitly need it, and never ship with it on.
        enabled = true,
        -- Use the smallest allowlist possible. This example intentionally
        -- allows exactly one module.
        allow = {
          "example.hot_reload.gameplay",
        },
        deny = {
          "main",
          "conf",
          "feather.*",
        },
        -- Persisting patches writes Lua code into the LÖVE save directory.
        -- Leave this false unless you intentionally want hot patches to survive
        -- app restarts during development.
        persistToDisk = false,
        clearOnBoot = true,
        requireLocalNetwork = true,
      }),
    },
    debugger = {
      enabled = true,
    },
  })

  print("[Hot Reload] Open Debugger, select example/hot_reload/gameplay.lua, then press Reload.")
end

function love.update(dt)
  gameplay().update(state, dt)

  DEBUGGER:observe("hot_reload.module", "example.hot_reload.gameplay")
  DEBUGGER:observe("hot_reload.time", string.format("%.2f", state.time))
  DEBUGGER:observe("hot_reload.pulse", string.format("%.2f", state.pulse))
  DEBUGGER:update(dt)
end

function love.draw()
  gameplay().draw(state)

  love.graphics.setColor(1, 1, 1, 0.75)
  love.graphics.setFont(state.smallFont)
  love.graphics.print("Run: love src-lua --hot-reload", 18, 18)
  love.graphics.print("Debugger file: example/hot_reload/gameplay.lua", 18, 40)
  love.graphics.print("Try changing title, message, color, or speed.", 18, 62)
end

function love.keypressed(key)
  if key == "escape" then
    DEBUGGER:finish()
    love.event.quit()
  end
end
