local FeatherDebugger = require("feather")
local Class = require("feather.lib.class")
local FeatherPluginBase = require("feather.core.base")
local FeatherPluginManager = require("feather.plugin_manager")
local HotReloadPlugin = require("plugins.hot-reload")
local PluginE2ESuite = require("e2e.plugins")

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

  local pluginCount = 1000
  local expectedHookSum = (pluginCount * (pluginCount + 1)) / 2
  local stressPlugins = {}
  local originalDraw = love.draw
  local originalKeypressed = love.keypressed
  local beforeOverrideCount = 0
  local afterOverrideCount = 0
  local repeatedOverrideCount = 0
  local beforeKeyOverrideCount = 0
  local afterKeyOverrideCount = 0
  local repeatedKeyOverrideCount = 0

  love.draw = function()
    beforeOverrideCount = beforeOverrideCount + 1
  end

  love.keypressed = function()
    beforeKeyOverrideCount = beforeKeyOverrideCount + 1
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

  love.draw = function()
    afterOverrideCount = afterOverrideCount + 1
  end

  love.keypressed = function()
    afterKeyOverrideCount = afterKeyOverrideCount + 1
  end

  resetStressHooks()
  stressFeather:update(0)
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
  stressFeather:update(0)
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
  assetFeather:finish()
  love.draw = originalDraw

  PluginE2ESuite.run(assertEqual, assertTruthy)

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
