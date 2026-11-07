return {
  id = "ingame-overlay",
  name = "In-Game Overlay",
  description = "Opt-in in-game performance overlay drawn through Feather plugin hooks",
  version = "1.0.0",
  capabilities = { "draw" },
  runtime = { cost = "medium", update = "explicit", push = "manual", sampleRate = 1 },
  optIn = true,
  disabled = true,
  opts = {
    visible = false,
    sampleSize = 60,
    sampleInterval = 0.1,
    touchCornerSize = 80,
    doubleTapThreshold = 0.5,
  },
}
