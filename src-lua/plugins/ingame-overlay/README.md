# In-Game Overlay

Opt-in LÖVE performance overlay rendered through Feather plugin hooks. This plugin is a copy of the overlayStats.lua in [Oval-Tutu/bootstrap-love2d-project](https://github.com/Oval-Tutu/bootstrap-love2d-project/blob/main/game/lib/overlayStats.lua).

The overlay draws after the game by using the plugin manager's `onDraw` callback,
so your game does not need to call a draw function manually.

## Enable

```lua
return {
  include = { "ingame-overlay" },
}
```

## Controls

- `F3` toggles the overlay.
- `F5` toggles VSync while the overlay is visible.
- Gamepad `Back + A` toggles the overlay.
- Gamepad `Back + B` toggles VSync while the overlay is visible.
- On touch devices, double-tap the top-right corner to toggle the overlay.
- Double-tap inside the visible overlay to toggle VSync.

## Options

```lua
pluginOptions = {
  ["ingame-overlay"] = {
    visible = false,
    sampleSize = 60,
    touchCornerSize = 80,
    doubleTapThreshold = 0.5,
  },
}
```

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `visible` | `boolean` | `false` | Show the overlay immediately on boot. |
| `sampleSize` | `number` | `60` | Number of samples used for moving averages. |
| `touchCornerSize` | `number` | `80` | Top-right touch activation area size in pixels. |
| `doubleTapThreshold` | `number` | `0.5` | Maximum seconds between taps for a double-tap. |



