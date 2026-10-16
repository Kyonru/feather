return {
  id = "screenshots",
  name = "Screenshots",
  description = "Capture screenshots and record GIFs from your game",
  version = "1.0.0",
  capabilities = { "filesystem" },
  runtime = { cost = "medium", update = "always", push = "active", sampleRate = 1 },
  optIn = false,
  disabled = true,
}
