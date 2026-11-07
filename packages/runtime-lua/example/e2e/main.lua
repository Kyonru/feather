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

  local noopCallbackFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Callback Noop E2E",
    deviceId = "callback-noop-e2e",
    assetPreview = false,
    plugins = {
      FeatherPluginManager.createPlugin(FeatherPluginBase, "noop-callbacks", {}),
    },
    debugger = {
      enabled = false,
    },
  })

  assertEqual(
    noopCallbackFeather.callbackBus:registrationCount("draw"),
    0,
    "inherited no-op draw callbacks are not registered"
  )
  assertEqual(
    noopCallbackFeather.callbackBus:registrationCount("keypressed"),
    0,
    "inherited no-op input callbacks are not registered"
  )
  noopCallbackFeather:finish()

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
      FeatherPluginManager.createPlugin(
        PushCountingPlugin,
        "push-throttled",
        { label = "Throttled", pushInterval = 10 },
        false,
        {},
        nil,
        { cost = "low", update = "active", push = "sampled", sampleRate = 1 }
      ),
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
  assertEqual(pushRequestCount, 1, "manual plugin refresh builds nothing synchronously")
  throttledPushFeather:update(0)
  assertEqual(pushRequestCount, 2, "manual plugin refresh ignores scheduled push interval")
  throttledPushFeather:finish()

  -- req:plugins is a forced refresh. It used to build every payload inside the
  -- command handler; it now queues them for the sample loop at raised priority,
  -- under the same per-frame batch and budget as normal pushes.
  local refreshFeather = FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = "Forced Refresh E2E",
    deviceId = "forced-refresh-e2e",
    assetPreview = false,
    sampleRate = 1,
    pluginPushBatchSize = 1,
    writeToDisk = false,
    plugins = {
      FeatherPluginManager.createPlugin(PushCountingPlugin, "refresh-a", { label = "A" }),
      FeatherPluginManager.createPlugin(PushCountingPlugin, "refresh-b", { label = "B" }),
      FeatherPluginManager.createPlugin(PushCountingPlugin, "refresh-c", { label = "C" }),
    },
    debugger = {
      enabled = false,
    },
  })
  local refreshMessages = {}
  refreshFeather.mode = "socket"
  refreshFeather.wsConnected = true
  refreshFeather.__connState = "connected"
  refreshFeather.wsClient = {
    status = 1,
    update = function() end,
    send = function(_, payload)
      refreshMessages[#refreshMessages + 1] = json.decode(payload)
    end,
  }
  pushRequestCount = 0
  refreshFeather.__activeRequestId = "refresh-1"
  refreshFeather:__handleCommand({ type = "req:plugins", requestId = "refresh-1" })
  refreshFeather.__activeRequestId = nil
  assertEqual(pushRequestCount, 0, "req:plugins builds no payload inside the command handler")
  refreshFeather:update(0)
  assertEqual(pushRequestCount, 1, "req:plugins refresh is served one plugin per frame at batch size 1")
  refreshFeather:update(0)
  refreshFeather:update(0)
  assertEqual(pushRequestCount, 3, "req:plugins refresh drains within the batch limit")
  refreshFeather:update(0)
  assertEqual(pushRequestCount, 3, "req:plugins refresh does not repeat once drained")
  local refreshed = 0
  for _, message in ipairs(refreshMessages) do
    if message.type == "plugin" then
      refreshed = refreshed + 1
      assertEqual(message.requestId, "refresh-1", "forced refresh payload echoes the req:plugins requestId")
      assertEqual(message.schemaVersion, 1, "plugin envelope carries the UI schema version")
      assertTruthy(type(message.generatedAt) == "number", "plugin envelope carries generatedAt")
    end
  end
  assertEqual(refreshed, 3, "forced refresh sends one envelope per plugin")
  local refreshHealth = refreshFeather.pluginManager:getConfig()["refresh-a"].health
  assertEqual(refreshHealth.pushCount, 1, "plugin health counts pushes")
  assertTruthy(type(refreshHealth.lastPayloadBytes) == "number", "plugin health records the last payload size")
  refreshFeather:finish()

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

  local testCliExplosion = require("example.test_cli.explosion")
  assertTruthy(testCliExplosion, "test_cli explosion module loads from routed example root")
  assertTruthy(testCliExplosion.init, "test_cli explosion module exposes init")
  testCliExplosion.release()

  local testCliEffect125 = require("example.test_cli.Effect_125")
  assertTruthy(testCliEffect125, "test_cli Effect_125 module loads from routed example root")
  assertTruthy(testCliEffect125.init, "test_cli Effect_125 module exposes init")
  testCliEffect125.init()
  testCliEffect125.release()

  -- --- particle timeline semantics -------------------------------------
  -- core.lua is the one definition of what a keyframe means, shared by the
  -- in-game plugin, the love.js preview and the exported file. Before it
  -- existed each had its own copy and they had drifted. See packages/runtime-lua/plugins/particle-system-playground/README.md, Particles §1.
  local ParticleCore = require("plugins.particle-system-playground.core")

  assertEqual(ParticleCore.normalizeEasing("outBounce"), "outBounce", "core keeps a known easing")
  assertEqual(ParticleCore.normalizeEasing("nonsense"), "linear", "core falls back to linear")
  assertEqual(ParticleCore.normalizeDuration(90), 60, "core clamps timeline duration to 60s")
  assertEqual(ParticleCore.normalizeDuration(0.01), 0.25, "core clamps timeline duration to 0.25s floor")

  -- The contract the TypeScript curve editor is held to by
  -- scripts/tests/particleEasingContract.test.ts. Both read the same numbers,
  -- so the curve you draw is the curve that plays.
  local easingSamples = {
    { "linear", 0.5, 0.5 },
    { "hold", 0.5, 0 },
    { "inQuad", 0.5, 0.25 },
    { "outQuad", 0.5, 0.75 },
  }
  for _, sample in ipairs(easingSamples) do
    local got = ParticleCore.ease(sample[1], sample[2])
    if math.abs(got - sample[3]) > 1e-6 then
      error(string.format("core.ease(%s, %s) expected %s, got %s",
        sample[1], tostring(sample[2]), tostring(sample[3]), tostring(got)), 2)
    end
  end
  record("core easing curves match their known values")

  -- The overshoot easings leave [0,1] by design; that is why resolved values
  -- are clamped rather than trusted.
  assertTruthy(ParticleCore.ease("inElastic", 0.86) < -0.3, "inElastic undershoots below zero")
  assertTruthy(ParticleCore.ease("outElastic", 0.14) > 1.3, "outElastic overshoots above one")

  -- The divergence this module was created to close: a sizeScale lane eased
  -- with inElastic drove sizes to -37% in the preview and 0 in the export.
  -- Resolved values are clamped here, once, for every host.
  local overshootTrack = {
    clips = { { start = 0, ["end"] = 3 } },
    lanes = {
      sizeScale = {
        { time = 0, value = 0, easing = "inElastic" },
        { time = 3, value = 1, easing = "linear" },
      },
      emissionRate = {
        { time = 0, value = 0, easing = "inElastic" },
        { time = 3, value = 100, easing = "linear" },
      },
      opacity = {
        { time = 0, value = 0, easing = "outElastic" },
        { time = 3, value = 1, easing = "linear" },
      },
    },
  }
  local base = { emissionRate = 50, speedMin = 10, speedMax = 90, sizes = { 1, 0.5 }, emitterLifetime = -1 }
  local sawNegativeSize, sawNegativeRate, sawOpacityAboveOne = false, false, false
  for step = 0, 180 do
    local resolved = ParticleCore.resolve(overshootTrack, (step / 60) % 3, base, { mode = "loop" })
    if resolved.sizeScale < 0 then sawNegativeSize = true end
    if resolved.emissionRate < 0 then sawNegativeRate = true end
    if resolved.opacity > 1 then sawOpacityAboveOne = true end
    local sizes = ParticleCore.resolveSizes(base, resolved.sizeScale)
    for _, value in ipairs(sizes) do
      if value < 0 then sawNegativeSize = true end
    end
  end
  assertEqual(sawNegativeSize, false, "an inElastic size lane never resolves to a negative size")
  assertEqual(sawNegativeRate, false, "an inElastic emission lane never resolves to a negative rate")
  assertEqual(sawOpacityAboveOne, false, "an outElastic opacity lane never resolves above one")

  -- resolveSizes fills a caller-owned table, so the per-frame path need not
  -- allocate one per emitter per frame (packages/runtime-lua/plugins/particle-system-playground/README.md, Particles §4.2).
  local sizeBuffer = {}
  local filled, count = ParticleCore.resolveSizes({ sizes = { 2, 1 } }, 0.5, sizeBuffer)
  assertEqual(filled, sizeBuffer, "resolveSizes fills the table it is given")
  assertEqual(count, 2, "resolveSizes reports how many sizes are live")
  assertEqual(sizeBuffer[1], 1, "resolveSizes scales the first size")

  -- A shrinking size list must not leave stale entries behind in a reused buffer.
  ParticleCore.resolveSizes({ sizes = { 4 } }, 1, sizeBuffer)
  assertEqual(sizeBuffer[2], nil, "resolveSizes clears entries a shorter list no longer uses")

  -- LÖVE takes at most eight sizes. This used to be wrapped in a pcall, so a
  -- longer list silently applied *none* of them.
  local manySizes, manyCount = ParticleCore.resolveSizes({ sizes = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 } }, 1)
  assertEqual(manyCount, 8, "resolveSizes caps at the eight sizes LOVE accepts")
  assertEqual(manySizes[9], nil, "resolveSizes drops sizes past the cap")

  -- --- compiled tracks and change detection (packages/runtime-lua/plugins/particle-system-playground/README.md, Particles P2) ------
  local ParticleApply = require("plugins.particle-system-playground.apply")

  -- A counting stub. apply.lua calls methods on whatever it is handed and never
  -- touches the love global, so no graphics context is needed here.
  local function newCountingSystem()
    local ps = { calls = 0, log = {} }
    for _, name in ipairs({ "setEmissionRate", "setSpeed", "setSizes", "setDirection", "setSpread", "setOffset" }) do
      ps[name] = function(self)
        self.calls = self.calls + 1
        self.log[#self.log + 1] = name
        return true
      end
    end
    return ps
  end

  local constantTrack = {
    clips = { { start = 0, ["end"] = 3 } },
    lanes = {
      emissionRate = { { time = 0, value = 40, easing = "linear" }, { time = 3, value = 40, easing = "linear" } },
      spread = { { time = 0, value = 0.25, easing = "linear" } },
    },
  }
  local particleBase = {
    emissionRate = 40, speedMin = 10, speedMax = 90, sizes = { 1, 0.5 },
    direction = 0, spread = 0.25, offsetX = 0, offsetY = 0, emitterLifetime = -1,
  }

  -- Hoisted deliberately: a fresh table per frame here would be the test
  -- allocating, not apply.lua, and would mask the very thing being measured.
  local tickOptions = { mode = "loop", allowEmission = true }

  local compiledConstant = ParticleCore.compileTrack(constantTrack, 3)
  assertEqual(compiledConstant.varying, 0, "a track whose lanes never change compiles with no varying lanes")
  assertEqual(ParticleCore.trackIsStatic(compiledConstant), true, "such a track is static")

  local stubPs = newCountingSystem()
  local applyState = ParticleApply.newState()
  local firstCalls = select(2, ParticleApply.tick(applyState, stubPs, compiledConstant, 0, particleBase, tickOptions))
  assertTruthy(firstCalls > 0, "the first frame sends the values")
  local afterFirst = stubPs.calls
  for step = 1, 180 do
    ParticleApply.tick(applyState, stubPs, compiledConstant, (step / 60) % 3, particleBase, tickOptions)
  end
  assertEqual(stubPs.calls - afterFirst, 0, "a composite with no keyframed lanes issues zero setter calls after the first frame")

  -- Allocation must be flat on that path: the tables are reused, not rebuilt.
  collectgarbage("collect")
  collectgarbage("stop")
  local beforeKb = collectgarbage("count")
  for step = 1, 600 do
    ParticleApply.tick(applyState, stubPs, compiledConstant, (step / 60) % 3, particleBase, tickOptions)
  end
  local grewKb = collectgarbage("count") - beforeKb
  collectgarbage("restart")
  assertTruthy(grewKb < 8, "600 static frames allocate under 8 KB (was ~1,660 KB unconditionally); got " .. string.format("%.1f", grewKb))

  -- A varying lane still drives setters, or change detection would be a bug.
  local varyingTrack = {
    clips = { { start = 0, ["end"] = 3 } },
    lanes = {
      emissionRate = {
        { time = 0, value = 0, easing = "inOutCubic" },
        { time = 3, value = 200, easing = "linear" },
      },
    },
  }
  local compiledVarying = ParticleCore.compileTrack(varyingTrack, 3)
  assertEqual(compiledVarying.varying, 1, "a keyframed lane compiles as varying")
  assertEqual(ParticleCore.trackIsStatic(compiledVarying), false, "a keyframed track is not static")
  local varyingPs = newCountingSystem()
  local varyingState = ParticleApply.newState()
  for step = 0, 120 do
    ParticleApply.tick(varyingState, varyingPs, compiledVarying, (step / 60) % 3, particleBase, tickOptions)
  end
  assertTruthy(varyingPs.calls > 100, "a varying lane keeps sending updates; got " .. tostring(varyingPs.calls))

  -- The compiled path must agree with the exact path at the times a frame
  -- actually lands on. This is what makes baking invisible.
  local hardTrack = {
    clips = { { start = 0, ["end"] = 3 } },
    lanes = {
      emissionRate = {
        { time = 0, value = 0, easing = "hold" },
        { time = 1.5, value = 100, easing = "hold" },
        { time = 3, value = 0, easing = "linear" },
      },
      sizeScale = {
        { time = 0, value = 0, easing = "outElastic" },
        { time = 1.2, value = 2, easing = "inElastic" },
        { time = 3, value = 1, easing = "linear" },
      },
    },
  }
  local compiledHard = ParticleCore.compileTrack(hardTrack, 3)
  local exactOut, compiledOut = {}, {}
  local worstRate, worstSize = 0, 0
  for step = 0, 180 do
    local t = (step / 60) % 3
    ParticleCore.resolve(hardTrack, t, particleBase, { mode = "loop", allowEmission = true }, exactOut)
    ParticleCore.resolveCompiled(compiledHard, t, particleBase, { mode = "loop", allowEmission = true }, compiledOut)
    worstRate = math.max(worstRate, math.abs(exactOut.emissionRate - compiledOut.emissionRate))
    worstSize = math.max(worstSize, math.abs(exactOut.sizeScale - compiledOut.sizeScale))
  end
  assertTruthy(worstRate < 0.01, "a baked hold step matches the exact curve at frame times; worst " .. string.format("%.6f", worstRate))
  assertTruthy(worstSize < 0.01, "a baked elastic curve matches the exact curve at frame times; worst " .. string.format("%.6f", worstSize))

  -- Resolution follows the frame rate, and is what makes the above true.
  assertEqual(ParticleCore.bakeResolution(3), 360, "a 3s timeline bakes at 360 samples (two per frame at 60fps)")
  assertTruthy(ParticleCore.bakeResolution(0.25) >= ParticleCore.MIN_SAMPLES, "a very short timeline still gets a usable resolution")
  assertTruthy(ParticleCore.bakeResolution(600) <= ParticleCore.MAX_SAMPLES, "a very long timeline is capped")

  -- Replacing the system underneath must re-send everything.
  ParticleApply.invalidate(applyState)
  local reissued = select(2, ParticleApply.tick(applyState, stubPs, compiledConstant, 0, particleBase, tickOptions))
  assertTruthy(reissued > 0, "invalidate makes the next tick write every value again")

  -- --- lifecycle: warm and pool (packages/runtime-lua/plugins/particle-system-playground/README.md, Particles P3) ------------------
  local ParticleLifecycle = require("plugins.particle-system-playground.lifecycle")

  -- An authored value always wins, including an authored zero: turning warmup
  -- off is a decision, not an absence.
  assertEqual(ParticleLifecycle.warmStepsFor({ kickStartSteps = 24 }, "ambient"), 24, "an authored kick-start wins")
  assertEqual(ParticleLifecycle.warmStepsFor({ kickStartSteps = 0 }, "ambient"), 0, "an authored zero turns warmup off")
  assertEqual(ParticleLifecycle.warmStepsFor({ kickStartSteps = -5 }, "loop"), 0, "a negative kick-start is treated as none")

  -- Ambient warms by default because a steady state is the point of it; the
  -- other modes are meant to be seen from their beginning.
  assertEqual(ParticleLifecycle.warmStepsFor({}, "one-shot"), 0, "one-shot does not warm by default")
  assertEqual(ParticleLifecycle.warmStepsFor({}, "loop"), 0, "loop does not warm by default")
  assertTruthy(ParticleLifecycle.warmStepsFor({ particleLifetimeMax = 2 }, "ambient") > 100,
    "ambient warms a full particle lifetime by default")
  assertEqual(ParticleLifecycle.warmStepsFor({ particleLifetimeMax = 2 }, "ambient"), 120,
    "a 2s particle lifetime warms 120 steps at 1/60")

  -- A runaway value is a hang, not a warmup.
  assertEqual(ParticleLifecycle.warmStepsFor({ kickStartSteps = 1e9 }, "ambient"), ParticleLifecycle.MAX_STEPS,
    "an absurd kick-start is capped")
  assertEqual(ParticleLifecycle.warmDtFor({ kickStartDt = 0 }), ParticleLifecycle.DEFAULT_DT,
    "a zero dt falls back rather than dividing by zero")
  assertTruthy(ParticleLifecycle.warmDtFor({ kickStartDt = 10 }) <= 1 / 10,
    "a huge dt is clamped, because it teleports past the particle lifetime instead of warming")

  local warmed = 0
  local ranSteps = ParticleLifecycle.warm(function(dt)
    warmed = warmed + dt
  end, { kickStartSteps = 30, kickStartDt = 1 / 60 }, "ambient")
  assertEqual(ranSteps, 30, "warm runs the requested number of steps")
  assertTruthy(math.abs(warmed - 0.5) < 1e-9, "warm advances the requested amount of time")

  assertEqual(ParticleLifecycle.warm(nil, { kickStartSteps = 10 }, "ambient"), 0, "warm without an updater does nothing")

  -- Pool
  local pool = ParticleLifecycle.newPool(2)
  local builtCount = 0
  local function factory()
    builtCount = builtCount + 1
    return { id = builtCount }
  end
  local first, reusedFirst = ParticleLifecycle.acquire(pool, factory)
  assertEqual(reusedFirst, false, "an empty pool builds")
  assertEqual(ParticleLifecycle.release(pool, first), true, "a released instance is kept")
  local second, reusedSecond = ParticleLifecycle.acquire(pool, factory)
  assertEqual(reusedSecond, true, "the next acquire reuses it")
  assertEqual(second.id, first.id, "the reused instance is the same one")
  assertEqual(builtCount, 1, "reuse does not build again")

  ParticleLifecycle.release(pool, { id = "a" })
  ParticleLifecycle.release(pool, { id = "b" })
  assertEqual(ParticleLifecycle.release(pool, { id = "c" }), false,
    "a full pool refuses, so the caller knows it still owns what it holds")
  assertEqual(pool.dropped, 1, "the pool counts what it refused")

  -- The property P3 exists for, on a real LOVE particle system: an ambient
  -- effect must look at frame 1 like it looks once it has settled. Before this,
  -- every host started empty and filled over a particle lifetime.
  do
    local image = love.graphics.newCanvas(4, 4)
    local function newAmbientSystem()
      local ps = love.graphics.newParticleSystem(image, 512)
      ps:setEmissionRate(120)
      ps:setParticleLifetime(1.5, 2.0)
      ps:setEmitterLifetime(-1)
      ps:setSpeed(20, 40)
      ps:start()
      return ps
    end

    local cold = newAmbientSystem()
    assertEqual(cold:getCount(), 0, "an unwarmed ambient system starts empty")

    local warmSys = newAmbientSystem()
    local steps = ParticleLifecycle.warm(function(dt)
      warmSys:update(dt)
    end, { particleLifetimeMax = 2.0 }, "ambient")
    assertTruthy(steps > 0, "an ambient system warms by default")
    local warmCount = warmSys:getCount()
    assertTruthy(warmCount > 0, "a warmed ambient system has particles on its first frame; got " .. tostring(warmCount))

    -- And it must match the steady state, not merely be non-empty.
    for _ = 1, 600 do
      cold:update(1 / 60)
    end
    local settledCount = cold:getCount()
    local drift = math.abs(warmCount - settledCount) / math.max(1, settledCount)
    assertTruthy(drift < 0.2,
      string.format("frame 1 of a warmed ambient system matches its settled state (warm %d vs settled %d)",
        warmCount, settledCount))
  end

  -- --- WebSocket transport: masking, budgets, bounds -------------------------
  do
    local WS = require("feather.lib.ws")
    local bitlib = require("feather.lib.bit")

    -- A socket that accepts at most `perCall` bytes per send, like a busy OS buffer.
    local function fakeSocket(perCall)
      local fake = { written = {}, inbox = {} }
      function fake:send(data, i, j)
        i = i or 1
        j = j or #data
        local last = math.min(j, i + perCall - 1)
        self.written[#self.written + 1] = data:sub(i, last)
        if last >= j then
          return last
        end
        return nil, "timeout", last
      end
      function fake:receive()
        local chunk = table.remove(self.inbox, 1)
        if chunk then
          return chunk
        end
        return nil, "timeout", ""
      end
      return fake
    end

    local function openClient(perCall)
      local client = WS.new("127.0.0.1", 9)
      pcall(function() client.socket:close() end)
      client.socket = fakeSocket(perCall)
      client.status = WS.STATUS.OPEN
      return client
    end

    -- Decode client frames from the raw byte stream; returns payloads and keys.
    local function decodeFrames(stream)
      local frames, pos = {}, 1
      while pos <= #stream do
        local b2 = stream:byte(pos + 1)
        local len = bitlib.band(b2, 0x7f)
        local header = 2
        if len == 126 then
          len = stream:byte(pos + 2) * 256 + stream:byte(pos + 3)
          header = 4
        elseif len == 127 then
          len = ((stream:byte(pos + 6) * 256 + stream:byte(pos + 7)) * 256 + stream:byte(pos + 8)) * 256
            + stream:byte(pos + 9)
          header = 10
        end
        local keyAt = pos + header
        local key = { stream:byte(keyAt, keyAt + 3) }
        local out = {}
        for k = 1, len do
          out[k] = string.char(bitlib.bxor(stream:byte(keyAt + 3 + k), key[(k - 1) % 4 + 1]))
        end
        frames[#frames + 1] = { payload = table.concat(out), key = table.concat(key, ",") }
        pos = keyAt + 4 + len
      end
      return frames
    end

    local client = openClient(1000)
    local messages = { "hello", string.rep("x", 300), string.rep("0123456789", 7000) } -- 5 B, 300 B, 70 KB
    for _, message in ipairs(messages) do
      assertTruthy(client:send(message), "a message under the limit is queued")
    end
    for _ = 1, 500 do
      client:_flush()
      if client:getQueuedBytes() == 0 then break end
    end
    assertEqual(client:getQueuedBytes(), 0, "the queue drains completely across updates")
    local frames = decodeFrames(table.concat(client.socket.written))
    assertEqual(#frames, 3, "every queued message becomes exactly one frame")
    for index, message in ipairs(messages) do
      assertEqual(frames[index].payload == message, true, "frame " .. index .. " unmasks to the original payload")
    end
    local keys = {}
    for _, frame in ipairs(frames) do keys[frame.key] = true end
    local distinct = 0
    for _ in pairs(keys) do distinct = distinct + 1 end
    assertTruthy(distinct >= 2, "each frame gets its own masking key (RFC 6455 §5.3), not one fixed key")

    -- A large message is spread across updates instead of masked in one go.
    local big = openClient(1024 * 1024 * 16)
    big.limits.flushBudgetMs = 0.5
    big:send(string.rep("y", 256 * 1024))
    big:_flush()
    assertTruthy(big:getQueuedBytes() > 0, "a 256 KiB message is not fully masked inside one 0.5 ms update")
    local updates = 1
    while big:getQueuedBytes() > 0 and updates < 10000 do
      big:_flush()
      updates = updates + 1
    end
    assertEqual(big:getQueuedBytes(), 0, "the large message still completes")
    assertTruthy(big:getStats().maxFlushMs < 5,
      string.format("no single update spends long on transport (max %.2f ms over %d updates)",
        big:getStats().maxFlushMs, updates))
    assertEqual(decodeFrames(table.concat(big.socket.written))[1].payload == string.rep("y", 256 * 1024), true,
      "the incrementally masked frame decodes intact")

    -- The queue is bounded, and replies keep a reserve.
    local bounded = openClient(0)
    bounded.socket.send = function(_, _, i) return nil, "timeout", (i or 1) - 1 end -- never drains
    bounded.limits.maxQueuedBytes = 1000
    bounded.limits.reserveBytes = 500
    assertTruthy(bounded:send(string.rep("a", 900)), "under the limit is accepted")
    local accepted, reason = bounded:send(string.rep("b", 200))
    assertEqual(accepted, false, "past the limit an ordinary message is refused")
    assertEqual(reason, "queue full", "and the refusal says why")
    assertTruthy(bounded:send(string.rep("c", 200), true), "a reply to a desktop command may use the reserve")
    assertEqual(bounded:getStats().dropped, 1, "refusals are counted")

    -- An oversized incoming message is a named fault, not a silent reset.
    local receiver = openClient(1024)
    local errors = {}
    function receiver:onerror(message) errors[#errors + 1] = message end
    receiver._buf = string.char(0x81, 127, 0, 0, 0, 0, 0, 0x20, 0, 0) -- header for a 2 MiB text frame
    for _ = 1, 16 do receiver.socket.inbox[#receiver.socket.inbox + 1] = string.rep("z", 65536 + 1) end
    receiver:update()
    assertEqual(receiver:getStats().receiveOverflows, 1, "a receive overflow is counted")
    assertTruthy(errors[1] and errors[1]:find("overflow"), "and reported through onerror")
    assertEqual(receiver.status, WS.STATUS.CLOSING, "and the connection closes instead of desynchronising")
  end

  -- --- Request correlation: replies echo the command's requestId ------------
  do
    local correlated = FeatherDebugger({
      debug = true,
      mode = "socket",
      host = "127.0.0.1",
      port = 9,
      __DANGEROUS_INSECURE_CONNECTION__ = true,
      plugins = {},
    })
    local onmessage = correlated.wsClient.onmessage
    pcall(function() correlated.wsClient.socket:close() end)
    local sent = {}
    correlated.wsConnected = true
    correlated.__connState = "connected"
    correlated.wsClient = {
      send = function(_, payload)
        sent[#sent + 1] = json.decode(payload)
      end,
    }

    onmessage(nil, json.encode({ type = "req:config", requestId = "req-42" }))
    assertTruthy(#sent > 0, "req:config produces a reply")
    assertEqual(sent[1].requestId, "req-42", "a reply echoes the command's requestId")

    sent = {}
    onmessage(nil, json.encode({ type = "req:config", requestId = 'bad"id' }))
    assertEqual(sent[1] and sent[1].requestId, nil, "a requestId that would need escaping is not echoed")

    sent = {}
    correlated:__sendWs(json.encode({ type = "log", data = {} }))
    assertEqual(sent[1].requestId, nil, "messages sent outside a command carry no requestId")
  end

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
