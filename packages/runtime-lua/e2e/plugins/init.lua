local PluginE2EHelper = require("e2e.plugins.helper")

local PluginE2ESuite = {}

local function getSelectedPluginId()
  local selected = os.getenv("FEATHER_E2E_PLUGIN")
  if type(selected) == "string" and selected ~= "" then
    return selected
  end

  for _, value in ipairs(rawget(_G, "arg") or {}) do
    local pluginId = value:match("^%-%-plugin%-e2e=(.+)$")
    if pluginId and pluginId ~= "" then
      return pluginId
    end
  end

  return nil
end

function PluginE2ESuite.run(assertEqual, assertTruthy)
  local selectedPluginId = getSelectedPluginId()
  if selectedPluginId then
    local ok, spec = pcall(PluginE2EHelper.getPluginSpec, selectedPluginId)
    if not ok then
      local orderedSuiteIds = {}
      for _, pluginSpec in ipairs(PluginE2EHelper.getPluginSpecs()) do
        orderedSuiteIds[#orderedSuiteIds + 1] = pluginSpec.id
      end
      error(
        "Unknown plugin E2E selector '" .. selectedPluginId .. "'. Available: " .. table.concat(orderedSuiteIds, ", "),
        2
      )
    end

    local suite = require(spec.suiteModulePath)
    suite.run(assertEqual, assertTruthy)
    return
  end

  for _, modulePath in ipairs(PluginE2EHelper.getSuiteModulePaths()) do
    local suite = require(modulePath)
    suite.run(assertEqual, assertTruthy)
  end
end

return PluginE2ESuite
