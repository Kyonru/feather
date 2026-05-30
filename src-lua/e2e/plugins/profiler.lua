local json = require("feather.lib.json")
local PluginE2EHelper = require("e2e.plugins.helper")

local ProfilerCoreE2E = {}

local function findRow(state, name)
  for _, row in ipairs(state.data or {}) do
    if row.name == name then
      return row
    end
  end
  return nil
end

function ProfilerCoreE2E.run(assertEqual, assertTruthy)
  local feather = PluginE2EHelper.createFeather({
    sessionName = "Core Profiler E2E",
    deviceId = "core-profiler-e2e",
    plugins = {},
  })

  local profiler = feather.profiler
  assertTruthy(profiler ~= nil, "core profiler is available without enabling a plugin")
  assertEqual(feather.pluginManager:getPlugin("profiler"), nil, "profiler is no longer registered as a plugin")
  assertEqual(profiler.recording, false, "core profiler is idle by default")

  local calls = 0
  local wrapped = profiler:wrap("test.work", function(value)
    calls = calls + 1
    return value + 1, value + 2
  end)

  local a, b = wrapped(10)
  assertEqual(a, 11, "profiler wrapped function returns first result while stopped")
  assertEqual(b, 12, "profiler wrapped function returns second result while stopped")
  assertEqual(calls, 1, "profiler wrapper calls original while stopped")
  assertEqual(#profiler:getState().data, 0, "stopped profiler records no samples")
  assertEqual(profiler:begin("stopped.scope"), false, "stopped scoped sample is a no-op")

  profiler:start()
  assertEqual(profiler.recording, true, "profiler start resumes recording")
  wrapped(20)
  local state = profiler:getState()
  local row = findRow(state, "test.work")
  assertTruthy(row, "profiler returns collected row")
  assertEqual(row.group, "test", "profiler row includes prefix group")
  assertEqual(row.calls, 1, "profiler row includes numeric calls")
  assertTruthy(type(row.totalTimeRaw) == "number", "profiler row includes raw total time")
  assertTruthy(type(row.avgTimeRaw) == "number", "profiler row includes raw average time")
  assertTruthy(type(row.minTimeRaw) == "number", "profiler row includes raw minimum time")
  assertTruthy(type(row.maxTimeRaw) == "number", "profiler row includes raw maximum time")
  assertTruthy(type(row.percent) == "number", "profiler row includes percent of captured time")
  assertTruthy(type(row.callsPerSecond) == "number", "profiler row includes calls per second")
  assertTruthy(type(state.captureElapsed) == "number", "profiler response includes capture elapsed")
  assertTruthy(type(state.totalCapturedTime) == "number", "profiler response includes total captured time")

  assertEqual(profiler:begin("physics.step"), true, "profiler scoped begin succeeds while recording")
  local sum = 0
  for i = 1, 10 do
    sum = sum + i
  end
  assertEqual(profiler:finish("physics.step"), true, "profiler scoped finish succeeds")
  assertEqual(sum, 55, "profiled scope keeps original work intact")
  state = profiler:getState()
  local scopedRow = findRow(state, "physics.step")
  assertTruthy(scopedRow, "profiler begin/finish records scoped samples")
  assertEqual(scopedRow.group, "physics", "profiler scoped samples include prefix group")

  profiler:snapshot("Before")
  state = profiler:getState()
  assertTruthy(#state.snapshots >= 1, "profiler response includes snapshot history")
  assertEqual(state.snapshots[1].label, "Before", "profiler snapshot stores named snapshot")
  assertTruthy(state.snapshots[1].rows["test.work"] ~= nil, "profiler snapshot stores rows by name")

  local unsafe = profiler:wrap("test.crash", function()
    error("profiled failure")
  end)
  local ok, err = pcall(unsafe)
  assertEqual(ok, false, "profiler wrapped function propagates errors")
  assertTruthy(tostring(err):find("profiled failure", 1, true) ~= nil, "profiler wrapped function preserves error message")

  profiler:stop()
  assertEqual(profiler.recording, false, "profiler stop pauses recording")
  wrapped(30)
  state = profiler:getState()
  assertEqual(findRow(state, "test.work").calls, 1, "profiler stop prevents new samples")

  local commandMessages = {}
  feather.__connState = "connected"
  feather.__sendWs = function(_, payload)
    commandMessages[#commandMessages + 1] = json.decode(payload)
  end
  feather:__handleCommand({ type = "cmd:profiler", action = "start" })
  assertEqual(profiler.recording, true, "cmd:profiler start records through core command")
  wrapped(40)
  feather:__handleCommand({ type = "cmd:profiler", action = "snapshot", params = { label = "After" } })
  assertEqual(commandMessages[#commandMessages].type, "profiler", "profiler commands respond with core profiler state")
  for _, message in ipairs(commandMessages) do
    assertTruthy(message.type ~= "feather:hello", "profiler command does not resend config")
    assertTruthy(message.type ~= "plugin:action:response", "profiler command does not use plugin action responses")
  end
  feather:__handleCommand({ type = "cmd:runtime", action = "suspend" })
  assertEqual(profiler.recording, false, "runtime suspension stops profiler recording")
  assertEqual(commandMessages[#commandMessages - 1].type, "profiler", "runtime suspension pushes stopped profiler state")
  assertEqual(commandMessages[#commandMessages].type, "runtime:suspended", "runtime suspension still sends runtime status")
  feather:__handleCommand({ type = "cmd:profiler", action = "start" })
  assertEqual(profiler.recording, false, "suspended runtime rejects profiler start")
  assertEqual(commandMessages[#commandMessages].type, "profiler:error", "suspended profiler start uses profiler error response")
  feather:__handleCommand({ type = "cmd:profiler", action = "reset" })
  assertEqual(commandMessages[#commandMessages].type, "profiler", "suspended runtime allows profiler reset")
  feather.runtimeSuspended = false

  profiler:reset()
  state = profiler:getState()
  assertEqual(#state.data, 0, "profiler reset clears samples")
  assertEqual(#state.snapshots, 0, "profiler reset clears snapshots")
  feather:finish()

  local legacy = PluginE2EHelper.createFeather({
    sessionName = "Legacy Profiler Plugin E2E",
    deviceId = "legacy-profiler-plugin-e2e",
    plugins = {
      {
        identifier = "profiler",
        plugin = function()
          return {}
        end,
        disabled = false,
        capabilities = {},
      },
    },
  })
  assertEqual(legacy.pluginManager:getPlugin("profiler"), nil, "legacy profiler plugin record is ignored")
  assertTruthy(legacy._legacyProfilerPluginWarning == true, "legacy profiler plugin config emits migration warning")
  legacy:finish()
end

return ProfilerCoreE2E
