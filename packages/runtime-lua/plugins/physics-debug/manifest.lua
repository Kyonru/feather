return {
  id = "physics-debug",
  name = "Physics Debug",
  description = "Color-coded love.physics overlay for bodies, joints, contacts, and AABBs",
  version = "1.0.0",
  capabilities = { "physics", "draw" },
  runtime = { cost = "medium", update = "active", push = "active", sampleRate = 1 },
  optIn = true,
  disabled = true,
}
