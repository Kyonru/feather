return {
  id = "particle-system-playground",
  name = "Particles Playground",
  description = "Author composite particle effects with live in-game preview",
  version = "1.0.0",
  capabilities = { "draw", "filesystem" },
  runtime = { cost = "medium", update = "explicit", push = "active", sampleRate = 1 },
  optIn = false,
  disabled = false,
  api = 5,
}
