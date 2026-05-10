-- feather.config.lua
-- Used by: npm run feather -- run src-lua/example/test_cli

return {
  sessionName = "CLI Example",
  include = { "screenshots", "profiler", "console" },
  exclude = { "hump.signal", "lua-state-machine", "animation-inspector" },
  sampleRate = 1,
  captureScreenshot = false,
  assetPreview = true,
  autoRegisterErrorHandler = true,
  apiKey = "",
}
