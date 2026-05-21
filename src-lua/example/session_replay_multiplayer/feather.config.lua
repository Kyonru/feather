-- CLI-managed Session Replay multiplayer example.
-- Run from the repo root:
--   npm run feather -- run src-lua/example/session_replay_multiplayer

return {
  sessionName = "Session Replay Multiplayer",
  deviceId = "session-replay-multiplayer",
  include = { "session-replay" },
  sampleRate = 0.25,
  captureScreenshot = false,
  defaultObservers = true,
  autoRegisterErrorHandler = true,
  pluginOptions = {
    ["session-replay"] = {
      captureJoystickAxis = true,
      keyframeInterval = 2,
    },
  },
  __DANGEROUS_INSECURE_CONNECTION__ = true,
}
