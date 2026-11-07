return {
  id = "network-inspector",
  name = "Network Inspector",
  description = "Monitor HTTP/WS traffic by wrapping socket.http",
  version = "1.0.0",
  capabilities = { "network" },
  runtime = { cost = "medium", update = "active", push = "active", sampleRate = 1 },
  optIn = false,
  disabled = true,
}
