return {
  id = "time-travel",
  name = "Time Travel",
  description = "Record and replay game state snapshots, export/import, diff two frames",
  version = "1.0.0",
  capabilities = { "filesystem" },
  opts = { bufferSize = 1000 },
  runtime = { cost = "high", update = "explicit", push = "active", sampleRate = 1 },
  optIn = false,
  disabled = true,
}
