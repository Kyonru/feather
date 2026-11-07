return {
  id = "screenshots",
  name = "Screenshots",
  description = "Capture screenshots and record GIFs from your game",
  version = "1.0.0",
  capabilities = { "filesystem" },
  runtime = { cost = "medium", update = "always", push = "active", sampleRate = 1 },
  actions = {
    { name = "screenshot", description = "Capture one screenshot" },
    { name = "gif", cancellable = true, description = "Record a GIF; cancel stops recording or encoding" },
    { name = "clear", description = "Forget captured images" },
  },
  optIn = false,
  disabled = true,
}
