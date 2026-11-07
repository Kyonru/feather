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
  __DANGEROUS_INSECURE_CONNECTION__ = true,
}
```

Setting `__DANGEROUS_INSECURE_CONNECTION__ = true` is your acknowledgment that the game accepts commands from any Feather desktop on the network. Feather will not start without one of these two options — there is no silent fallback.

`feather init` prompts for the App ID during setup and writes it to `feather.config.lua` automatically. To find it: open the Feather desktop app → **Settings** → **Security** → **Desktop App ID**.

> [!NOTE]
> `appId` identifies the **desktop app instance**, not a user or secret. If you reinstall or reset the desktop app, regenerate the App ID in Settings and update `feather.config.lua`.
>
> `appId` prevents accidental cross-talk between development machines on the same network — it is not a cryptographic guarantee and is not a substitute for proper network isolation in shared or untrusted environments.

### API Key (`apiKey`) — required only for the Console plugin

Set `apiKey` in the game config and match it in the Feather desktop app Settings. This gates access to the Console / REPL plugin (remote Lua execution):

```lua
-- feather.config.lua
return {
  include = { "console" },
  apiKey = "your-api-key",
}
```

### Console plugin

> [!WARNING]
> Do not include the Console plugin in builds shipped to users. It allows remote code execution and can be a serious security risk.

### MCP Access

Feather's MCP support is intended for local development automation. Keep **Settings → Security → MCP Access** disabled unless an MCP client is actively connected.

When enabled, the desktop bridge:

- binds only to `127.0.0.1` on port `4005` by default;
- requires the generated bearer token written to `~/.feather/mcp.json`;
- redacts `appId`, `apiKey`, tokens, passwords, and secrets from exposed MCP resources;
- exposes Shader Graph, Particles Playground, Texture Lab, and plugin catalog/live state as local development surfaces;
- keeps Console eval behind the normal Console plugin, `evalEnabled`, and `apiKey` gates.

Use stdio for local AI clients when possible:

```bash
feather mcp
```

Use Streamable HTTP only when the MCP host needs it, and keep the default localhost binding:

```bash
feather mcp --transport http
```

See [MCP](mcp.md) for the complete resource/tool list and client setup examples.

---

## CLI-Managed Debugging

> [!IMPORTANT]
> The CLI is the preferred workflow for desktop, web, Android, iOS, and packaged desktop builds. You do not need to add `require("feather.auto")`, call `DEBUGGER:update(dt)`, or keep Feather-specific code in your game.

Use the CLI for local and platform runs:

```bash
feather init path/to/my-game
feather run path/to/my-game
feather run path/to/my-game --target web
feather run path/to/my-game --target android
feather run path/to/my-game --target ios
```

Add vendors for platform targets once per project:

```bash
feather build vendor add all --dir path/to/my-game
```

Run doctor as a release gate before packaging:

```bash
feather doctor path/to/my-game --production
feather doctor path/to/my-game --target all
```

`--production` exits with code `1` for release blockers such as insecure connections, weak Console auth, hot reload, debugger/screenshot/disk persistence settings, network exposure with weak auth, or unmanaged embedded Feather runtime.

For CI systems that need a security-only machine-readable report:

```bash
feather doctor path/to/my-game --security --json
```

The security report includes config posture, plugin trust, package provenance, and network exposure. It redacts sensitive values such as `apiKey`.

If you use Feather's local release helpers, keep release metadata in `feather.build.json` and let doctor check the target-specific tools before CI runs the build:

```bash
feather build vendor add all --dir path/to/my-game --json
feather build web --dir path/to/my-game --json
feather build android --dir path/to/my-game --release --json
feather build ios --dir path/to/my-game --release --json
feather build windows --dir path/to/my-game --json
feather upload itch web --dir path/to/my-game --dry-run --json
```

Web builds package a local love.js player; mobile targets use official LÖVE templates; desktop targets use local LÖVE runtime vendors. Mobile release mode is opt-in with `--release` and produces Android AAB/APK or iOS archive/IPA artifacts. Release builds do not auto-embed Feather's debugger runtime.

For store-oriented mobile releases, Feather can also scaffold and run editable Fastlane lanes:

```bash
feather release init --dir path/to/my-game
feather release ios beta --dir path/to/my-game
feather release ios production --dir path/to/my-game
feather release android beta --dir path/to/my-game
feather release android production --dir path/to/my-game
```

Fastlane is optional. Feather still creates the clean mobile artifact first, then passes explicit `FEATHER_*` environment variables to the selected lane. Keep secrets such as App Store Connect keys, Google Play service account JSON, Android keystore passwords, and match credentials in your shell or CI environment; `feather.build.json` should only contain non-secret ids and environment variable names.

---

## Performance

> [!WARNING]
> Feather is a development tool, not something you should ship in production builds. Prefer CLI-managed runs and builds so release artifacts stay clean by default.

### Release builds

```bash
feather build android --dir path/to/my-game --release
feather build ios --dir path/to/my-game --release
```

`--release` disables automatic debugger embedding for mobile builds. The generated `.love` used for the release artifact contains the game source, not Feather's injected `.feather-main.lua`, `feather/auto.lua`, plugin files, or generated debug config.

### Self-cleaning managed files

If you used `feather init` while experimenting, Feather can preview and remove its own generated files:

```bash
feather remove path/to/my-game --dry-run
feather remove path/to/my-game --yes
```

The remove command only edits generated `FEATHER-INIT` blocks and removes generated Feather files it can identify. If you want to keep part of the setup:

```bash
feather remove path/to/my-game --keep-config
feather remove path/to/my-game --keep-runtime
feather remove path/to/my-game --keep-main
```

> [!TIP]
> This is the recommended workflow for most projects because Feather can clean up after itself before production packaging.

### Advanced manual integration

Manual Lua integration is still available for unusual projects, but it is no longer the recommended path. If you wire Feather by hand, wrap the entire setup in a conditional so the library is never loaded in production:

```lua
if Config.IS_DEBUG then
  require("feather.auto").setup({ sessionName = "My Game" })
end

function love.update(dt)
  if DEBUGGER then DEBUGGER:update(dt) end
end
```

No Lua code runs and no globals are created in release builds.

### Manual exclusion

If you manually vendored Feather, excluding it is a single glob:

**Manual zip:**

```bash
zip -r MyGame.love . \
  -x "*.git*" \
  -x "lib/feather/*"
```

**[makelove](https://github.com/pfirsich/makelove)** — add to `makelove.toml`:

```toml
[love_files]
exclude = ["feather/**"]
```

> [!IMPORTANT]
> No Feather code or assets are present in the release build. This also eliminates the Console plugin as an attack surface entirely.

If you used manual mode, also exclude or remove:

```txt
feather.debugger.lua
feather.config.lua
```

`feather remove --yes` handles these generated files automatically when they are present.

---

## In-game Observability

[OverlayStats](https://github.com/Oval-Tutu/bootstrap-love2d-project/blob/main/game/lib/overlayStats.lua) by [Oval-Tutu](https://github.com/Oval-Tutu) is a great companion for visualizing performance directly in the game window. Feather's performance plugin draws inspiration from it.
