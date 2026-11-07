return {
  id = "coroutine-monitor",
  name = "Coroutine Monitor",
  description = "Track coroutines auto-discovered via hook, yield counts per frame",
  version = "1.0.0",
  capabilities = {},
  runtime = { cost = "low", update = "active", push = "active", sampleRate = 1 },
  optIn = false,
  disabled = true,
}
