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

    inputReplayFeather:update(0)
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
    inputReplayFeather:update(0)
    assertEqual(lateReplayOverrideCount, 2, "input replay replays through late keypressed override")
    assertEqual(replay.replaying, false, "input replay stops after queued replay events finish")
  end, debug.traceback)

  love.keypressed = originalReplayKeypressed
  inputReplayFeather:finish()

  if not ok then
    error(result, 0)
  end
end

return InputReplaySuite
