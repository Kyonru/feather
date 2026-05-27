local json = require("feather.lib.json")
local PluginE2EHelper = require("e2e.plugins.helper")

local function findGlobal(globals, name)
  for _, item in ipairs(globals or {}) do
    if item.name == name then
      return item
    end
  end
  return nil
end

local function lastEvent(events, eventType)
  for i = #events, 1, -1 do
    if events[i].type == eventType then
      return events[i]
    end
  end
  return nil
end

return PluginE2EHelper.createSmokeSuite("console", {
  run = function(context)
    local assertEqual = context.assertEqual
    local assertTruthy = context.assertTruthy
    local feather = context.feather
    local pluginRecord = context.pluginRecord
    local console = pluginRecord.instance
    local sent = {}

    feather.__sendWs = function(_, payload)
      sent[#sent + 1] = json.decode(payload)
    end

    console:sendGlobals(feather)
    local response = sent[#sent]
    assertTruthy(response, "console globals response is sent")
    assertEqual(response.type, "console:globals", "console globals response uses console:globals event")
    assertEqual(response.data.ok, true, "console globals response succeeds")
    assertTruthy(findGlobal(response.data.globals, "_G"), "console globals include _G")
    assertTruthy(findGlobal(response.data.globals, "print"), "console globals include print")
    assertTruthy(findGlobal(response.data.globals, "love"), "console globals include love")
    assertEqual(findGlobal(response.data.globals, "print").type, "function", "console globals include type metadata")

    sent = {}
    feather.__connState = "connected"
    feather.pluginManager:disablePlugin("console")
    feather:__handleCommand({ type = "req:console:globals" })
    response = lastEvent(sent, "console:globals")
    assertEqual(response.type, "console:globals", "disabled console globals sends console:globals event")
    assertEqual(response.data.ok, false, "disabled console globals response fails")
    assertTruthy(response.data.error, "disabled console globals response includes error")

    local missingFeather = PluginE2EHelper.createFeather({
      sessionName = "Console Missing E2E",
      deviceId = "console-missing-e2e",
      plugins = {},
    })
    local missingSent = {}
    missingFeather.__sendWs = function(_, payload)
      missingSent[#missingSent + 1] = json.decode(payload)
    end
    missingFeather.__connState = "connected"
    missingFeather:__handleCommand({ type = "req:console:globals" })
    assertEqual(missingSent[#missingSent].type, "console:globals", "missing console globals sends console:globals event")
    assertEqual(missingSent[#missingSent].data.ok, false, "missing console globals response fails")
    assertTruthy(missingSent[#missingSent].data.error, "missing console globals response includes error")
    missingFeather:finish()
  end,
})
