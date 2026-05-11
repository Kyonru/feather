local FeatherDebugger = require("feather")
local Class = require("feather.lib.class")
local FeatherPluginBase = require("feather.core.base")
local FeatherPluginManager = require("feather.plugin_manager")
local HotReloadPlugin = require("plugins.hot-reload")

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
