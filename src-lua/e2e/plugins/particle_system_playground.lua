local PluginE2EHelper = require("e2e.plugins.helper")

local function contains(haystack, needle)
  return haystack:find(needle, 1, true) ~= nil
end

return PluginE2EHelper.createSmokeSuite("particle-system-playground", {
  run = function(context)
    local plugin = context.pluginRecord.instance
    local assertEqual = context.assertEqual
    local assertTruthy = context.assertTruthy

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Export Format",
        template = "fire",
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-shader",
        composite = "Export Format",
        systemIndex = 1,
        filename = "test-particle-shader.glsl",
        shaderSource = "vec4 effect(vec4 color, Image tex, vec2 texture_coords, vec2 screen_coords) { return Texel(tex, texture_coords) * color; }",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Export Format",
        systemIndex = 1,
        enabled = false,
      },
    })

    local result = plugin:handleActionRequest({
      params = {
        action = "export-code",
        composite = "Export Format",
      },
    })
    local code = result and result.exportCode or ""

    assertTruthy(contains(code, "local function init()"), "particle playground export includes init lifecycle")
    assertTruthy(contains(code, "local function update(dt)"), "particle playground export includes update lifecycle")
    assertTruthy(contains(code, "local function draw()"), "particle playground export includes draw lifecycle")
    assertTruthy(contains(code, "local function emit(payload)"), "particle playground export includes payload emit lifecycle")
    assertTruthy(contains(code, "release = function()"), "particle playground export includes release lifecycle")
    assertTruthy(contains(code, "---@class ParticlePayload"), "particle playground export documents ParticlePayload")
    assertTruthy(contains(code, "LG.newImage("), "particle playground export loads texture assets")
    assertTruthy(contains(code, ':setFilter("linear", "linear")'), "particle playground export uses linear texture filtering")
    assertTruthy(contains(code, "local function compileShader(name, source)"), "particle playground export compiles embedded shaders through helper")
    assertTruthy(contains(code, "local shader1Raw = ["), "particle playground export embeds shader source")
    assertTruthy(contains(code, "vec4 effect(vec4 color"), "particle playground export includes shader source body")
    assertTruthy(contains(code, "local shader1 = compileShader("), "particle playground export assigns shader from embedded source")
    assertTruthy(not contains(code, "love.filesystem.read"), "particle playground export avoids runtime shader file reads")
    assertTruthy(contains(code, "enabled = false"), "particle playground export includes disabled emitter state")
    assertTruthy(contains(code, "if emitter.enabled and emitter.system"), "particle playground export skips disabled emitters")
    assertTruthy(
      not contains(code, "LG.newShader(love.filesystem.read("),
      "particle playground export avoids direct multi-return shader reads"
    )
    assertTruthy(contains(code, ":setParticleLifetime("), "particle playground export includes particle setters")
    assertTruthy(not contains(code, "particles[1] = {system = "), "particle playground export avoids old table-only shape")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Composite Controls",
        template = "explosion",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Composite Controls",
        systemIndex = 2,
        enabled = false,
      },
    })

    local system1 = plugin:_getSystemEntry("Composite Controls", 1).system
    local system2 = plugin:_getSystemEntry("Composite Controls", 2).system
    system1:emit(5)
    system2:emit(5)
    local disabledBeforeReset = system2:getCount()

    plugin:handleActionRequest({
      params = {
        action = "reset",
        composite = "Composite Controls",
      },
    })
    assertEqual(system1:getCount(), 0, "particle playground reset affects enabled emitters")
    assertEqual(system2:getCount(), disabledBeforeReset, "particle playground reset skips disabled emitters")

    plugin:handleActionRequest({
      params = {
        action = "emit",
        composite = "Composite Controls",
        count = 7,
      },
    })
    assertEqual(system1:getCount(), 7, "particle playground emit replays enabled emitters from fresh state")
    assertEqual(system2:getCount(), disabledBeforeReset, "particle playground emit skips disabled emitters")

    local beforeX, beforeY = system1:getPosition()
    plugin:handleParamsUpdate({
      params = {
        composite = "Composite Controls",
        previewEnabled = false,
        compositeX = 123,
        compositeY = 234,
      },
    })
    plugin:update(1 / 60)
    local pausedX, pausedY = system1:getPosition()
    assertEqual(pausedX, beforeX, "particle playground preview pause keeps emitter x unchanged")
    assertEqual(pausedY, beforeY, "particle playground preview pause keeps emitter y unchanged")

    plugin:handleParamsUpdate({
      params = {
        composite = "Composite Controls",
        previewEnabled = true,
      },
    })
    plugin:update(1 / 60)
    local resumedX, resumedY = system1:getPosition()
    assertEqual(resumedX, 123, "particle playground preview resume updates emitter x")
    assertEqual(resumedY, 234, "particle playground preview resume updates emitter y")

    plugin:handleParamsUpdate({
      params = {
        composite = "Composite Controls",
        systemIndex = 1,
        spinMin = 0.1,
      },
    })
    local snapshot = plugin:handleRequest()
    assertEqual(
      snapshot.data.systems[1].properties.spinMin,
      0.1,
      "particle playground snapshots round float precision noise"
    )
  end,
})
