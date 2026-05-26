local PluginE2EHelper = require("e2e.plugins.helper")

local function contains(haystack, needle)
  return haystack:find(needle, 1, true) ~= nil
end

return PluginE2EHelper.createSmokeSuite("particle-system-playground", {
  run = function(context)
    local plugin = context.pluginRecord.instance
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
    assertTruthy(
      not contains(code, "LG.newShader(love.filesystem.read("),
      "particle playground export avoids direct multi-return shader reads"
    )
    assertTruthy(contains(code, ":setParticleLifetime("), "particle playground export includes particle setters")
    assertTruthy(not contains(code, "particles[1] = {system = "), "particle playground export avoids old table-only shape")
  end,
})
