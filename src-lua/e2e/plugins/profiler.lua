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

    profiler:handleActionRequest({ params = { action = "stop" } }, context.feather)
    assertEqual(profiler.recording, false, "profiler stop action pauses recording")
    wrapped(20)
    response = profiler:handleRequest({}, context.feather)
    assertEqual(response.data[1].calls, 1, "profiler stop action prevents new samples")

    profiler:handleActionRequest({ params = { action = "start" } }, context.feather)
    assertEqual(profiler.recording, true, "profiler start action resumes recording")
    wrapped(30)
    response = profiler:handleRequest({}, context.feather)
    assertEqual(response.data[1].calls, 2, "profiler start action records new samples")

    profiler:handleActionRequest({ params = { action = "reset" } }, context.feather)
    response = profiler:handleRequest({}, context.feather)
    assertEqual(#response.data, 0, "profiler reset action clears samples")
  end,
})
