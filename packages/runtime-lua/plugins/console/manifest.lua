return {
  id = "console",
  name = "Console",
  description = "Remote REPL — execute Lua code in the running game",
  version = "1.0.0",
  capabilities = { "filesystem" },
  runtime = { cost = "low", update = "always", push = "manual", sampleRate = 1 },
  opts = {
    evalEnabled = true,
    showOverlay = true,
    toastDuration = 2.5,
  },
  optIn = true,
  disabled = true,
}
