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

    feather.apiKey = "secret"
    sent = {}
    console:handleEval({
      id = "eval-table",
      code = "return { health = 100, nested = { x = 12 } }",
      apiKey = "secret",
    }, feather)
    response = lastEvent(sent, "eval:response")
    assertEqual(response.status, "success", "structured eval succeeds")
    assertTruthy(response.result, "structured eval preserves string result")
    assertTruthy(response.values, "structured eval includes values metadata")
    assertEqual(response.values[1].type, "table", "structured eval marks table values")
    assertTruthy(response.values[1].fields, "structured eval includes shallow fields")
    assertTruthy(response.values[1].handle, "structured eval includes result handle")

    sent = {}
    console:sendInspectResult({
      data = {
        handle = response.values[1].handle,
        path = { "nested" },
      },
    }, feather)
    local inspectResponse = lastEvent(sent, "console:inspect_result")
    assertEqual(inspectResponse.data.ok, true, "nested inspect succeeds")
    assertEqual(inspectResponse.data.value.type, "table", "nested inspect returns value metadata")

    sent = {}
    console:handleEval({
      id = "eval-read-only-block",
      code = "player.health = 1",
      apiKey = "secret",
      readOnly = true,
    }, feather)
    response = lastEvent(sent, "eval:response")
    assertEqual(response.status, "error", "read-only guardrails block obvious assignment")

    _G.player = { health = 10 }
    sent = {}
    console:handleEval({
      id = "eval-read-only-read",
      code = "return _G.player.health",
      apiKey = "secret",
      readOnly = true,
    }, feather)
    response = lastEvent(sent, "eval:response")
    assertEqual(response.status, "success", "read-only guardrails allow global reads")

    sent = {}
    console:addPin({
      apiKey = "secret",
      data = {
        name = "player_health",
        expression = "player.health",
      },
    }, feather)
    local pinsResponse = lastEvent(sent, "console:pins")
    assertEqual(pinsResponse.data.ok, true, "console pin response succeeds")
    assertEqual(pinsResponse.data.pins[1].status, "ok", "console pin evaluates")
    _G.player.health = 11
    console:update(1)
    local observers = feather.featherObserver:getResponseBody(feather)
    local pinnedObserver
    for _, item in ipairs(observers) do
      if item.key == "console.player_health" then
        pinnedObserver = item
      end
    end
    assertTruthy(pinnedObserver, "console pin publishes observability entry")
    assertEqual(pinnedObserver.value, "11", "console pin updates observability entry")
    _G.player = nil

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
