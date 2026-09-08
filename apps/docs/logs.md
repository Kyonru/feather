# Logs

The **Logs** page shows live `print()` output, Feather lifecycle events, structured log entries, errors, traces, and restored log history from recent sessions.

## Capture Logs

Enable `wrapPrint` to forward normal `print()` calls:

```lua
local debugger = FeatherDebugger({
  debug = true,
  wrapPrint = true,
})
```

You can also send structured logs directly:

```lua
debugger:print("Something happened")

debugger:log({
  type = "combat",
  str = "Player took damage",
})

debugger:trace("Entering boss arena")
debugger:error("Inventory state is invalid")
```

Normal websocket log lines are batched in small groups to reduce runtime overhead. Error, fatal, start, and finish events flush immediately so important failures are not delayed behind verbose output.

## Follow Tail And Filters

Use **Follow tail** while reproducing an issue so new output stays visible. Disable it when you want to inspect older entries without the table jumping.

Search and filters apply to the visible log table. Use type/source filters for noisy sessions, then clear them when you need the full timeline again.

## Persistence

Live session logs are cached locally in the desktop app. Reopening Feather or restarting a CLI-launched game restores recent log history for the saved session/project, so the previous run is still available after a normal restart.

Feather also writes `.featherlog` files when disk logging is enabled:

```lua
local debugger = FeatherDebugger({
  writeToDisk = true,
  outputDir = "logs",
})
```

Screenshots and other large binary entries stay out of the desktop log cache to avoid storage quota problems during verbose sessions.

## Working With Verbose Sessions

For noisy games:

- prefer structured `type` values so filters are useful;
- keep follow-tail enabled only while actively watching live output;
- clear the visible session log when you have saved the information you need;
- leave error/fatal logs as immediate signals and let normal output batch.

