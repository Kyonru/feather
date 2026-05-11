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
  -- Security: set ONE of the two options below.
  --
  -- Option A (recommended): bind to your specific Feather desktop instance.
  --   Copy from Feather desktop app → Settings → Security → Desktop App ID.
  --   The game will reject commands from any other Feather instance.
  -- appId = "feather-app-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  --
  -- Option B: explicitly allow any desktop to send commands (acknowledge the risk).
  --   Required when appId is not set — Feather will error at startup otherwise.
  __DANGEROUS_INSECURE_CONNECTION__ = true,
}
