local json = require("feather.lib.json")
local runtimeLog = require("feather.lib.log")
local ws = require("feather.lib.ws")
local PluginE2EHelper = require("e2e.plugins.helper")

local GoldenWorkflowsE2E = {}

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

local function findProfilerRow(state, name)
  for _, row in ipairs(state.data or {}) do
    if row.name == name then
      return row
    end
  end
  return nil
end

function GoldenWorkflowsE2E.run(assertEqual, assertTruthy)
  local feather = PluginE2EHelper.createFeather({
    sessionName = "Golden Workflow E2E",
    deviceId = "golden-workflow-e2e",
  })
  feather.sampleRate = 0.01
  local messages = attachSocket(feather)

  feather:__handleCommand({ type = "req:config" })
  local hello = findMessage(messages, "feather:hello")
  assertTruthy(hello and hello.data and hello.data.sessionName == "Golden Workflow E2E", "config request sends hello")

  local beforeLogs = #messages
  feather.featherLogger:print("golden batched log")
  assertEqual(#messages, beforeLogs, "normal golden logs batch before flush")
  feather:__maybeFlushLogMessages(1, true)
  assertTruthy(messages[#messages].type == "logs" or messages[#messages].type == "log", "normal golden logs flush after batching")
  withSuppressedLogOutput(function()
    feather.featherLogger:log({ type = "error", str = "golden immediate error" })
  end)
  assertEqual(messages[#messages].type, "log", "golden error logs flush immediately")

  feather:watch("golden.health", function()
    return 100
  end)
  feather:__handleCommand({ type = "cmd:runtime:interest", data = { features = { observers = true, assets = true, profiler = true } } })
  assertEqual(feather.runtimeInterest.observers, true, "observer interest is stored")
  assertEqual(feather.runtimeInterest.assets, true, "asset interest is stored")
  assertEqual(feather.runtimeInterest.profiler, true, "profiler interest is stored")

  feather:__handleCommand({ type = "req:observers" })
  local observers = findMessage(messages, "observe")
  assertTruthy(observers and observers.data and observers.data[1], "observer request sends watched values")
  assertEqual(observers.data[1].key, "golden.health", "observer request includes golden watch")

  feather:__handleCommand({ type = "req:assets" })
  local assets = findMessage(messages, "assets")
  assertTruthy(assets and assets.data and assets.data.enabled == false, "asset request sends disabled-safe catalog")

  _G.goldenProfileTarget = {
    calls = 0,
    run = function(self, value)
      self.calls = self.calls + 1
      return value + 1
    end,
  }
  feather:__handleCommand({ type = "cmd:debugger:enable" })
  feather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = {
      probes = {
        { file = "main.lua", line = 10, kind = "wrap", target = "goldenProfileTarget.run", label = "goldenProfileTarget.run" },
        { file = "main.lua", line = 12, kind = "snapshot", label = "Golden Probe Snapshot" },
      },
    },
  })
  local debuggerStatus = findMessage(messages, "debugger:status")
  assertTruthy(debuggerStatus and debuggerStatus.data and debuggerStatus.data.profilerProbeCount == 2, "debugger accepts golden profiler probes")

  feather:__handleCommand({ type = "cmd:profiler", action = "start" })
  local result = _G.goldenProfileTarget.run(_G.goldenProfileTarget, 41)
  assertEqual(result, 42, "wrapped profiler target preserves original function return")
  assertEqual(_G.goldenProfileTarget.calls, 1, "wrapped profiler target preserves original function side effects")
  feather:__handleCommand({ type = "cmd:profiler", action = "stop" })
  feather:__flushProfilerPush(true)

  local profilerMessage = findMessage(messages, "profiler")
  assertTruthy(profilerMessage and profilerMessage.data, "profiler command sends golden state")
  local row = findProfilerRow(profilerMessage.data, "goldenProfileTarget.run")
  assertTruthy(row, "wrapped target appears in profiler rows")
  assertTruthy(row.samples and #row.samples == 1, "wrapped target records exact invocation samples")

  feather:__handleCommand({ type = "cmd:runtime", action = "suspend" })
  assertEqual(feather.runtimeSuspended, true, "runtime suspend command marks runtime suspended")
  feather:__handleCommand({ type = "cmd:profiler", action = "refresh" })
  assertEqual(findMessage(messages, "profiler").type, "profiler", "profiler refresh remains allowed while suspended")
  feather:__handleCommand({ type = "cmd:runtime", action = "resume" })
  assertEqual(feather.runtimeSuspended, false, "runtime resume command clears runtime suspended")

  _G.goldenProfileTarget = nil
  feather:finish()
end

return GoldenWorkflowsE2E
