local PluginE2EHelper = require("e2e.plugins.helper")

return PluginE2EHelper.createSmokeSuite("profiler", {
  run = function(context)
    local profiler = context.pluginRecord.instance
    local assertEqual = context.assertEqual
    local assertTruthy = context.assertTruthy

    local calls = 0
    local wrapped = profiler:wrap("test.work", function(value)
      calls = calls + 1
      return value + 1, value + 2
    end)

    local a, b = wrapped(10)
    assertEqual(a, 11, "profiler wrapped function returns first result")
    assertEqual(b, 12, "profiler wrapped function returns second result")
    assertEqual(calls, 1, "profiler wrapped function calls original")

    local response = profiler:handleRequest({}, context.feather)
    local row = response.data[1]
    assertTruthy(row, "profiler returns collected row")
    assertEqual(row.name, "test.work", "profiler row includes function name")
    assertEqual(row.group, "test", "profiler row includes prefix group")
    assertEqual(row.calls, 1, "profiler row includes numeric calls")
    assertTruthy(type(row.totalTimeRaw) == "number", "profiler row includes raw total time")
    assertTruthy(type(row.avgTimeRaw) == "number", "profiler row includes raw average time")
    assertTruthy(type(row.minTimeRaw) == "number", "profiler row includes raw minimum time")
    assertTruthy(type(row.maxTimeRaw) == "number", "profiler row includes raw maximum time")
    assertTruthy(type(row.percent) == "number", "profiler row includes percent of captured time")
    assertTruthy(type(row.callsPerSecond) == "number", "profiler row includes calls per second")
    assertEqual(response.recording, true, "profiler records by default")
    assertTruthy(type(response.captureElapsed) == "number", "profiler response includes capture elapsed")
    assertTruthy(type(response.totalCapturedTime) == "number", "profiler response includes total captured time")

    local actionResponse = profiler:handleActionRequest({ params = { action = "stop" } }, context.feather)
    assertEqual(profiler.recording, false, "profiler stop action pauses recording")
    assertEqual(actionResponse.type, "table", "profiler stop action returns refreshed table data")
    assertEqual(actionResponse.recording, false, "profiler stop action response reflects stopped state")
    wrapped(20)
    response = profiler:handleRequest({}, context.feather)
    assertEqual(response.data[1].calls, 1, "profiler stop action prevents new samples")

    actionResponse = profiler:handleActionRequest({ params = { action = "start" } }, context.feather)
    assertEqual(profiler.recording, true, "profiler start action resumes recording")
    assertEqual(actionResponse.type, "table", "profiler start action returns refreshed table data")
    assertEqual(actionResponse.recording, true, "profiler start action response reflects recording state")
    wrapped(30)
    response = profiler:handleRequest({}, context.feather)
    assertEqual(response.data[1].calls, 2, "profiler start action records new samples")

    profiler:begin("physics.step")
    local sum = 0
    for i = 1, 10 do
      sum = sum + i
    end
    assertEqual(profiler:finish("physics.step"), true, "profiler scoped finish succeeds")
    response = profiler:handleRequest({}, context.feather)
    local scopedRow
    for _, item in ipairs(response.data) do
      if item.name == "physics.step" then
        scopedRow = item
      end
    end
    assertTruthy(scopedRow, "profiler begin/finish records scoped samples")
    assertEqual(scopedRow.group, "physics", "profiler scoped samples include prefix group")

    actionResponse = profiler:handleActionRequest({ params = { action = "snapshot", label = "Before" } }, context.feather)
    assertEqual(actionResponse.type, "table", "profiler snapshot action returns refreshed table data")
    assertTruthy(#actionResponse.snapshots >= 1, "profiler snapshot action response includes snapshot history")
    assertEqual(actionResponse.snapshots[1].label, "Before", "profiler snapshot action stores named snapshot")
    response = profiler:handleRequest({}, context.feather)
    assertTruthy(#response.snapshots >= 1, "profiler response includes snapshot history")
    assertTruthy(response.snapshots[1].rows["test.work"] ~= nil, "profiler snapshot stores rows by name")

    local unsafe = profiler:wrap("test.crash", function()
      error("profiled failure")
    end)
    local ok, err = pcall(unsafe)
    assertEqual(ok, false, "profiler wrapped function propagates errors")
    assertTruthy(tostring(err):find("profiled failure", 1, true) ~= nil, "profiler wrapped function preserves error message")

    actionResponse = profiler:handleActionRequest({ params = { action = "reset" } }, context.feather)
    assertEqual(actionResponse.type, "table", "profiler reset action returns refreshed table data")
    assertEqual(#actionResponse.data, 0, "profiler reset action response clears samples")
    response = profiler:handleRequest({}, context.feather)
    assertEqual(#response.data, 0, "profiler reset action clears samples")
  end,
})
