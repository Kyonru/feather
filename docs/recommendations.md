# Recommendations

## Security

### API Key

Set `apiKey` in the game config and match it in the Feather desktop app Settings to prevent unauthorized connections:

```lua
local debugger = FeatherDebugger({
  apiKey = "your-api-key",
})
```

### Console plugin

Do not include the Console plugin in builds shipped to users — it allows remote code execution and can be a serious security risk.

---

## Performance

Feather is not intended for production / release builds. Three levels of removal, from least to most thorough:

### Level 1 — Disable at runtime (`debug = false`)

The `debug` flag makes Feather a no-op: no WebSocket connection, no hooks, `update()` returns immediately. The library is still bundled but consumes no CPU.

```lua
local debugger = FeatherDebugger({
  debug = Config.IS_DEBUG,
})
```

The files are dormant but present in the bundle.

### Level 2 — Guard the require

Wrap the entire Feather setup in a conditional so the library is never loaded in production:

```lua
if Config.IS_DEBUG then
  require("feather.auto").setup({ sessionName = "My Game" })
end

function love.update(dt)
  if DEBUGGER then DEBUGGER:update(dt) end
end
```

No Lua code runs and no globals are created in release builds.

### Level 3 — Exclude from the release build (recommended)

Since Feather installs into a single directory, excluding it is a single glob:

**Manual zip:**

```bash
zip -r MyGame.love . \
  -x "*.git*" \
  -x "lib/feather/*"
```

**[love-release](https://github.com/MisterDA/love-release)** — add to `.love-release.yml`:

```yaml
exclude:
  - feather/
```

**[makelove](https://github.com/pfirsich/makelove)** — add to `makelove.toml`:

```toml
[love_files]
exclude = ["feather/**"]
```

No Feather code or assets are present in the release build — this also eliminates the Console plugin as an attack surface entirely.

---

## In-game Observability

[OverlayStats](https://github.com/Oval-Tutu/bootstrap-love2d-project/blob/main/game/lib/overlayStats.lua) by [Oval-Tutu](https://github.com/Oval-Tutu) is a great companion for visualizing performance directly in the game window. Feather's performance plugin draws inspiration from it.
