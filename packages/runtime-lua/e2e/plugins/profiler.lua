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

local function lastMessageOfType(messages, messageType)
  for index = #messages, 1, -1 do
    if messages[index].type == messageType then
      return messages[index]
    end
  end
  return nil
end

local function countSamples(state)
  local total = 0
  for _, row in ipairs(state.data or {}) do
    total = total + #(row.samples or {})
  end
  return total
end

local function flushDeferredProfiler(feather)
  feather._profilerPushDueAt = 0
  feather:__flushProfilerPush(false)
end

local function currentSourceFile(debugger, fn)
  local info = debug.getinfo(fn, "S")
  return debugger:_normalizeFile(info.source or info.short_src or "")
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
  assertEqual(#(row.samples or {}), 1, "profiler row includes exact invocation samples")
  assertEqual(row.samples[1].index, 1, "profiler sample includes per-function run index")
  assertTruthy(type(row.samples[1].id) == "number", "profiler sample includes stable id")
  assertTruthy(type(row.samples[1].startedAt) == "number", "profiler sample includes start time")
  assertTruthy(type(row.samples[1].endedAt) == "number", "profiler sample includes end time")
  assertTruthy(type(row.samples[1].durationRaw) == "number", "profiler sample includes raw duration")
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
  assertEqual(#(scopedRow.samples or {}), 1, "profiler begin/finish records exact invocation samples")

  local recursive
  recursive = profiler:wrap("test.recursive", function(depth)
    if depth > 0 then
      return recursive(depth - 1) + 1
    end
    return 1
  end)
  assertEqual(recursive(3), 4, "recursive profiled wrapper returns original result")
  state = profiler:getState()
  local recursiveRow = findRow(state, "test.recursive")
  assertEqual(recursiveRow.calls, 1, "recursive wrapped calls record only the outermost sample")
  assertEqual(#(recursiveRow.samples or {}), 1, "recursive wrapped calls keep one exact invocation sample")

  profiler:reset()
  profiler.maxSamplesPerEntry = 2
  profiler.maxSamplesTotal = 3
  local capA = profiler:wrap("cap.a", function()
    return true
  end)
  local capB = profiler:wrap("cap.b", function()
    return true
  end)
  profiler:start()
  capA()
  capA()
  capA()
  capA()
  capB()
  capB()
  profiler:stop()
  state = profiler:getState()
  assertTruthy(#(findRow(state, "cap.a").samples or {}) <= 2, "profiler enforces per-function sample cap")
  assertTruthy(countSamples(state) <= 3, "profiler enforces global sample cap")
  profiler.maxSamplesPerEntry = 256
  profiler.maxSamplesTotal = 5000
  profiler:reset()
  profiler:start()
  wrapped(20)
  profiler:begin("physics.step")
  profiler:finish("physics.step")

  profiler:snapshot("Before")
  state = profiler:getState()
  assertTruthy(#state.snapshots >= 1, "profiler response includes snapshot history")
  assertEqual(state.snapshots[1].label, "Before", "profiler snapshot stores named snapshot")
  assertTruthy(state.snapshots[1].rows["test.work"] ~= nil, "profiler snapshot stores rows by name")
  assertTruthy(state.snapshots[1].rows["test.work"].samples == nil, "profiler snapshots stay aggregate-only")

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
  assertEqual(#(findRow(state, "test.work").samples or {}), 1, "profiler stop preserves existing exact samples")

  local commandMessages = {}
  feather.__connState = "connected"
  feather.__sendWs = function(_, payload)
    commandMessages[#commandMessages + 1] = json.decode(payload)
  end
  feather:__handleCommand({ type = "cmd:profiler", action = "start" })
  assertEqual(profiler.recording, true, "cmd:profiler start records through core command")
  wrapped(40)
  feather:__handleCommand({ type = "cmd:profiler", action = "snapshot", params = { label = "After" } })
  assertEqual(#commandMessages, 0, "profiler command defers state upload")
  flushDeferredProfiler(feather)
  assertEqual(commandMessages[#commandMessages].type, "profiler", "profiler commands respond with core profiler state")
  for _, message in ipairs(commandMessages) do
    assertTruthy(message.type ~= "feather:hello", "profiler command does not resend config")
    assertTruthy(message.type ~= "plugin:action:response", "profiler command does not use plugin action responses")
  end
  feather:__handleCommand({ type = "cmd:runtime", action = "suspend" })
  assertEqual(profiler.recording, false, "runtime suspension stops profiler recording")
  assertEqual(commandMessages[#commandMessages].type, "runtime:suspended", "runtime suspension still sends runtime status")
  flushDeferredProfiler(feather)
  assertEqual(commandMessages[#commandMessages].type, "profiler", "runtime suspension defers stopped profiler state")
  feather:__handleCommand({ type = "cmd:profiler", action = "start" })
  assertEqual(profiler.recording, false, "suspended runtime rejects profiler start")
  assertEqual(commandMessages[#commandMessages].type, "profiler:error", "suspended profiler start uses profiler error response")
  feather:__handleCommand({ type = "cmd:profiler", action = "reset" })
  flushDeferredProfiler(feather)
  assertEqual(commandMessages[#commandMessages].type, "profiler", "suspended runtime allows profiler reset")
  feather.runtimeSuspended = false

  profiler:reset()
  state = profiler:getState()
  assertEqual(#state.data, 0, "profiler reset clears samples")
  assertEqual(#state.snapshots, 0, "profiler reset clears snapshots")
  feather:finish()

  local probeFeather = PluginE2EHelper.createFeather({
    sessionName = "Debugger Profiler Probe E2E",
    deviceId = "debugger-profiler-probe-e2e",
    plugins = {},
  })
  local probeProfiler = probeFeather.profiler
  local probeMessages = {}
  probeFeather.__connState = "connected"
  probeFeather.__sendWs = function(_, payload)
    local message = json.decode(payload)
    probeMessages[#probeMessages + 1] = message
    if message.type == "debugger:paused" then
      probeFeather.featherDebugger:resume(nil)
    end
  end

  local startLine
  local stopLine
  local snapshotLine
  local combinedLine

  local function startProbeTarget()
    local value = 1
    return value
  end
  startLine = debug.getinfo(startProbeTarget, "S").linedefined + 1

  local function stopProbeTarget()
    local value = 2
    return value
  end
  stopLine = debug.getinfo(stopProbeTarget, "S").linedefined + 1

  local function snapshotProbeTarget()
    local value = 3
    return value
  end
  snapshotLine = debug.getinfo(snapshotProbeTarget, "S").linedefined + 1

  local function combinedProbeTarget()
    local value = 4
    return value
  end
  combinedLine = debug.getinfo(combinedProbeTarget, "S").linedefined + 1

  local probeFile = currentSourceFile(probeFeather.featherDebugger, startProbeTarget)
  local probeWork = probeProfiler:wrap("probe.work", function()
    return true
  end)

  probeFeather:__handleCommand({ type = "cmd:debugger:enable" })
  probeFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = {
      probes = {
        { file = probeFile, line = startLine, kind = "start" },
        { file = probeFile, line = stopLine, kind = "stop" },
        { file = probeFile, line = snapshotLine, kind = "snapshot", label = "Probe Snapshot" },
        { file = "", line = -1, kind = "start" },
        { file = probeFile, line = combinedLine, kind = "invalid" },
      },
    },
  })
  assertEqual(probeFeather.featherDebugger:statusBody().profilerProbeCount, 3, "debugger accepts valid profiler probes")
  assertEqual(#probeFeather.featherDebugger:statusBody().rejectedProfilerProbes, 2, "debugger rejects invalid profiler probes")

  local beforeProbeMessages = #probeMessages
  startProbeTarget()
  assertEqual(probeProfiler.recording, true, "debugger start probe starts profiler recording without pausing")
  assertEqual(#probeMessages, beforeProbeMessages, "debugger start probe defers profiler state upload")
  flushDeferredProfiler(probeFeather)
  assertEqual(lastMessageOfType(probeMessages, "profiler").data.recording, true, "debugger start probe pushes profiler state")
  probeWork()
  stopProbeTarget()
  assertEqual(probeProfiler.recording, false, "debugger stop probe stops profiler recording")
  assertEqual(findRow(probeProfiler:getState(), "probe.work").calls, 1, "debugger probe capture records wrapped work")
  flushDeferredProfiler(probeFeather)
  assertEqual(lastMessageOfType(probeMessages, "profiler").data.recording, false, "debugger stop probe pushes profiler state")

  snapshotProbeTarget()
  assertEqual(probeProfiler:getState().snapshots[1].label, "Probe Snapshot", "debugger snapshot probe stores named snapshot")
  flushDeferredProfiler(probeFeather)
  assertEqual(lastMessageOfType(probeMessages, "profiler").data.snapshots[1].label, "Probe Snapshot", "debugger snapshot probe pushes profiler state")

  local originalLoveUpdate = love.update
  love.update = function(dt)
    return dt
  end
  local loveUpdateBeforeWrap = love.update
  probeFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = { probes = { { file = probeFile, line = startLine, kind = "wrap", target = "love.update" } } },
  })
  assertEqual(probeFeather.featherDebugger:statusBody().profilerProbeCount, 1, "debugger accepts a valid wrap probe")
  assertTruthy(love.update ~= loveUpdateBeforeWrap, "debugger wrap probe replaces love.update on sync")
  love.update(0.1)
  assertTruthy(findRow(probeProfiler:getState(), "love.update") == nil, "wrapped target records no samples while stopped")
  probeProfiler:start()
  love.update(0.2)
  probeProfiler:stop()
  assertEqual(findRow(probeProfiler:getState(), "love.update").calls, 1, "wrapped target records while profiler runs")
  assertEqual(#(findRow(probeProfiler:getState(), "love.update").samples or {}), 1, "debugger wrap probes record exact invocation samples")

  local wrappedLoveUpdate = love.update
  probeFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = { probes = { { file = probeFile, line = startLine, kind = "wrap", target = "love.update" } } },
  })
  assertEqual(love.update, wrappedLoveUpdate, "wrap probe sync is idempotent when target is already wrapped")

  local replacementRan = false
  local replacementLoveUpdate = function(dt)
    replacementRan = true
    return dt
  end
  love.update = replacementLoveUpdate
  probeFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = { probes = { { file = probeFile, line = startLine, kind = "wrap", target = "love.update" } } },
  })
  assertTruthy(love.update ~= replacementLoveUpdate, "wrap probe rewraps replaced functions")
  assertTruthy(love.update ~= wrappedLoveUpdate, "wrap probe creates a fresh wrapper for replaced functions")
  probeProfiler:reset()
  probeProfiler:start()
  love.update(0.3)
  probeProfiler:stop()
  assertTruthy(replacementRan, "rewrapped target still calls replacement function")
  assertEqual(findRow(probeProfiler:getState(), "love.update").calls, 1, "rewrapped target records replacement calls")

  probeFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = { probes = {} },
  })
  assertEqual(love.update, replacementLoveUpdate, "removing wrap probe restores the wrapped target")
  love.update = originalLoveUpdate

  local originalLoveKeypressed = love.keypressed
  local keypressedRan = 0
  love.keypressed = function(key)
    if key == "space" then
      keypressedRan = keypressedRan + 1
    end
  end
  probeFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = { probes = { { file = probeFile, line = startLine, kind = "wrap", target = "love.keypressed" } } },
  })
  probeFeather.pluginManager:hookLoveCallbacks()
  probeProfiler:reset()
  probeProfiler:start()
  love.keypressed("space")
  probeProfiler:stop()
  assertEqual(keypressedRan, 1, "managed love callback wrap preserves keypressed game logic after rehook")
  assertEqual(findRow(probeProfiler:getState(), "love.keypressed").calls, 1, "managed love callback wrap records after rehook")
  probeFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = { probes = {} },
  })

  keypressedRan = 0
  love.keypressed = function(key)
    if key == "enter" then
      keypressedRan = keypressedRan + 1
    end
  end
  probeFeather.pluginManager:hookLoveCallbacks()
  local featherKeypressedDispatcher = love.keypressed
  probeFeather.pluginManager._loveCallbackOriginals.keypressed = featherKeypressedDispatcher
  probeFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = { probes = { { file = probeFile, line = startLine, kind = "wrap", target = "love.keypressed" } } },
  })
  assertEqual(
    probeFeather.featherDebugger:statusBody().profilerProbeCount,
    0,
    "managed love callback wrap refuses to profile Feather dispatcher as original logic"
  )
  love.keypressed = function(key)
    if key == "enter" then
      keypressedRan = keypressedRan + 1
    end
  end
  probeFeather.pluginManager:hookLoveCallbacks()
  probeFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = { probes = { { file = probeFile, line = startLine, kind = "wrap", target = "love.keypressed" } } },
  })
  probeProfiler:reset()
  probeProfiler:start()
  love.keypressed("enter")
  probeProfiler:stop()
  assertEqual(keypressedRan, 1, "managed love callback wrap recovers after dispatcher-only rejection")
  assertEqual(findRow(probeProfiler:getState(), "love.keypressed").calls, 1, "managed love callback wrap records recovered original logic")
  probeFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = { probes = {} },
  })
  love.keypressed = originalLoveKeypressed

  local originalLoveDraw = love.draw
  local drawRan = 0
  love.draw = function()
    drawRan = drawRan + 1
  end
  local drawFeather = PluginE2EHelper.createFeather({
    sessionName = "Debugger Profiler Draw Probe E2E",
    deviceId = "debugger-profiler-draw-probe-e2e",
    assetPreview = true,
    plugins = {},
  })
  drawFeather.__connState = "connected"
  local drawProfiler = drawFeather.profiler
  drawFeather.assets:update(1)
  assertTruthy(drawFeather.assets:isDrawWrapper(love.draw), "asset preview draw wrapper can sit above Feather dispatcher")
  drawFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = { probes = { { file = probeFile, line = startLine, kind = "wrap", target = "love.draw" } } },
  })
  assertEqual(drawFeather.featherDebugger:statusBody().profilerProbeCount, 1, "debugger accepts love.draw wrap probe with asset preview")
  drawProfiler:start()
  love.draw()
  drawProfiler:stop()
  assertEqual(drawRan, 1, "managed love.draw wrap preserves game draw logic when asset preview rehooked first")
  assertEqual(findRow(drawProfiler:getState(), "love.draw").calls, 1, "managed love.draw wrap records when asset preview rehooked first")
  drawFeather:finish()
  love.draw = originalLoveDraw

  _G.FeatherProfilerProbeTarget = {
    count = 0,
    update = function(value)
      _G.FeatherProfilerProbeTarget.count = _G.FeatherProfilerProbeTarget.count + 1
      return value + 1
    end,
  }
  probeFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = {
      probes = {
        {
          file = probeFile,
          line = startLine,
          kind = "wrap",
          target = "FeatherProfilerProbeTarget.update",
          label = "Target.update",
        },
      },
    },
  })
  probeProfiler:reset()
  probeProfiler:start()
  local targetResult = _G.FeatherProfilerProbeTarget.update(4)
  probeProfiler:stop()
  assertEqual(targetResult, 5, "wrapped table target preserves return value")
  assertEqual(_G.FeatherProfilerProbeTarget.count, 1, "wrapped table target preserves side effects")
  assertEqual(findRow(probeProfiler:getState(), "Target.update").calls, 1, "wrapped table target uses custom label")

  probeFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = {
      probes = {
        { file = probeFile, line = startLine, kind = "wrap", target = "FeatherProfilerMissing.update" },
      },
    },
  })
  assertEqual(probeFeather.featherDebugger:statusBody().profilerProbeCount, 0, "missing wrap target is not accepted")
  assertEqual(#probeFeather.featherDebugger:statusBody().rejectedProfilerProbes, 1, "missing wrap target is reported")
  _G.FeatherProfilerProbeTarget = nil

  probeFeather:__handleCommand({
    type = "cmd:debugger:set_breakpoints",
    data = { breakpoints = { { file = probeFile, line = combinedLine } } },
  })
  probeFeather:__handleCommand({
    type = "cmd:debugger:set_profiler_probes",
    data = { probes = { { file = probeFile, line = combinedLine, kind = "start" } } },
  })
  combinedProbeTarget()
  assertEqual(probeProfiler.recording, true, "debugger profiler probe still runs on a breakpoint line")
  assertTruthy(lastMessageOfType(probeMessages, "debugger:paused") ~= nil, "breakpoint still pauses on a profiler probe line")
  probeFeather.featherDebugger:disable()
  probeFeather:finish()

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
