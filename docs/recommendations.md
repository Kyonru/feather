# Recommendations

## Security

### Desktop App ID (`appId`) — recommended for all setups

Each Feather desktop app generates a unique **App ID** (a UUID stored in Settings). You must set **one** of the following in `feather.config.lua` — Feather will error at startup in socket mode if neither is present:

**Option A — bind to your desktop app (recommended):**

```lua
-- feather.config.lua
return {
  -- Copy from Feather desktop app → Settings → Security → Desktop App ID
  appId = "feather-app-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
}
```

The game rejects commands from any other Feather desktop instance. Only the matching app can control it.

**Option B — explicit insecure opt-in:**

```lua
-- feather.config.lua
return {
  -- Any Feather desktop on the network can send commands to this game.
  -- Set this only when you cannot use appId (e.g. shared dev machine, CI).
  insecureConnection = true,
}
```

Setting `insecureConnection = true` is your acknowledgment that the game accepts commands from any Feather desktop on the network. Feather will not start without one of these two options — there is no silent fallback.

`feather init` prompts for the App ID during setup and writes it to `feather.config.lua` automatically. To find it: open the Feather desktop app → **Settings** → **Security** → **Desktop App ID**.

> [!NOTE]
> `appId` identifies the **desktop app instance**, not a user or secret. If you reinstall or reset the desktop app, regenerate the App ID in Settings and update `feather.config.lua`.
>
> `appId` prevents accidental cross-talk between development machines on the same network — it is not a cryptographic guarantee and is not a substitute for proper network isolation in shared or untrusted environments.

### API Key (`apiKey`) — required only for the Console plugin

Set `apiKey` in the game config and match it in the Feather desktop app Settings. This gates access to the Console / REPL plugin (remote Lua execution):

```lua
local debugger = FeatherDebugger({
  apiKey = "your-api-key",
})
```

### Console plugin

> [!WARNING]
> Do not include the Console plugin in builds shipped to users. It allows remote code execution and can be a serious security risk.

---

## Safe `DEBUGGER` Usage

> [!IMPORTANT]
> `DEBUGGER` only exists when Feather actually loads. With CLI-managed setup, generated imports are guarded by `USE_DEBUGGER`, so production-like runs can leave Feather unloaded entirely.

Always guard direct `DEBUGGER` usage:

```lua
function love.update(dt)
  if DEBUGGER then
    DEBUGGER:update(dt)
  end
end
```

For custom actions:

```lua
if DEBUGGER then
  DEBUGGER:log("Player spawned")
end
```

Avoid this in game code:

```lua
DEBUGGER:update(dt)
```

> [!CAUTION]
> That direct call will fail when `USE_DEBUGGER` is unset, when `debug = false`, or after running `feather remove`.

For local/dev runs, enable Feather explicitly:

```bash
USE_DEBUGGER=1 love .
```

For production builds, leave `USE_DEBUGGER` unset and run `feather remove --yes` before packaging.

---

## Performance

> [!WARNING]
> Feather is a development tool, not something you should ship in production builds. Use one of these approaches, from least to most thorough.

### Level 1 — Disable at runtime (`debug = false`)

The `debug` flag makes Feather a no-op: no WebSocket connection, no hooks, `update()` returns immediately. The library is still bundled but consumes no CPU.

```lua
local debugger = FeatherDebugger({
  debug = Config.IS_DEBUG,
})
```

The files are dormant but present in the bundle.

### Level 2 — Keep Feather managed by the CLI

Prefer initializing Feather through the CLI so the generated files are easy to remove later:

```bash
feather init --mode auto
# or
feather init --mode manual
```

Auto mode inserts marked `FEATHER-INIT` blocks in `main.lua`. Manual mode creates `feather.debugger.lua` and loads it from a marked block in `main.lua`.

Both modes guard Feather imports with the `USE_DEBUGGER` environment variable. Run local/dev builds with:

```bash
# macOS / Linux
USE_DEBUGGER=1 love .
```

```powershell
# Windows PowerShell
$env:USE_DEBUGGER = "1"
love .
```

```bat
:: Windows cmd.exe
set USE_DEBUGGER=1 && love .
```

> [!NOTE]
> Leave `USE_DEBUGGER` unset, `0`, or `false` in production-like runs so Feather is not loaded at all.

Before packaging a release, run:

```bash
feather remove
```

Use `--dry-run` first to preview:

```bash
feather remove --dry-run
```

The remove command only edits generated `FEATHER-INIT` blocks and removes generated Feather files it can identify. If you want to keep part of the setup:

```bash
feather remove --keep-config
feather remove --keep-runtime
feather remove --keep-main
```

> [!TIP]
> This is the recommended workflow for most projects because Feather can clean up after itself before production packaging.

### Level 3 — Guard manual requires

If you wire Feather by hand, wrap the entire setup in a conditional so the library is never loaded in production:

```lua
if Config.IS_DEBUG then
  require("feather.auto").setup({ sessionName = "My Game" })
end

function love.update(dt)
  if DEBUGGER then DEBUGGER:update(dt) end
end
```

No Lua code runs and no globals are created in release builds.

### Level 4 — Exclude from the release build

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

> [!IMPORTANT]
> No Feather code or assets are present in the release build. This also eliminates the Console plugin as an attack surface entirely.

If you use manual mode, also exclude or remove:

```txt
feather.debugger.lua
feather.config.lua
```

`feather remove --yes` handles these generated files automatically when they are present.

---

## In-game Observability

[OverlayStats](https://github.com/Oval-Tutu/bootstrap-love2d-project/blob/main/game/lib/overlayStats.lua) by [Oval-Tutu](https://github.com/Oval-Tutu) is a great companion for visualizing performance directly in the game window. Feather's performance plugin draws inspiration from it.
