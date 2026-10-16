return {
  id = "memory-snapshot",
  name = "Memory Snapshot",
  description = "Heap snapshots, table size tracking, diff between snapshots",
  version = "1.0.0",
  capabilities = {},
  runtime = { cost = "medium", update = "always", push = "active", sampleRate = 1 },
  optIn = false,
  disabled = true,
}
