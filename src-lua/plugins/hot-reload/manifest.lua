return {
  id = "hot-reload",
  name = "Hot Reload",
  description = "Development-only Lua module hot reload over Feather WebSocket",
  version = "1.0.0",
  capabilities = { "filesystem" },
  opts = {
    enabled = true,
    allow = {},
    deny = { "main", "conf", "feather.*" },
    persistToDisk = false,
    clearOnBoot = false,
    requireLocalNetwork = true,
  },
  optIn = true,
  disabled = true,
}
