return {
  id = "console",
  name = "Console",
  description = "Remote REPL — execute Lua code in the running game",
  version = "1.0.0",
  capabilities = { "filesystem" },
  opts = { evalEnabled = true },
  optIn = true,
  disabled = true,
}
