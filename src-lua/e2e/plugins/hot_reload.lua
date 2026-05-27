local json = require("feather.lib.json")
local PluginE2EHelper = require("e2e.plugins.helper")

return PluginE2EHelper.createSmokeSuite("hot-reload", {
  pluginOptions = {
    enabled = true,
    allow = { "game.player", "game.allowed.*" },
    deny = { "game.denied" },
    requireLocalNetwork = true,
  },
  run = function(context)
    local assertEqual = context.assertEqual
    local assertTruthy = context.assertTruthy
    local feather = context.feather
    local plugin = context.pluginRecord.instance
    local reloader = plugin.reloader

    local function assertStatus(moduleName, code, reloadable)
      local status = reloader:validateSelectedModule(moduleName)
      assertEqual(status.code, code, "hot reload validation code for " .. tostring(moduleName))
      assertEqual(status.reloadable, reloadable, "hot reload reloadable flag for " .. tostring(moduleName))
      assertEqual(reloader:getState().selectedModuleStatus.code, code, "hot reload state includes selected module status")
      return status
    end

    assertStatus("game.player", "reloadable", true)
    assertStatus("game.other", "not-allowlisted", false)
    assertStatus("game.denied", "denied", false)
    assertStatus("main", "protected", false)

    reloader.enabled = false
    assertStatus("game.player", "disabled", false)
    reloader.enabled = true

    feather.host = "203.0.113.7"
    assertStatus("game.player", "remote-blocked", false)
    feather.host = "localhost"

    assertStatus(nil, "no-module", false)

    local sent = {}
    feather.__sendWs = function(_, payload)
      sent[#sent + 1] = json.decode(payload)
    end

    plugin:handleHotReloadCommand({
      type = "req:hot_reload:validate",
      data = { module = "game.allowed.enemy" },
    }, feather)

    assertTruthy(sent[#sent], "hot reload validation command sends state")
    assertEqual(sent[#sent].type, "hot_reload:state", "hot reload validation command emits state")
    assertEqual(
      sent[#sent].data.selectedModuleStatus.module,
      "game.allowed.enemy",
      "hot reload validation state includes selected module"
    )
    assertEqual(
      sent[#sent].data.selectedModuleStatus.reloadable,
      true,
      "hot reload validation state marks selected module reloadable"
    )
  end,
})
