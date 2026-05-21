-- CLI-managed Session Replay example.
-- Run from the repo root:
--   npm run feather -- run src-lua/example/session_replay

return {
  sessionName = "Session Replay Example",
  deviceId = "session-replay-example",
  include = { "session-replay" },
  sampleRate = 0.25,
  captureScreenshot = false,
  defaultObservers = true,
  autoRegisterErrorHandler = true,
  pluginOptions = {
    ["session-replay"] = {
      keyframeInterval = 2,
      captureMouseMove = true,
    },
  },
  __DANGEROUS_INSECURE_CONNECTION__ = true,
}
