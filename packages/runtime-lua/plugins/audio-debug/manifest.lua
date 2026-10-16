return {
  id = "audio-debug",
  name = "Audio Debug",
  description = "Inspect love.audio sources, listener state, and effects",
  version = "1.0.0",
  capabilities = { "audio" },
  runtime = { cost = "low", update = "active", push = "active", sampleRate = 1 },
  optIn = false,
  disabled = true,
}
