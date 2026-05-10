local FeatherDebugger = require("feather")
local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")
local FeatherPluginManager = require("feather.plugin_manager")

local state = {
  enabled = true,
  filter = "player",
  mode = "normal",
  clicks = 0,
  progress = 0,
}

local ExampleUiPlugin = Class({
  __includes = Base,
  init = function(self, config)
    Base.init(self, config)
  end,
})

function ExampleUiPlugin:handleRequest(_request, feather)
  local ui = feather.ui

  return ui.render(ui.panel({
    title = "Declarative UI Example",
    ui.alert({
      title = "Live schema",
      value = "This plugin is rendered from Lua tables, not React code.",
    }),
    ui.row({
      ui.stat({ label = "Clicks", value = tostring(state.clicks), description = "Button actions" }),
      ui.stat({ label = "Mode", value = state.mode, description = "Select value" }),
      ui.stat({ label = "Filter", value = state.filter, description = "Input value" }),
    }),
    ui.progress({
      label = "Progress",
      value = state.progress,
      min = 0,
      max = 100,
    }),
    ui.tabs({
      ui.tab({
        id = "controls",
        title = "Controls",
        ui.column({
          ui.input({
            name = "filter",
            label = "Filter",
            value = state.filter,
            placeholder = "Type a filter",
          }),
          ui.switch({
            name = "enabled",
            label = "Enabled",
            checked = state.enabled,
            description = "Toggles progress animation.",
          }),
          ui.select({
            name = "mode",
            label = "Mode",
            value = state.mode,
            options = {
              { label = "Normal", value = "normal" },
              { label = "Slow", value = "slow" },
              { label = "Fast", value = "fast" },
            },
          }),
          ui.row({
            ui.button({ label = "Increment", action = "increment" }),
            ui.button({ label = "Reset", action = "reset", variant = "outline" }),
          }),
        }),
      }),
      ui.tab({
        id = "notes",
        title = "Notes",
        ui.list({
          ui.text({ value = "Forms update plugin params through handleParamsUpdate()." }),
          ui.text({ value = "Buttons call handleActionRequest()." }),
          ui.text({ value = "The renderer can evolve without plugins importing React." }),
        }),
        ui.link({
          label = "Plugin UI docs",
          href = "https://kyonru.github.io/feather/plugin-ui/",
        }),
      }),
    }),
  }))
end

function ExampleUiPlugin:handleActionRequest(request)
  local action = request.params and request.params.action

  if action == "increment" then
    state.clicks = state.clicks + 1
    return true
  end

  if action == "reset" then
    state.clicks = 0
    state.progress = 0
    return true
  end
end

function ExampleUiPlugin:handleParamsUpdate(request)
  local params = request.params or {}

  if params.filter then
    state.filter = params.filter
  end
  if params.enabled then
    state.enabled = params.enabled == "true"
  end
  if params.mode then
    state.mode = params.mode
  end
end

function ExampleUiPlugin:getConfig()
  return {
    type = "plugin-ui-example",
    icon = "panel-top",
    tabName = "Plugin UI",
    actions = {},
  }
end

DEBUGGER = FeatherDebugger({
  sessionName = "Plugin UI Example",
  deviceId = "plugin-ui-example",
  wrapPrint = true,
  defaultObservers = true,
  debug = true,
  plugins = {
    FeatherPluginManager.createPlugin(ExampleUiPlugin, "plugin-ui-example", {}),
  },
})

function love.update(dt)
  DEBUGGER:update(dt)

  if state.enabled then
    local speed = state.mode == "fast" and 40 or state.mode == "slow" and 8 or 20
    state.progress = (state.progress + dt * speed) % 100
  end

  DEBUGGER:observe("plugin_ui.filter", state.filter)
  DEBUGGER:observe("plugin_ui.enabled", state.enabled)
  DEBUGGER:observe("plugin_ui.mode", state.mode)
  DEBUGGER:observe("plugin_ui.progress", math.floor(state.progress))
end

function love.draw()
  love.graphics.clear(0.08, 0.09, 0.11)
  love.graphics.setColor(1, 1, 1)
  love.graphics.print("Plugin UI Example", 24, 24)
  love.graphics.print("Open the Feather desktop Plugin UI tab.", 24, 48)
  love.graphics.print("Press Escape to quit.", 24, 72)
end

function love.keypressed(key)
  if key == "escape" then
    DEBUGGER:finish()
    love.event.quit()
  end
end
