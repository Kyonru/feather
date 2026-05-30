local PluginE2EHelper = require("e2e.plugins.helper")

return PluginE2EHelper.createSmokeSuite("ingame-overlay", {
  run = function(context)
    local plugin = context.pluginRecord.instance
    local feather = context.feather
    local assertEqual = context.assertEqual

    plugin.overlay.isActive = false
    plugin.overlay.currentSample = 0
    plugin.overlay.sampleElapsed = 0
    feather.runtimeSuspended = true
    feather.pluginManager:updateSuspended(1, feather)

    assertEqual(plugin.overlay.currentSample, 0, "hidden ingame overlay does not sample metrics while suspended")

    plugin.overlay.isActive = true
    plugin.overlay.currentSample = 0
    plugin.overlay.sampleElapsed = 0

    local originalGetStats = love.graphics.getStats
    local getStatsCalls = 0
    love.graphics.getStats = function(...)
      getStatsCalls = getStatsCalls + 1
      return originalGetStats(...)
    end

    feather.runtimeSuspended = true
    feather.pluginManager:updateSuspended(1 / 30, feather)

    assertEqual(plugin.overlay.currentSample, 1, "ingame overlay samples metrics while Feather is suspended")
    assertEqual(getStatsCalls, 1, "ingame overlay samples graphics stats once on first suspended update")

    feather.pluginManager:updateSuspended(1 / 30, feather)
    assertEqual(plugin.overlay.currentSample, 1, "ingame overlay throttles repeated suspended samples")
    assertEqual(getStatsCalls, 1, "ingame overlay avoids per-frame graphics stats while throttled")

    feather.pluginManager:updateSuspended(0.1, feather)
    assertEqual(plugin.overlay.currentSample, 2, "ingame overlay resumes sampling after the sample interval")
    assertEqual(getStatsCalls, 2, "ingame overlay samples graphics stats only on interval")

    love.graphics.getStats = originalGetStats

    local originalSetNewFont = love.graphics.setNewFont
    local drawGetStatsCalls = 0
    local setNewFontCalls = 0
    love.graphics.getStats = function(...)
      drawGetStatsCalls = drawGetStatsCalls + 1
      return originalGetStats(...)
    end
    love.graphics.setNewFont = function(...)
      setNewFontCalls = setNewFontCalls + 1
      return originalSetNewFont(...)
    end

    plugin.overlay.draw()

    assertEqual(drawGetStatsCalls, 0, "ingame overlay draw reuses sampled graphics stats")
    assertEqual(setNewFontCalls, 0, "ingame overlay draw reuses its cached font")

    love.graphics.getStats = originalGetStats
    love.graphics.setNewFont = originalSetNewFont

    feather.runtimeSuspended = false
    plugin.overlay.isActive = false
  end,
})
