return {
  id = "filesystem",
  name = "Filesystem",
  description = "Browse the game's save directory, preview file contents, delete files",
  version = "1.0.0",
  capabilities = { "filesystem" },
  runtime = { cost = "low", update = "active", push = "active", sampleRate = 1 },
  optIn = false,
  disabled = true,
}
