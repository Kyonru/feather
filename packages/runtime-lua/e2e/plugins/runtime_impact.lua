local json = require("feather.lib.json")
local runtimeLog = require("feather.lib.log")
local ws = require("feather.lib.ws")
local FeatherPluginManager = require("feather.plugin_manager")
local PluginE2EHelper = require("e2e.plugins.helper")

local RuntimeImpactE2E = {}

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

local function findMessage(messages, messageType)
  for index = #messages, 1, -1 do
    if messages[index].type == messageType then
      return messages[index]
    end
  end
  return nil
end

local function withSuppressedLogOutput(callback)
  local originalPrint = runtimeLog.originalPrint
  runtimeLog.originalPrint = function() end
  local ok, err = pcall(callback)
  runtimeLog.originalPrint = originalPrint
  if not ok then
    error(err, 0)
  end
end

function RuntimeImpactE2E.run(assertEqual, assertTruthy)
  local updateCount = 0
  local requestCount = 0
  local ImpactPlugin = function()
    return {
      update = function()
        updateCount = updateCount + 1
      end,
      handleRequest = function()
        requestCount = requestCount + 1
        return { type = "text", data = "impact" }
      end,
      getConfig = function()
        return { type = "impact", tabName = "Impact", icon = "activity" }
      end,
    }
  end

  local feather = PluginE2EHelper.createFeather({
    sessionName = "Runtime Impact E2E",
    deviceId = "runtime-impact-e2e",
    plugins = {
      FeatherPluginManager.createPlugin(
        ImpactPlugin,
        "impact-plugin",
        {},
        false,
        {},
        nil,
        { cost = "high", update = "active", push = "active" }
      ),
    },
  })
  feather.sampleRate = 0.01
  feather.runtimeBudget = { maxFrameMs = 0.5, maxMessagesPerFrame = 20, maxSerializedBytesPerFrame = 32768 }
  feather.overhead:setBudget(feather.runtimeBudget)
  local messages = attachSocket(feather)

  feather:update(0.02)
  assertEqual(updateCount, 0, "inactive high-cost plugin does not update")
  assertEqual(requestCount, 0, "inactive high-cost plugin does not build payloads")

  feather:__handleCommand({
    type = "cmd:runtime:interest",
    data = { features = { plugins = true, pluginIds = { "impact-plugin" } } },
  })
  for _ = 1, 5 do
    feather:update(0.02)
  end
  assertTruthy(updateCount > 0, "interested high-cost plugin updates")
  assertTruthy(requestCount > 0, "interested high-cost plugin pushes payloads")

  requestCount = 0
  feather._scheduledSampleTasks = {}
  feather._wsElapsed = 0
  feather.overhead:setBudget({ maxFrameMs = 0, maxMessagesPerFrame = 20, maxSerializedBytesPerFrame = 32768 })
  for _ = 1, 8 do
    feather:update(0.02)
  end
  assertTruthy(requestCount > 0, "soft time budget does not wedge active plugin payloads")
  feather.overhead:setBudget(feather.runtimeBudget)

  local performance = findMessage(messages, "performance")
  assertTruthy(performance and performance.data and performance.data.featherOverhead, "performance includes Feather overhead")
  assertTruthy(
    type(performance.data.featherOverhead.avgMsPerFrame) == "number",
    "Feather overhead includes average frame cost"
  )
  assertTruthy(
    type(performance.data.featherOverhead.serializedBytes) == "number",
    "Feather overhead includes serialized byte count"
  )

  local beforeLogs = #messages
  feather.featherLogger:print("batched one")
  feather.featherLogger:print("batched two")
  assertEqual(#messages, beforeLogs, "normal logs are batched before flush")
  feather:__maybeFlushLogMessages(1, true)
  assertEqual(messages[#messages].type, "logs", "normal logs flush as a batch")

  withSuppressedLogOutput(function()
    feather.featherLogger:log({ type = "error", str = "critical now" })
  end)
  assertEqual(messages[#messages].type, "log", "errors flush immediately")

  feather:watch("runtime.watch", function()
    return { value = "watched" }
  end)
  feather:__handleCommand({ type = "cmd:runtime:interest", data = { features = { observers = true } } })
  for _ = 1, 8 do
    feather:update(0.02)
  end
  local observers = findMessage(messages, "observe")
  assertTruthy(observers and type(observers.data) == "table", "interested observers serialize on sample")

  feather:finish()
end

return RuntimeImpactE2E
