return {
  id = "input-replay",
  name = "Input Replay",
  description = "Record and replay keyboard, mouse, touch, and joystick input",
  version = "1.0.0",
  capabilities = { "input", "filesystem" },
  runtime = { cost = "low", update = "always", push = "active", sampleRate = 1 },
  optIn = false,
  disabled = true,
}
