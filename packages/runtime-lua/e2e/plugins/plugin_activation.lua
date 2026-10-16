--- Plugin activation, health and action correlation.
---
--- The capability allowlist used to be advisory: a plugin requesting a
--- capability the game did not grant logged a warning and ran anyway. These
--- fixtures prove a denied plugin executes nothing, that the reason reaches the
--- desktop with a remediation, and that the surrounding policies (cheap
--- default runtime, structured health, per-request action correlation) hold.
local json = require("feather.lib.json")
local ws = require("feather.lib.ws")
local runtimeLog = require("feather.lib.log")
local FeatherPluginManager = require("feather.plugin_manager")
local PluginE2EHelper = require("e2e.plugins.helper")

local Suite = { id = "plugin-activation" }

local CHEAP = { cost = "low", update = "always", push = "sampled", sampleRate = 1 }

local function attachSocket(feather)
  local messages = {}
  feather.mode = "socket"
  feather.wsConnected = true
  feather.__connState = "connected"
  feather.wsClient = {
    status = ws.STATUS.OPEN,
    update = function() end,
    send = function(_, payload)
      messages[#messages + 1] = json.decode(payload)
    end,
    sendBinary = function() end,
  }
  return messages
end

--- Handle a command the way the socket does: with its requestId active.
local function command(feather, msg)
  feather.__activeRequestId = feather:__validRequestId(msg.requestId)
  feather:__handleCommand(msg)
  feather.__activeRequestId = nil
end

local function quietly(callback)
  local originalPrint = runtimeLog.originalPrint
  runtimeLog.originalPrint = function() end
  local ok, err = pcall(callback)
  runtimeLog.originalPrint = originalPrint
  if not ok then
    error(err, 0)
  end
end

local function responses(messages, filter)
  local found = {}
  for _, message in ipairs(messages) do
    if message.type == "plugin:action:response" then
      local keep = true
      for key, value in pairs(filter or {}) do
        if message[key] ~= value then
          keep = false
        end
      end
      if keep then
        found[#found + 1] = message
      end
    end
  end
  return found
end

--- A plugin that counts every entry point Feather could call.
local function makeCountingPlugin(calls)
  return function(config)
    calls.init = calls.init + 1
    calls.granted = config.grantedCapabilities
    if config.callbacks and config.callbacks.register then
      config.callbacks.register("draw", function()
        calls.busDraw = calls.busDraw + 1
      end)
    end
    return {
      update = function()
        calls.update = calls.update + 1
      end,
      onDraw = function()
        calls.onDraw = calls.onDraw + 1
      end,
      handleRequest = function()
        calls.payload = calls.payload + 1
        return { type = "ui", tree = { type = "text", value = "hi" }, loading = false }
      end,
      handleActionRequest = function()
        calls.action = calls.action + 1
        return { ok = true }
      end,
      handleParamsUpdate = function()
        calls.params = calls.params + 1
      end,
      getConfig = function()
        return { type = "counting", tabName = "Counting", icon = "activity" }
      end,
    }
  end
end

local function newCalls()
  return { init = 0, update = 0, onDraw = 0, busDraw = 0, payload = 0, action = 0, params = 0 }
end

local function testDeniedCapability(assertEqual, assertTruthy)
  local calls = newCalls()
  local feather
  quietly(function()
    feather = PluginE2EHelper.createFeather({
      sessionName = "Denied Capability E2E",
      deviceId = "denied-capability-e2e",
      capabilities = { "draw" },
      plugins = {
        FeatherPluginManager.createPlugin(makeCountingPlugin(calls), "needs-network", {}, false, { "network" }, nil, CHEAP),
      },
    })
  end)
  local messages = attachSocket(feather)

  local record = feather.pluginManager:getPlugin("needs-network")
  assertTruthy(record, "denied plugin stays registered so the desktop can show why")
  assertEqual(calls.init, 0, "denied plugin: init never runs")
  assertEqual(record.instance, nil, "denied plugin has no instance, even on direct access")
  assertEqual(calls.init, 0, "denied plugin: instance access does not start it")

  feather:__setRuntimeInterest({ features = { plugins = true, pluginIds = { "needs-network" } } })
  for _ = 1, 5 do
    feather:update(1)
  end
  love.draw()
  command(feather, { type = "req:plugins", requestId = "denied-refresh" })
  for _ = 1, 3 do
    feather:update(0)
  end
  quietly(function()
    command(feather, { type = "cmd:plugin:action", plugin = "needs-network", action = "go", requestId = "denied-action" })
    command(feather, { type = "cmd:plugin:params", plugin = "needs-network", params = { a = "1" } })
  end)
  assertEqual(calls.update, 0, "denied plugin: update never runs")
  assertEqual(calls.onDraw + calls.busDraw, 0, "denied plugin: LÖVE callbacks never run")
  assertEqual(calls.payload, 0, "denied plugin: payload builder never runs")
  assertEqual(calls.action + calls.params, 0, "denied plugin: actions and params never reach it")

  local reply = responses(messages, { requestId = "denied-action" })[1]
  assertTruthy(reply and reply.status == "error", "denied plugin action is answered with an error")
  assertTruthy(reply.message:find("network", 1, true), "denied plugin action error names the missing capability")

  quietly(function()
    assertEqual(feather.pluginManager:enablePlugin("needs-network"), false, "denied plugin cannot be enabled")
    assertEqual(feather.pluginManager:togglePlugin("needs-network"), false, "denied plugin cannot be toggled on")
    command(feather, { type = "cmd:plugin:set_enabled", plugin = "needs-network", enabled = true })
  end)
  assertEqual(calls.init, 0, "denied plugin: enabling attempts never start it")

  local config = feather:__getConfig().plugins["needs-network"]
  assertEqual(config.blocked, true, "plugin list marks the denied plugin blocked")
  assertEqual(config.active, false, "plugin list marks the denied plugin inactive")
  assertEqual(config.inactiveReason.code, "capability-denied", "inactiveReason has a stable code")
  assertTruthy(config.inactiveReason.message:find("network", 1, true), "inactiveReason names the capability")
  assertTruthy(
    config.inactiveReason.remediation:find("feather.config.lua", 1, true),
    "inactiveReason tells the user where to grant it"
  )
  assertEqual(config.inactiveReason.missingCapabilities[1], "network", "inactiveReason lists missing capabilities")
  assertEqual(config.tabName, "needs-network", "blocked plugin keeps catalog metadata visible")
  assertEqual(config.health.status, "inactive", "blocked plugin health is inactive")
  feather:finish()

  -- The same plugin, granted, runs.
  local grantedCalls = newCalls()
  local granted = PluginE2EHelper.createFeather({
    sessionName = "Granted Capability E2E",
    deviceId = "granted-capability-e2e",
    capabilities = { "network" },
    plugins = {
      FeatherPluginManager.createPlugin(makeCountingPlugin(grantedCalls), "needs-network", {}, false, { "network" }, nil, CHEAP),
    },
  })
  granted:update(0.1)
  assertEqual(grantedCalls.init, 1, "granted plugin starts")
  assertTruthy(grantedCalls.update > 0, "granted plugin updates")
  assertEqual(granted:__getConfig().plugins["needs-network"].active, true, "granted plugin is active")
  granted:finish()
end

local function testOptionalAndInvalid(assertEqual, assertTruthy)
  local optionalCalls = newCalls()
  local invalidCalls = newCalls()
  local feather
  quietly(function()
    feather = PluginE2EHelper.createFeather({
      sessionName = "Optional Capability E2E",
      deviceId = "optional-capability-e2e",
      capabilities = { "draw" },
      plugins = {
        FeatherPluginManager.createPlugin(makeCountingPlugin(optionalCalls), "optional-network", {}, false, { "draw" }, nil, CHEAP, {
          optionalCapabilities = { "network" },
        }),
        FeatherPluginManager.createPlugin(makeCountingPlugin(invalidCalls), "bad-runtime", {}, false, {}, nil, {
          cost = "low",
          update = "sometimes",
          push = "active",
          sampleRate = 1,
        }),
      },
    })
  end)
  assertEqual(optionalCalls.init, 1, "an ungranted optional capability does not block the plugin")
  assertEqual(#optionalCalls.granted, 1, "init receives only the granted capabilities")
  assertEqual(optionalCalls.granted[1], "draw", "granted capabilities exclude the ungranted optional one")
  assertEqual(invalidCalls.init, 0, "an invalid runtime policy blocks the plugin before init")
  local config = feather:__getConfig().plugins["bad-runtime"]
  assertEqual(config.inactiveReason.code, "invalid-manifest", "invalid manifest has its own reason code")
  assertTruthy(config.inactiveReason.message:find("sometimes", 1, true), "invalid manifest reason names the bad value")
  feather:finish()
end

local function testDisabledAndDefaults(assertEqual, assertTruthy)
  local disabledCalls = newCalls()
  local undeclaredCalls = newCalls()
  local feather
  quietly(function()
    feather = PluginE2EHelper.createFeather({
      sessionName = "Disabled Plugin E2E",
      deviceId = "disabled-plugin-e2e",
      plugins = {
        FeatherPluginManager.createPlugin(makeCountingPlugin(disabledCalls), "starts-off", {}, true, {}, nil, CHEAP),
        FeatherPluginManager.createPlugin(makeCountingPlugin(undeclaredCalls), "no-runtime", {}, false),
      },
    })
  end)
  feather:update(1)
  assertEqual(disabledCalls.init, 0, "a disabled plugin is not started by Feather")
  assertEqual(feather:__getConfig().plugins["starts-off"].inactiveReason.code, "disabled", "disabled reason code")

  -- Game code that integrates through getPlugin(id).instance still gets one,
  -- but the plugin stays switched off.
  local instance = feather.pluginManager:getPlugin("starts-off").instance
  assertTruthy(instance, "getPlugin(id).instance works for a disabled plugin")
  feather:update(1)
  assertEqual(disabledCalls.init, 1, "instance access starts the constructor once")
  assertEqual(disabledCalls.update, 0, "an accessed but disabled plugin still does not update")

  assertEqual(feather.pluginManager:enablePlugin("starts-off"), true, "a disabled plugin can be enabled")
  feather:update(1)
  assertEqual(disabledCalls.init, 1, "enabling reuses the instance")
  assertTruthy(disabledCalls.update > 0, "an enabled plugin updates")

  -- No runtime policy: warned, and the cheap interest-gated default applies.
  local config = feather:__getConfig().plugins["no-runtime"]
  assertEqual(config.runtimeDeclared, false, "plugin list reports an undeclared runtime policy")
  assertEqual(config.runtime.update, "active", "undeclared runtime defaults to update = active")
  assertTruthy(config.manifestWarnings and #config.manifestWarnings > 0, "undeclared runtime is a manifest warning")
  assertEqual(undeclaredCalls.update, 0, "an undeclared plugin does not update while nobody is looking")
  feather:__setRuntimeInterest({ features = { pluginIds = { "no-runtime" } } })
  feather:update(1)
  assertTruthy(undeclaredCalls.update > 0, "an undeclared plugin updates once its page is open")
  feather:finish()
end

local function testHealth(assertEqual, assertTruthy)
  local callbackErrors = 0
  local Failing = function(config)
    config.callbacks.register("draw", function()
      callbackErrors = callbackErrors + 1
      error("draw exploded")
    end)
    return {
      update = function()
        error("update exploded")
      end,
      getConfig = function()
        return { type = "failing", tabName = "Failing", icon = "bug" }
      end,
    }
  end
  local feather
  quietly(function()
    feather = PluginE2EHelper.createFeather({
      sessionName = "Plugin Health E2E",
      deviceId = "plugin-health-e2e",
      plugins = {
        FeatherPluginManager.createPlugin(Failing, "failing", {}, false, {}, nil, CHEAP),
      },
    })
  end)

  quietly(function()
    local ok = pcall(love.draw)
    assertTruthy(ok, "a plugin's draw callback error does not unwind through love.draw")
    feather:update(0.1)
  end)
  local health = feather:__getConfig().plugins.failing.health
  assertEqual(health.status, "failing", "health reports a failing plugin")
  assertEqual(health.consecutiveFailures, 1, "health counts consecutive failures")
  assertTruthy(health.lastError and health.lastError.message:find("exploded", 1, true), "health keeps the last error")
  assertTruthy(type(health.lastUpdateMs) == "number", "health records the last update duration")

  quietly(function()
    for _ = 1, 12 do
      feather:update(0.1)
    end
  end)
  local config = feather:__getConfig().plugins.failing
  assertEqual(config.active, false, "repeated failures switch the plugin off")
  assertEqual(config.inactiveReason.code, "disabled-by-errors", "disabled-by-errors reason code")
  assertEqual(config.health.status, "disabled-by-errors", "health status explains the disable")
  assertTruthy(config.health.disabledReason, "health carries the disabled reason")
  feather:finish()
end

local function testActionCorrelation(assertEqual, assertTruthy)
  local jobs = {}
  local cancelled = {}
  local Deferred = function()
    return {
      handleActionRequest = function(_, request)
        local action = request.params.action
        if action == "fail-sync" then
          return nil, "sync failure"
        end
        local job = request.defer()
        jobs[request.requestId or action] = job
        return { started = action }
      end,
      handleActionCancel = function(_, request)
        cancelled[#cancelled + 1] = request.requestId or "legacy"
      end,
      getConfig = function()
        return { type = "deferred", tabName = "Deferred", icon = "clock" }
      end,
    }
  end

  local feather = PluginE2EHelper.createFeather({
    sessionName = "Action Correlation E2E",
    deviceId = "action-correlation-e2e",
    plugins = {
      FeatherPluginManager.createPlugin(Deferred, "deferred", {}, false, {}, nil, CHEAP, {
        actions = {
          { name = "export", cancellable = true },
          { name = "fail-sync" },
          { name = "legacy", cancellable = true },
        },
      }),
    },
  })
  local messages = attachSocket(feather)

  command(feather, { type = "cmd:plugin:action", plugin = "deferred", action = "export", requestId = "req-a" })
  command(feather, { type = "cmd:plugin:action", plugin = "deferred", action = "export", requestId = "req-b" })
  local ackA = responses(messages, { requestId = "req-a" })[1]
  assertTruthy(ackA and ackA.status == "success", "deferred action is acknowledged with its requestId")
  assertEqual(ackA.data.pending, true, "deferred acknowledgement says the result is pending")

  jobs["req-a"]:progress({ fraction = 0.5 })
  local progress = responses(messages, { requestId = "req-a", status = "progress" })[1]
  assertTruthy(progress, "async progress echoes the requestId")
  assertEqual(progress.final, false, "progress is not final")
  assertEqual(progress.progress.fraction, 0.5, "progress carries its payload")

  -- Cancelling A must not touch B.
  command(feather, { type = "cmd:plugin:action:cancel", plugin = "deferred", action = "export", requestId = "req-a" })
  assertEqual(#responses(messages, { requestId = "req-a", status = "cancelled" }), 1, "cancel answers for its request")
  assertEqual(cancelled[1], "req-a", "the plugin learns which request was cancelled")
  assertEqual(jobs["req-a"]:isCancelled(), true, "the cancelled job knows it")
  assertEqual(jobs["req-b"]:isCancelled(), false, "cancelling one request leaves another running")
  assertEqual(jobs["req-a"]:complete({ late = true }), false, "a cancelled job cannot complete")

  jobs["req-b"]:complete({ done = true })
  local finalB = responses(messages, { requestId = "req-b", status = "success", final = true })[1]
  assertTruthy(finalB and finalB.data.done, "the other request completes with its own requestId")

  -- A stale cancel (B already finished) never reaches the plugin.
  command(feather, { type = "cmd:plugin:action:cancel", plugin = "deferred", action = "export", requestId = "req-b" })
  assertEqual(#cancelled, 1, "a cancel for a finished request does not reach the plugin")
  assertEqual(#responses(messages, { requestId = "req-b", status = "error" }), 1, "a stale cancel is answered with an error")

  -- A legacy cancel (no requestId) does not stop correlated work.
  command(feather, { type = "cmd:plugin:action", plugin = "deferred", action = "export", requestId = "req-c" })
  command(feather, { type = "cmd:plugin:action:cancel", plugin = "deferred", action = "export" })
  assertEqual(jobs["req-c"]:isCancelled(), false, "a cancel without a requestId leaves correlated requests alone")

  -- (nil, err) from handleActionRequest is an error reply, not a silent success.
  command(feather, { type = "cmd:plugin:action", plugin = "deferred", action = "fail-sync", requestId = "req-d" })
  local failD = responses(messages, { requestId = "req-d" })[1]
  assertTruthy(failD and failD.status == "error" and failD.message == "sync failure", "returned errors reach the desktop")

  -- With an action contract, undeclared actions are refused before the plugin runs.
  command(feather, { type = "cmd:plugin:action", plugin = "deferred", action = "nope", requestId = "req-e" })
  local refused = responses(messages, { requestId = "req-e" })[1]
  assertTruthy(refused and refused.status == "error", "an undeclared action is refused")
  assertEqual(jobs.nope, nil, "an undeclared action never reaches the plugin")

  -- Disabling a plugin fails its in-flight work instead of leaving it hanging.
  feather.pluginManager:disablePlugin("deferred")
  assertTruthy(
    responses(messages, { requestId = "req-c", status = "error", final = true })[1],
    "disabling a plugin ends its in-flight requests"
  )
  feather:finish()
end

function Suite.run(assertEqual, assertTruthy)
  testDeniedCapability(assertEqual, assertTruthy)
  testOptionalAndInvalid(assertEqual, assertTruthy)
  testDisabledAndDefaults(assertEqual, assertTruthy)
  testHealth(assertEqual, assertTruthy)
  testActionCorrelation(assertEqual, assertTruthy)
end

return Suite
