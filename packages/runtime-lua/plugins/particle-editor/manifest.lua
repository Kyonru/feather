return {
  id = "particle-editor",
  name = "Particle Editor",
  description = "Live edit all 30+ ParticleSystem properties, export to Lua",
  version = "1.0.0",
  capabilities = { "filesystem" },
  runtime = { cost = "low", update = "active", push = "active", sampleRate = 1 },
  optIn = false,
  disabled = true,
}
