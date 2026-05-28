local PluginE2EHelper = require("e2e.plugins.helper")

local pixelSource = [[
vec4 effect(vec4 color, Image tex, vec2 texture_coords, vec2 screen_coords) {
  return Texel(tex, texture_coords) * color;
}
]]

return PluginE2EHelper.createSmokeSuite("shader-graph", {
  run = function(context)
    local plugin = context.pluginRecord.instance
    local assertEqual = context.assertEqual
    local assertTruthy = context.assertTruthy

    local first = plugin:handleActionRequest({
      params = {
        action = "preview-shader",
        pixelSource = pixelSource,
        vertexSource = "",
        shape = "circle",
        color = { 1, 1, 1, 1 },
        textureUniforms = {},
        textures = {},
        parameters = {},
      },
    })

    assertEqual(first.status, "ok", "shader graph preview accepts valid shader")
    assertTruthy(plugin.preview, "shader graph preview stores live preview")
    assertTruthy(plugin.preview.shader, "shader graph preview compiles shader")
    assertTruthy(plugin.preview.drawable, "shader graph preview creates drawable")

    local shader = plugin.preview.shader
    local drawable = plugin.preview.drawable
    local second = plugin:handleActionRequest({
      params = {
        action = "preview-shader",
        pixelSource = pixelSource,
        vertexSource = "",
        shape = "circle",
        color = { 1, 1, 1, 1 },
        textureUniforms = {},
        textures = {},
        parameters = {},
      },
    })

    assertEqual(second.cached, true, "shader graph preview reuses identical preview payload")
    assertEqual(plugin.preview.shader, shader, "shader graph preview keeps cached shader")
    assertEqual(plugin.preview.drawable, drawable, "shader graph preview keeps cached drawable")

    plugin:onDraw()
    assertTruthy(plugin.preview.canvas, "shader graph preview renders into cached canvas")
    local renderedAt = plugin.preview.renderedAt
    plugin:onDraw()
    assertEqual(plugin.preview.renderedAt, renderedAt, "shader graph preview respects render cap")

    local cleared = plugin:handleActionRequest({ params = { action = "clear-preview" } })
    assertEqual(cleared.status, "ok", "shader graph preview clears")
    assertEqual(plugin.preview, nil, "shader graph preview removes live overlay")
  end,
})
