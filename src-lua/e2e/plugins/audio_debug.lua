local PluginE2EHelper = require("e2e.plugins.helper")

local function contains(haystack, needle)
  return haystack:find(needle, 1, true) ~= nil
end

return PluginE2EHelper.createSmokeSuite("audio-debug", {
  disabled = true,
  capabilities = { "filesystem" },
  run = function(context)
    local assertEqual = context.assertEqual
    local assertTruthy = context.assertTruthy
    local disabledLog = context.feather.featherLogger.last_log
    assertTruthy(
      not (disabledLog and disabledLog.str and contains(disabledLog.str, "requests capability")),
      "disabled plugins do not log capability allowlist warnings"
    )
  end,
})
