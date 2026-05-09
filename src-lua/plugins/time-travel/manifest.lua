return {
  id          = "time-travel",
  name        = "Time Travel",
  description = "Record and replay game state snapshots, export/import, diff two frames",
  version     = "1.0.0",
  permissions = { "filesystem" },
  opts        = { bufferSize = 1000 },
  optIn       = false,
  disabled    = true,
}
