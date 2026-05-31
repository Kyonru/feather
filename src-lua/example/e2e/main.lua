local FeatherDebugger = require("feather")
local Class = require("feather.lib.class")
local FeatherPluginBase = require("feather.core.base")
local FeatherPluginManager = require("feather.plugin_manager")
local HotReloadPlugin = require("plugins.hot-reload")
local PluginE2ESuite = require("e2e.plugins")
local json = require("feather.lib.json")

local E2EPlugin = Class({
  __includes = FeatherPluginBase,
  init = function(self, config)
    FeatherPluginBase.init(self, config)
  end,
})

function E2EPlugin:getConfig()
  return {
    type = "e2e",
    tabName = "E2E Plugin",
    icon = "puzzle",
  }
end

local pushRequestCount = 0
local PushCountingPlugin = Class({
  __includes = FeatherPluginBase,
})

function PushCountingPlugin:init(config)
  FeatherPluginBase.init(self, config)
end

function PushCountingPlugin:handleRequest()
  pushRequestCount = pushRequestCount + 1
  return {
    type = "push-counting",
    label = self.options.label,
  }
end

function PushCountingPlugin:getPushInterval()
  return tonumber(self.options.pushInterval) or 0
end

local results = {}

local function record(name)
  results[#results + 1] = name
  print("[Lua E2E] PASS " .. name)
end

local function assertEqual(actual, expected, name)
  if actual ~= expected then
    error(string.format("%s: expected %s, got %s", name, tostring(expected), tostring(actual)), 2)
  end
  record(name)
end

local function assertTruthy(value, name)
  if not value then
    error(name .. ": expected truthy value", 2)
  end
  record(name)
end

local function assertArrayEqual(actual, expected, name)
  if #actual ~= #expected then
    error(string.format("%s: expected %d values, got %d", name, #expected, #actual), 2)
  end

  for index = 1, #expected do
    if actual[index] ~= expected[index] then
      error(
        string.format("%s: expected [%s], got [%s]", name, table.concat(expected, ", "), table.concat(actual, ", ")),
        2
      )
    end
  end

  record(name)
end

local callbackOrder = {}
local stressHookCount = 0
local stressHookSum = 0
local stressKeyCount = 0
local stressKeySum = 0
local stressMouseMoveCount = 0
local stressMouseMoveSum = 0

local OrderedPlugin = Class({
  __includes = FeatherPluginBase,
})

function OrderedPlugin:init(config)
  FeatherPluginBase.init(self, config)

  if self.options.mode == "bus" then
    config.callbacks.register("draw", function()
      callbackOrder[#callbackOrder + 1] = self.options.label
    end, self.options.priority ~= nil and { priority = self.options.priority } or nil)
  end
end

function OrderedPlugin:onDraw()
  if self.options.mode == "legacy" then
    callbackOrder[#callbackOrder + 1] = self.options.label
  end
end

local StressPlugin = Class({
  __includes = FeatherPluginBase,
})

function StressPlugin:init(config)
  FeatherPluginBase.init(self, config)

  config.callbacks.register("draw", function()
    stressHookCount = stressHookCount + 1
    stressHookSum = stressHookSum + self.options.index
  end)

  config.callbacks.register("keypressed", function()
    stressKeyCount = stressKeyCount + 1
    stressKeySum = stressKeySum + self.options.index
  end)

  config.callbacks.register("mousemoved", function()
    stressMouseMoveCount = stressMouseMoveCount + 1
    stressMouseMoveSum = stressMouseMoveSum + self.options.index
  end)
end

local function resetCallbackOrder()
  for index = #callbackOrder, 1, -1 do
    callbackOrder[index] = nil
  end
end

local function resetStressHooks()
  stressHookCount = 0
  stressHookSum = 0
  stressKeyCount = 0
  stressKeySum = 0
  stressMouseMoveCount = 0
  stressMouseMoveSum = 0
end

local function assertDrawOrder(feather, expected, name)
  resetCallbackOrder()
  love.draw()
  assertArrayEqual(callbackOrder, expected, name)
  feather:finish()
end

local function run()
  local feather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Lua E2E",
    deviceId = "lua-e2e",
    assetPreview = false,
    plugins = {
      FeatherPluginManager.createPlugin(E2EPlugin, "api-compatible", {}, false, {}, {
        api = FeatherDebugger.API,
        name = "API Compatible",
        version = "1.0.0",
      }),
      FeatherPluginManager.createPlugin(E2EPlugin, "api-incompatible", {}, false, {}, {
        minApi = FeatherDebugger.API + 1,
        name = "API Incompatible",
        version = "1.0.0",
      }),
      FeatherPluginManager.createPlugin(HotReloadPlugin, "hot-reload", {
        enabled = true,
        allow = {
          "example.e2e.reloadable",
          "feather.*",
          "lib.*",
          "plugins.*",
        },
        deny = {
          "main",
          "conf",
          "feather.*",
        },
        persistToDisk = false,
        clearOnBoot = true,
        requireLocalNetwork = false,
      }),
    },
    debugger = {
      enabled = false,
    },
  })

  assertTruthy(feather, "feather creates debugger instance")
  assertTruthy(feather.hotReloader, "hot reloader is available")
  local helloConfig = feather:__getConfig()
  local envGamePath = os.getenv("FEATHER_GAME_PATH")
  if envGamePath and #envGamePath > 0 then
    assertEqual(helloConfig.root_path, envGamePath, "CLI run config root_path uses real game path")
    assertEqual(helloConfig.sourceDir, envGamePath, "CLI run config sourceDir uses real game path")
  end
  feather.featherDebugger.sourceRoot = "/tmp/feather-game"
  assertEqual(
    feather.featherDebugger:_normalizeFile("@/tmp/feather-game/main.lua"),
    "main.lua",
    "debugger normalizes CLI absolute main.lua to relative path"
  )
  assertEqual(
    feather.featherDebugger:_normalizeFile("@/tmp/feather-game/lib/player.lua"),
    "lib/player.lua",
    "debugger normalizes CLI absolute module paths to relative paths"
  )
  feather.featherDebugger.shimRoot = "/tmp/feather-shim"
  assertEqual(
    feather.featherDebugger:_normalizeFile("@/tmp/feather-shim/lib/player.lua"),
    "lib/player.lua",
    "debugger normalizes CLI shim module paths to relative paths"
  )
  local longSourceRoot = "/tmp/feather-long-source-root-with-enough-segments-to-force-lua-short-src-truncation/example/test_cli"
  local didPauseOnLongSource = false
  local originalDoPause = feather.featherDebugger._doPause
  feather.featherDebugger.sourceRoot = longSourceRoot
  feather.featherDebugger:setBreakpoints({
    { file = longSourceRoot .. "/main.lua", line = 2 },
  })
  feather.featherDebugger._doPause = function(_, info, line)
    didPauseOnLongSource = true
    assertEqual(line, 2, "debugger hook sees the expected long-source line")
    assertEqual(
      feather.featherDebugger:_normalizeFile(info.source or info.short_src or ""),
      "main.lua",
      "debugger hook uses untruncated source paths for long CLI roots"
    )
  end
  feather.featherDebugger:enable()
  local longChunk = assert(load("local value = 1\nvalue = value + 1\n", "@" .. longSourceRoot .. "/main.lua"))
  longChunk()
  feather.featherDebugger:disable()
  feather.featherDebugger._doPause = originalDoPause
  assertTruthy(didPauseOnLongSource, "debugger breakpoints match long untruncated source paths")
  feather.featherDebugger.sourceRoot = "/tmp/feather-game"
  feather.featherDebugger:setBreakpoints({
    { file = "@/tmp/feather-game/main.lua", line = 12.8 },
    { file = "", line = 0 },
  })
  local debuggerStatus = feather.featherDebugger:statusBody()
  assertEqual(debuggerStatus.breakpointCount, 1, "debugger status includes normalized breakpoint count")
  assertEqual(debuggerStatus.breakpoints[1].file, "main.lua", "debugger status includes normalized breakpoint file")
  assertEqual(debuggerStatus.breakpoints[1].line, 12, "debugger status includes normalized breakpoint line")
  assertEqual(#debuggerStatus.rejectedBreakpoints, 1, "debugger status includes rejected breakpoints")
  feather.featherDebugger:_sendBreakpointError("main.lua", 12, "bad +", "condition failed")
  debuggerStatus = feather.featherDebugger:statusBody()
  assertEqual(#debuggerStatus.breakpointErrors, 1, "debugger status includes condition errors")

  local sentDebuggerFrame
  local originalWsConnected = feather.wsConnected
  local originalWsClient = feather.wsClient
  feather.wsConnected = true
  feather.wsClient = {
    send = function(_, payload)
      local decoded = json.decode(payload)
      if decoded.type == "debugger:frame" then
        sentDebuggerFrame = decoded.data
      end
    end,
  }
  feather.featherDebugger.pauseId = 42
  feather.featherDebugger._pausedFrames = {
    {
      index = 0,
      file = "main.lua",
      line = 12,
      locals = { player = "table {2}" },
      upvalues = { config = "true" },
      binary = {},
    },
  }
  feather.featherDebugger:inspectFrame(0)
  assertTruthy(sentDebuggerFrame, "debugger frame inspection sends frame payload")
  assertEqual(sentDebuggerFrame.locals.player, "table {2}", "debugger frame inspection includes locals")
  assertEqual(sentDebuggerFrame.upvalues.config, "true", "debugger frame inspection includes upvalues")
  feather.wsConnected = originalWsConnected
  feather.wsClient = originalWsClient
  assertEqual(helloConfig.debugger.hotReload.enabled, true, "hello config includes hot reload state")
  assertEqual(helloConfig.plugins["api-compatible"].incompatible, false, "compatible plugin remains available")
  assertEqual(helloConfig.plugins["api-compatible"].disabled, false, "compatible plugin remains enabled")
  assertEqual(helloConfig.plugins["api-incompatible"].incompatible, true, "incompatible plugin is flagged")
  assertEqual(helloConfig.plugins["api-incompatible"].disabled, true, "incompatible plugin is disabled")
  assertTruthy(helloConfig.plugins["api-incompatible"].incompatibilityReason, "incompatible plugin includes reason")

  local moduleName = "example.e2e.reloadable"
  package.loaded[moduleName] = nil

  local ok, err = feather.hotReloader:reload(moduleName, "return { value = 1, label = 'first' }")
  assertEqual(ok, true, "hot reload accepts allowlisted module")
  assertEqual(err, nil, "hot reload success has no error")
  assertEqual(require(moduleName).value, 1, "reloaded module can be required")

  local migratedSource = [[
local M = { value = 2, label = "second" }

function M.__feather_reload(newModule, oldModule)
  newModule.previousValue = oldModule and oldModule.value or 0
end

return M
]]
  ok, err = feather.hotReloader:reload(moduleName, migratedSource)
  assertEqual(ok, true, "hot reload accepts replacement module")
  assertEqual(err, nil, "replacement module has no error")
  assertEqual(require(moduleName).value, 2, "replacement module updates package.loaded")
  assertEqual(require(moduleName).previousValue, 1, "migration hook receives old module")

  ok, err = feather.hotReloader:reload(moduleName, "this is not lua")
  assertEqual(ok, false, "syntax error is rejected")
  assertTruthy(err, "syntax error returns message")
  assertEqual(require(moduleName).value, 2, "syntax error keeps previous module")

  ok, err = feather.hotReloader:reload("example.e2e.other", "return {}")
  assertEqual(ok, false, "non-allowlisted module is rejected")
  assertTruthy(err, "non-allowlisted module returns message")

  ok, err = feather.hotReloader:reload("bad-module-name", "return {}")
  assertEqual(ok, false, "invalid module name is rejected")
  assertTruthy(err, "invalid module name returns message")

  ok, err = feather.hotReloader:reload("feather.init", "return {}")
  assertEqual(ok, false, "feather module is protected")
  assertEqual(err, "This module is protected", "feather module returns protected message")

  ok, err = feather.hotReloader:reload("lib.feather.init", "return {}")
  assertEqual(ok, false, "prefixed feather module is protected")
  assertEqual(err, "This module is protected", "prefixed feather module returns protected message")

  ok, err = feather.hotReloader:reload("plugins.hot_reload.init", "return {}")
  assertEqual(ok, false, "hot reload plugin module is protected")
  assertEqual(err, "This module is protected", "hot reload plugin module returns protected message")

  feather.hotReloader:restore()
  assertEqual(package.loaded[moduleName], nil, "restore removes originally unloaded module")
  assertEqual(feather.hotReloader:getState().active, false, "restore clears active state")

  feather:observe("e2e.value", 42)
  assertEqual(#feather.featherObserver:getResponseBody(feather) > 0, true, "observer response is available")

  feather:finish()

  local fifoFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Callback FIFO E2E",
    deviceId = "callback-fifo-e2e",
    assetPreview = false,
    plugins = {
      FeatherPluginManager.createPlugin(OrderedPlugin, "fifo-a", { mode = "bus", label = "A" }),
      FeatherPluginManager.createPlugin(OrderedPlugin, "fifo-b", { mode = "bus", label = "B" }),
      FeatherPluginManager.createPlugin(OrderedPlugin, "fifo-c", { mode = "bus", label = "C" }),
    },
    debugger = {
      enabled = false,
    },
  })

  assertDrawOrder(fifoFeather, { "A", "B", "C" }, "callback bus preserves FIFO order by default")

  local mixedPriorityFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Callback Priority E2E",
    deviceId = "callback-priority-e2e",
    assetPreview = false,
    plugins = {
      FeatherPluginManager.createPlugin(OrderedPlugin, "mixed-a", { mode = "legacy", label = "A" }),
      FeatherPluginManager.createPlugin(OrderedPlugin, "mixed-b", { mode = "bus", label = "B" }),
      FeatherPluginManager.createPlugin(OrderedPlugin, "mixed-c", {
        mode = "bus",
        label = "C",
        priority = 1000,
      }),
      FeatherPluginManager.createPlugin(OrderedPlugin, "mixed-d", { mode = "legacy", label = "D" }),
    },
    debugger = {
      enabled = false,
    },
  })

  resetCallbackOrder()
  love.draw()
  assertArrayEqual(callbackOrder, { "A", "B", "D", "C" }, "priority runs after default FIFO callbacks when larger")

  mixedPriorityFeather.pluginManager:disablePlugin("mixed-b")
  resetCallbackOrder()
  love.draw()
  assertArrayEqual(callbackOrder, { "A", "D", "C" }, "disabled plugins stop scoped callback bus handlers")
  mixedPriorityFeather:finish()

  local equalPriorityFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Callback Stable E2E",
    deviceId = "callback-stable-e2e",
    assetPreview = false,
    plugins = {
      FeatherPluginManager.createPlugin(OrderedPlugin, "stable-a", { mode = "bus", label = "A", priority = 25 }),
      FeatherPluginManager.createPlugin(OrderedPlugin, "stable-b", { mode = "bus", label = "B", priority = 25 }),
      FeatherPluginManager.createPlugin(OrderedPlugin, "stable-c", { mode = "bus", label = "C", priority = 25 }),
    },
    debugger = {
      enabled = false,
    },
  })

  assertDrawOrder(equalPriorityFeather, { "A", "B", "C" }, "equal priorities preserve FIFO order")

  local crashOriginalDraw = love.draw
  love.draw = function()
    error("default draw crash")
  end

  local defaultCrashFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Callback Crash Default E2E",
    deviceId = "callback-crash-default-e2e",
    assetPreview = false,
    debugger = {
      enabled = false,
    },
  })

  local crashed, crashErr = pcall(love.draw)
  assertEqual(crashed, false, "game callback errors rethrow by default")
  assertTruthy(tostring(crashErr):match("default draw crash"), "rethrown game callback error preserves message")
  defaultCrashFeather:finish()
  love.draw = crashOriginalDraw

  love.draw = function()
    error("pause-on-error draw crash")
  end

  local pauseCrashFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Callback Crash Pause E2E",
    deviceId = "callback-crash-pause-e2e",
    assetPreview = false,
    debugger = {
      enabled = true,
      pauseOnError = true,
    },
  })
  local pauseUpdateCount = 0
  pauseCrashFeather.wsClient = {
    update = function()
      pauseUpdateCount = pauseUpdateCount + 1
      pauseCrashFeather.featherDebugger:resume(nil)
    end,
  }
  local pausedCrash, pausedCrashErr = pcall(love.draw)
  assertEqual(pausedCrash, false, "pauseOnError preserves default callback crash behavior")
  assertTruthy(tostring(pausedCrashErr):match("pause%-on%-error draw crash"), "pauseOnError preserves crash message")
  assertTruthy(pauseUpdateCount > 0, "pauseOnError pauses until debugger resumes")
  pauseCrashFeather.featherDebugger:disable()
  pauseCrashFeather:finish()
  love.draw = crashOriginalDraw

  love.draw = function()
    error("recoverable draw crash")
  end

  local continuingCrashFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Callback Crash Continue E2E",
    deviceId = "callback-crash-continue-e2e",
    assetPreview = false,
    continueOnGameError = true,
    debugger = {
      enabled = false,
    },
  })

  local continued = pcall(love.draw)
  assertEqual(continued, true, "continueOnGameError keeps game callback errors running")
  assertTruthy(continuingCrashFeather.debugOverlay.toast, "continueOnGameError shows crash toast")
  assertTruthy(
    continuingCrashFeather.debugOverlay.toast.message:match("kept the game running"),
    "crash toast explains Feather kept the game running"
  )
  continuingCrashFeather:finish()
  love.draw = crashOriginalDraw

  love.draw = function()
    error("recoverable paused draw crash")
  end

  local pausedContinueFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Callback Crash Pause Continue E2E",
    deviceId = "callback-crash-pause-continue-e2e",
    assetPreview = false,
    continueOnGameError = true,
    debugger = {
      enabled = true,
      pauseOnError = true,
    },
  })
  local pausedContinueCount = 0
  pausedContinueFeather.wsClient = {
    update = function()
      pausedContinueCount = pausedContinueCount + 1
      pausedContinueFeather.featherDebugger:resume(nil)
    end,
  }
  local pausedContinued = pcall(love.draw)
  assertEqual(pausedContinued, true, "pauseOnError preserves continueOnGameError recovery")
  assertTruthy(pausedContinueCount > 0, "pauseOnError recovery pauses until debugger resumes")
  pausedContinueFeather.featherDebugger:disable()
  pausedContinueFeather:finish()
  love.draw = crashOriginalDraw

  local pluginCount = 1000
  local expectedHookSum = (pluginCount * (pluginCount + 1)) / 2
  local stressPlugins = {}
  local originalDraw = love.draw
  local originalKeypressed = love.keypressed
  local originalMousemoved = love.mousemoved
  local beforeOverrideCount = 0
  local afterOverrideCount = 0
  local repeatedOverrideCount = 0
  local beforeKeyOverrideCount = 0
  local afterKeyOverrideCount = 0
  local repeatedKeyOverrideCount = 0
  local beforeMouseMoveOverrideCount = 0

  love.draw = function()
    beforeOverrideCount = beforeOverrideCount + 1
  end

  love.keypressed = function()
    beforeKeyOverrideCount = beforeKeyOverrideCount + 1
  end

  love.mousemoved = function()
    beforeMouseMoveOverrideCount = beforeMouseMoveOverrideCount + 1
  end

  for index = 1, pluginCount do
    stressPlugins[index] = FeatherPluginManager.createPlugin(StressPlugin, "stress-" .. tostring(index), {
      index = index,
    })
  end

  local stressFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Callback Stress E2E",
    deviceId = "callback-stress-e2e",
    assetPreview = false,
    plugins = stressPlugins,
    debugger = {
      enabled = false,
    },
  })

  resetStressHooks()
  love.draw()
  assertEqual(beforeOverrideCount, 1, "external draw override registered before Feather still runs")
  assertEqual(
    stressHookCount,
    pluginCount,
    "all 1000 plugins receive draw when external override existed before Feather"
  )
  assertEqual(stressHookSum, expectedHookSum, "all 1000 plugin draw hooks run exactly once with pre-Feather override")
  love.keypressed("space", "space", false)
  assertEqual(beforeKeyOverrideCount, 1, "external keypressed override registered before Feather still runs")
  assertEqual(
    stressKeyCount,
    pluginCount,
    "all 1000 plugins receive keypressed when external override existed before Feather"
  )
  assertEqual(
    stressKeySum,
    expectedHookSum,
    "all 1000 plugin keypressed hooks run exactly once with pre-Feather override"
  )
  love.mousemoved(10, 20, 1, 2, false)
  assertEqual(beforeMouseMoveOverrideCount, 1, "external mousemoved override registered before Feather still runs")
  assertEqual(
    stressMouseMoveCount,
    pluginCount,
    "all 1000 plugins receive mousemoved when external override existed before Feather"
  )
  assertEqual(
    stressMouseMoveSum,
    expectedHookSum,
    "all 1000 plugin mousemoved hooks run exactly once with pre-Feather override"
  )

  love.draw = function()
    afterOverrideCount = afterOverrideCount + 1
  end

  love.keypressed = function()
    afterKeyOverrideCount = afterKeyOverrideCount + 1
  end

  resetStressHooks()
  stressFeather:update(stressFeather.callbackHookInterval or 0.25)
  love.draw()
  assertEqual(afterOverrideCount, 1, "external draw override registered after Feather still runs after rehook")
  assertEqual(
    stressHookCount,
    pluginCount,
    "all 1000 plugins receive draw after external override replaces Feather wrapper"
  )
  assertEqual(stressHookSum, expectedHookSum, "all 1000 plugin draw hooks run exactly once after rehook")
  love.keypressed("space", "space", false)
  assertEqual(afterKeyOverrideCount, 1, "external keypressed override registered after Feather still runs after rehook")
  assertEqual(
    stressKeyCount,
    pluginCount,
    "all 1000 plugins receive keypressed after external override replaces Feather wrapper"
  )
  assertEqual(stressKeySum, expectedHookSum, "all 1000 plugin keypressed hooks run exactly once after rehook")

  love.draw = function()
    repeatedOverrideCount = repeatedOverrideCount + 1
  end

  love.keypressed = function()
    repeatedKeyOverrideCount = repeatedKeyOverrideCount + 1
  end

  resetStressHooks()
  stressFeather:update(stressFeather.callbackHookInterval or 0.25)
  love.draw()
  love.keypressed("space", "space", false)
  assertEqual(repeatedOverrideCount, 1, "second external draw override still runs after another rehook")
  assertEqual(
    stressHookCount,
    pluginCount,
    "all 1000 plugins still receive draw after multiple external override replacements"
  )
  assertEqual(
    stressHookSum,
    expectedHookSum,
    "all 1000 plugin draw hooks still run exactly once after multiple rehooks"
  )
  assertEqual(repeatedKeyOverrideCount, 1, "second external keypressed override still runs after another rehook")
  assertEqual(
    stressKeyCount,
    pluginCount,
    "all 1000 plugins still receive keypressed after multiple external override replacements"
  )
  assertEqual(
    stressKeySum,
    expectedHookSum,
    "all 1000 plugin keypressed hooks still run exactly once after multiple rehooks"
  )

  stressFeather:finish()
  love.draw = originalDraw
  love.keypressed = originalKeypressed
  love.mousemoved = originalMousemoved

  local assetDrawCount = 0
  local assetHookCount = 0
  local AssetHookPlugin = Class({
    __includes = FeatherPluginBase,
    init = function(self, config)
      FeatherPluginBase.init(self, config)
      config.callbacks.register("draw", function()
        assetHookCount = assetHookCount + 1
      end)
    end,
  })

  love.draw = function()
    assetDrawCount = assetDrawCount + 1
  end

  local assetFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Callback Asset Draw E2E",
    deviceId = "callback-asset-draw-e2e",
    assetPreview = true,
    plugins = {
      FeatherPluginManager.createPlugin(AssetHookPlugin, "asset-draw", {}),
    },
    debugger = {
      enabled = false,
    },
  })

  love.draw()
  assetFeather:update(0)
  love.draw()
  assetFeather:update(0)
  love.draw()
  assertEqual(assetDrawCount, 3, "asset preview draw wrapper preserves game draw across rehooks")
  assertEqual(assetHookCount, 3, "asset preview draw wrapper preserves callback bus draw across rehooks")
  love.graphics.newImage("example/demo/asset.png")
  love.graphics.newImage("example/demo/asset.png")
  local firstData = love.image.newImageData(2, 2)
  local secondData = love.image.newImageData(2, 2)
  love.graphics.newImage(firstData)
  love.graphics.newImage(secondData)
  local font = love.graphics.newFont(12)
  assertTruthy(font, "asset preview e2e creates runtime font")
  local assetBody = assetFeather.assets:getResponseBody()
  assertEqual(assetBody.enabled, true, "asset catalog reports preview enabled")
  assertEqual(#assetBody.textures, 3, "asset catalog deduplicates file textures but keeps runtime textures distinct")
  assertEqual(assetBody.textures[1].loadCount, 2, "asset catalog increments repeated file texture load count")
  assertTruthy(assetBody.textures[1].firstSeen, "asset catalog includes first seen metadata")
  assertTruthy(assetBody.textures[1].lastSeen, "asset catalog includes last seen metadata")
  assertTruthy(assetBody.textures[1].filter, "asset catalog includes texture filter metadata")
  assertTruthy(assetBody.textures[1].wrap, "asset catalog includes texture wrap metadata")
  assertTruthy(assetBody.textures[1].memoryBytes, "asset catalog includes texture memory estimate")
  assertEqual(assetFeather.assets:preview("texture", assetBody.textures[1].id), true, "asset preview accepts file texture")
  local filePreviewBody = assetFeather.assets:getResponseBody()
  assertTruthy(filePreviewBody.preview, "asset preview returns file texture preview")
  assertEqual(assetFeather.assets:preview("texture", assetBody.textures[2].id), true, "asset preview accepts runtime texture")
  love.draw()
  local runtimePreviewBody = assetFeather.assets:getResponseBody()
  assertTruthy(runtimePreviewBody.preview, "asset preview returns runtime texture preview")
  assertTruthy(runtimePreviewBody.preview.binary, "asset preview sends runtime texture binary")
  assertEqual(assetFeather.assets:preview("font", assetBody.fonts[1].id), true, "asset preview accepts runtime font")
  love.draw()
  local fontPreviewBody = assetFeather.assets:getResponseBody()
  assertTruthy(fontPreviewBody.preview, "asset preview returns font preview")
  assertTruthy(fontPreviewBody.preview.binary, "asset preview sends font preview binary")
  assetFeather:finish()
  love.draw = originalDraw

  PluginE2ESuite.run(assertEqual, assertTruthy)

  local scheduledFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Scheduled Push E2E",
    deviceId = "scheduled-push-e2e",
    assetPreview = false,
    sampleRate = 1,
    pluginPushBatchSize = 1,
    writeToDisk = false,
    plugins = {
      FeatherPluginManager.createPlugin(PushCountingPlugin, "push-a", { label = "A" }),
      FeatherPluginManager.createPlugin(PushCountingPlugin, "push-b", { label = "B" }),
      FeatherPluginManager.createPlugin(PushCountingPlugin, "push-c", { label = "C" }),
    },
    debugger = {
      enabled = false,
    },
  })
  scheduledFeather.mode = "socket"
  scheduledFeather.wsConnected = true
  scheduledFeather.__connState = "connected"
  scheduledFeather.wsClient = {
    status = 1,
    update = function() end,
    send = function() end,
  }
  scheduledFeather:__setRuntimeInterest({
    features = { profiler = true, observers = true, assets = true, plugins = true },
  })
  pushRequestCount = 0
  scheduledFeather:update(1)
  assertEqual(pushRequestCount, 0, "connected sample starts with non-plugin payload work")
  scheduledFeather:update(0)
  scheduledFeather:update(0)
  scheduledFeather:update(0)
  assertEqual(pushRequestCount, 0, "connected sample spreads profiler, observer, and asset payload work before plugins")
  scheduledFeather:update(0)
  assertEqual(pushRequestCount, 1, "connected sample pushes one plugin payload per frame")
  scheduledFeather:update(0)
  assertEqual(pushRequestCount, 2, "connected sample continues plugin payload batch on next frame")
  scheduledFeather:update(0)
  assertEqual(pushRequestCount, 3, "connected sample drains plugin payloads incrementally")
  scheduledFeather:update(0)
  assertEqual(pushRequestCount, 3, "connected sample finishes without re-pushing plugins in the same cadence")
  scheduledFeather:finish()

  local throttledPushFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Throttled Push E2E",
    deviceId = "throttled-push-e2e",
    assetPreview = false,
    sampleRate = 1,
    pluginPushBatchSize = 1,
    writeToDisk = false,
    plugins = {
      FeatherPluginManager.createPlugin(PushCountingPlugin, "push-throttled", { label = "Throttled", pushInterval = 10 }),
    },
    debugger = {
      enabled = false,
    },
  })
  throttledPushFeather.mode = "socket"
  throttledPushFeather.wsConnected = true
  throttledPushFeather.__connState = "connected"
  throttledPushFeather.wsClient = {
    status = 1,
    update = function() end,
    send = function() end,
  }
  pushRequestCount = 0
  throttledPushFeather:update(1)
  throttledPushFeather:update(0)
  throttledPushFeather:update(0)
  throttledPushFeather:update(0)
  throttledPushFeather:update(0)
  assertEqual(pushRequestCount, 1, "plugin push interval allows the first scheduled payload")
  throttledPushFeather:update(1)
  throttledPushFeather:update(0)
  throttledPushFeather:update(0)
  throttledPushFeather:update(0)
  throttledPushFeather:update(0)
  assertEqual(pushRequestCount, 1, "plugin push interval skips scheduled payloads until due")
  throttledPushFeather.pluginManager:pushAll(throttledPushFeather)
  assertEqual(pushRequestCount, 2, "manual plugin refresh ignores scheduled push interval")
  throttledPushFeather:finish()

  -- ── Auth handshake state machine ───────────────────────────────────────────
  -- Test the challenge-response logic in isolation. We use a disk-mode instance
  -- so no real WS server is needed; __sendWs is a no-op when wsConnected=false.
  local authFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Auth E2E",
    deviceId = "auth-e2e",
    assetPreview = false,
    __DANGEROUS_INSECURE_CONNECTION__ = true,
  })

  -- Manually wire up the internal state to simulate an open (but disk-mode) connection.
  authFeather.__connState = "authenticating"
  authFeather.wsConnected = false -- __sendWs will be a no-op; that's fine

  -- Receiving auth:challenge should store the nonce.
  ---@diagnostic disable-next-line: invisible
  authFeather:__handleCommand({ type = "auth:challenge", nonce = "test-nonce-123" })
  assertEqual(authFeather.__authNonce, "test-nonce-123", "auth:challenge stores nonce")
  assertEqual(authFeather.__connState, "authenticating", "state stays authenticating after challenge")

  -- auth:ok should advance to connected and clear the nonce.
  ---@diagnostic disable-next-line: invisible
  authFeather:__handleCommand({ type = "auth:ok" })
  assertEqual(authFeather.__connState, "connected", "auth:ok advances to connected")
  assertEqual(authFeather.__authNonce, nil, "auth:ok clears stored nonce")

  -- Commands should now be dispatched (connected state). Use cmd:config as a
  -- side-effect-free probe — it updates sampleRate without crashing.
  ---@diagnostic disable-next-line: invisible
  authFeather:__handleCommand({ type = "cmd:config", data = { sampleRate = 2 } })
  assertEqual(authFeather.sampleRate, 2, "commands dispatched after auth:ok")

  -- auth:fail path: reset state and test rejection.
  local failFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Auth Fail E2E",
    deviceId = "auth-fail-e2e",
    assetPreview = false,
    __DANGEROUS_INSECURE_CONNECTION__ = true,
  })
  failFeather.__connState = "authenticating"
  failFeather.wsConnected = false
  -- Simulate having received a challenge first.
  failFeather.__authNonce = "some-nonce"
  -- auth:fail should set state to failed and not advance to connected.
  -- We need a stub wsClient for the close() call.
  failFeather.wsClient = { close = function() end }
  ---@diagnostic disable-next-line: invisible
  failFeather:__handleCommand({ type = "auth:fail", reason = "appId mismatch" })
  assertEqual(failFeather.__connState, "failed", "auth:fail sets state to failed")

  -- Messages should be ignored in failed state.
  ---@diagnostic disable-next-line: invisible
  failFeather:__handleCommand({ type = "cmd:config", data = { sampleRate = 99 } })
  assertEqual(failFeather.sampleRate, 1, "commands ignored in failed state")

  print("[Lua E2E] LUA_E2E_PASS " .. tostring(#results) .. " assertions")
end

function love.load()
  local ok, err = xpcall(run, debug.traceback)
  if not ok then
    print("[Lua E2E] LUA_E2E_FAIL")
    print(err)
    love.event.quit(1)
    return
  end

  love.event.quit(0)
end
