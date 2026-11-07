-- CLI-managed Session Replay adapter example.
-- Run from the repo root:
--   npm run feather -- run src-lua/example/session_replay/adapter

return {
  sessionName = "Session Replay Adapter",
  deviceId = "session-replay-adapter",
  include = { "session-replay" },
  sampleRate = 0.25,
  captureScreenshot = false,
  defaultObservers = true,
  autoRegisterErrorHandler = true,
  pluginOptions = {
    ["session-replay"] = {
      keyframeInterval = 2,
    },
  },
  __DANGEROUS_INSECURE_CONNECTION__ = true,
}
