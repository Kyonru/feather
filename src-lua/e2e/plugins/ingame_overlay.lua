local PluginE2EHelper = require("e2e.plugins.helper")

return PluginE2EHelper.createSmokeSuite("ingame-overlay", {
  run = function(context)
    local plugin = context.pluginRecord.instance
    local feather = context.feather
    local assertEqual = context.assertEqual

    plugin.overlay.isActive = true
    plugin.overlay.currentSample = 0
    feather.runtimeSuspended = true
    feather.pluginManager:updateSuspended(1 / 30, feather)

    assertEqual(plugin.overlay.currentSample, 1, "ingame overlay samples metrics while Feather is suspended")

    feather.runtimeSuspended = false
    plugin.overlay.isActive = false
  end,
})
