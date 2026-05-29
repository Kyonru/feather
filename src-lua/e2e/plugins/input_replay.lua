local FeatherDebugger = require("feather")
local FeatherPluginManager = require("feather.plugin_manager")
local InputReplayPlugin = require("plugins.input-replay")

local InputReplaySuite = {
  id = "input-replay",
}

function InputReplaySuite.run(assertEqual, assertTruthy)
  local originalReplayKeypressed = love.keypressed
  local preReplayRecordCount = 0
  local lateRecordOverrideCount = 0
  local lateReplayOverrideCount = 0
  local originalKeyboardIsDown = love.keyboard and love.keyboard.isDown
  local originalKeyboardIsScancodeDown = love.keyboard and love.keyboard.isScancodeDown
  local originalMouseIsDown = love.mouse and love.mouse.isDown
  local originalMouseGetPosition = love.mouse and love.mouse.getPosition
  local originalMouseGetX = love.mouse and love.mouse.getX
  local originalMouseGetY = love.mouse and love.mouse.getY

  love.keypressed = function()
    preReplayRecordCount = preReplayRecordCount + 1
  end

  local inputReplayFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Input Replay E2E",
    deviceId = "input-replay-e2e",
    assetPreview = false,
    plugins = {
      FeatherPluginManager.createPlugin(InputReplayPlugin, "input-replay", {
        captureKeys = true,
        captureMouse = false,
        captureTouch = false,
        captureJoystick = false,
      }),
    },
    debugger = {
      enabled = false,
    },
  })

  local ok, result = xpcall(function()
    local inputReplayPlugin = inputReplayFeather.pluginManager:getPlugin("input-replay")
    local config = inputReplayFeather:__getConfig()
    local replay = inputReplayPlugin and inputReplayPlugin.instance

    assertTruthy(inputReplayPlugin, "plugin smoke suite registers input-replay")
    assertTruthy(replay, "plugin smoke suite instantiates input-replay")
    assertTruthy(config.plugins["input-replay"], "plugin smoke suite exposes input-replay in config")
    assertEqual(inputReplayPlugin.identifier, "input-replay", "plugin smoke suite keeps identifier for input-replay")
    assertTruthy(replay, "input replay plugin instance is available")

    replay:startRecording()
    love.keypressed("a", "a", false)
    assertEqual(preReplayRecordCount, 1, "input replay recording preserves pre-hook keypressed override")
    assertEqual(#replay.events, 1, "input replay records initial keypressed event")

    love.keypressed = function()
      lateRecordOverrideCount = lateRecordOverrideCount + 1
    end

    inputReplayFeather:update(inputReplayFeather.callbackHookInterval or 0.25)
    love.keypressed("b", "b", false)
    assertEqual(lateRecordOverrideCount, 1, "input replay recording survives late keypressed override")
    assertEqual(#replay.events, 2, "input replay keeps recording after late keypressed override")

    replay:stopRecording()
    replay.events = {
      { time = 0, type = "keypressed", args = { "x", "x", false } },
      { time = 0, type = "keypressed", args = { "y", "y", false } },
    }

    love.keypressed = function()
      lateReplayOverrideCount = lateReplayOverrideCount + 1
    end

    replay:startReplay()
    inputReplayFeather:update(inputReplayFeather.callbackHookInterval or 0.25)
    assertEqual(lateReplayOverrideCount, 2, "input replay replays through late keypressed override")
    assertEqual(replay.replaying, false, "input replay stops after queued replay events finish")

    replay.events = {
      { time = 0, type = "keypressed", args = { "right", "d", false } },
      { time = 999, type = "keyreleased", args = { "right", "d" } },
    }
    replay:startReplay()
    inputReplayFeather:update(0)
    assertEqual(love.keyboard.isDown("right"), true, "input replay exposes held keys to love.keyboard.isDown")
    assertEqual(love.keyboard.isScancodeDown("d"), true, "input replay exposes held scancodes to love.keyboard.isScancodeDown")
    replay:stopReplay()

    replay.events = {
      { time = 0, type = "mousepressed", args = { 42, 64, 1, false, 1 } },
      { time = 999, type = "mousereleased", args = { 42, 64, 1, false, 1 } },
    }
    replay:startReplay()
    inputReplayFeather:update(0)
    local mouseX, mouseY = love.mouse.getPosition()
    assertEqual(love.mouse.isDown(1), true, "input replay exposes held mouse buttons to love.mouse.isDown")
    assertEqual(mouseX, 42, "input replay exposes replay mouse x position")
    assertEqual(mouseY, 64, "input replay exposes replay mouse y position")
    assertEqual(love.mouse.getX(), 42, "input replay exposes replay mouse x getter")
    assertEqual(love.mouse.getY(), 64, "input replay exposes replay mouse y getter")
    replay:stopReplay()
  end, debug.traceback)

  love.keypressed = originalReplayKeypressed
  if love.keyboard then
    love.keyboard.isDown = originalKeyboardIsDown
    love.keyboard.isScancodeDown = originalKeyboardIsScancodeDown
  end
  if love.mouse then
    love.mouse.isDown = originalMouseIsDown
    love.mouse.getPosition = originalMouseGetPosition
    love.mouse.getX = originalMouseGetX
    love.mouse.getY = originalMouseGetY
  end
  inputReplayFeather:finish()

  if not ok then
    error(result, 0)
  end
end

return InputReplaySuite
