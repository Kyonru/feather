# Lifecycle And UI

## Lifecycle methods

Plugins extend `FeatherPlugin` from `src-lua/feather/core/base.lua` and may implement:

- `init(config)`
- `update(dt, feather)`
- `onerror(msg, feather)`
- `handleRequest(request, feather)`
- `handleActionRequest(request, feather)`
- `handleActionCancel(request, feather)`
- `handleParamsUpdate(request, feather)`
- `finish(feather)`
- `getConfig()`
- `isSupported(version)`

`handleRequest` is the normal push-cycle data path from game to desktop. Action, cancel, and params methods respond to desktop-originated interaction.

## Callback bus

Use `config.callbacks.register(name, fn, opts)` for Love2D callbacks. Supported callback names include draw, keyboard, mouse, touch, joystick, and gamepad callbacks.

Priority is optional:

- no priority: FIFO
- lower numbers run earlier
- higher numbers run later
- equal priorities preserve FIFO

Legacy `onDraw`, `onKeypressed`, and related methods still route through the same bus.

## Declarative UI

Plugins can return UI trees through `feather.ui.render(...)`. The boundary is:

```txt
Lua plugin -> Feather UI tree -> Feather protocol -> React renderer
```

Supported node families include:

- layout: `panel`, `row`, `column`, `tabs`, `tab`, `separator`
- text/status: `text`, `badge`, `stat`, `progress`, `alert`, `code`
- inputs: `input`, `textarea`, `checkbox`, `switch`, `select`
- rich data: `list`, `table`, `timeline`, `inspector`, `image`, `link`
- actions: `button`

Buttons send `action` to `handleActionRequest`. Form nodes use `name` for `handleParamsUpdate`.

## Payload expectations

- Keep payloads stable and serializable.
- Prefer small incremental updates over large repeated snapshots when possible.
- Use binary-aware paths already present in runtime/desktop code for large text or assets.
- Keep labels and IDs stable enough for the desktop renderer and tests.
