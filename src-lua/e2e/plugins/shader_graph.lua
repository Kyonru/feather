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
    assertEqual(plugin.preview.renderFps, 60, "shader graph preview uses smooth render cadence for small previews")
    local renderedAt = plugin.preview.renderedAt
    plugin:onDraw()
    assertEqual(plugin.preview.renderedAt, renderedAt, "shader graph preview respects render cap")

    plugin.preview.texturePixels = 1024 * 1024
    plugin.preview.texturePixelsTotal = plugin.preview.texturePixels
    plugin.preview.renderedAt = nil
    plugin:onDraw()
    assertEqual(plugin.preview.renderFps, 40, "shader graph preview lowers cadence for large preview textures")

    plugin.preview.texturePixels = 2048 * 2048
    plugin.preview.texturePixelsTotal = plugin.preview.texturePixels
    plugin.preview.renderedAt = nil
    plugin:onDraw()
    assertEqual(plugin.preview.renderFps, 30, "shader graph preview lowers cadence further for very large textures")

    local zoomed = plugin:handleActionRequest({
      params = {
        action = "preview-shader",
        pixelSource = pixelSource,
        vertexSource = "",
        shape = "circle",
        color = { 1, 1, 1, 1 },
        previewZoom = 2.5,
        textureUniforms = {},
        textures = {},
        parameters = {},
      },
    })

    assertEqual(zoomed.status, "ok", "shader graph preview accepts zoomed preview")
    plugin:onDraw()
    assertEqual(plugin.preview.renderFps, 24, "shader graph preview lowers cadence for highly zoomed previews")

    local cleared = plugin:handleActionRequest({ params = { action = "clear-preview" } })
    assertEqual(cleared.status, "ok", "shader graph preview clears")
    assertEqual(plugin.preview, nil, "shader graph preview removes live overlay")
  end,
})
