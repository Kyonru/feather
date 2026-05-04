# Features

## High Impact — Core Development

### Draw Call / Render Overlay Plugin

visualize collision boxes, physics bodies, sprite bounds. Toggle wireframe overlay via a plugin action. Uses love.graphics.setWireframe or draws debug shapes on top of the game.

### Asset Hot-Reload Plugin

watch for file changes in image/audio/shader directories, push a reload command from desktop, or auto-reload on love.filedropped. Saves the restart-tweak-restart cycle.

## Medium Impact — Productivity

### Network Inspector Plugin

for multiplayer games, log outgoing/incoming packets with timestamps, sizes, and decoded payloads. Similar to browser DevTools Network tab.

### Audio Debug Plugin

list active audio sources, their state (playing/paused/stopped), volume, position. Toggle mute from desktop.

### Shader Editor Plugin

edit GLSL shaders live from the desktop, push changes via WS, hot-swap with love.graphics.newShader. Show compilation errors inline.

## Nice to Have

### Bookmark / Annotation Plugin

tag specific moments during play (e.g. "bug here", "feels laggy") with a hotkey, saved with timestamp. Desktop shows them as markers on a timeline alongside performance data.

### Config Tweaker Plugin

expose game config values (gravity, speed, spawn rate) as sliders/inputs in the desktop UI. Uses the existing actions system with type = "input".

### Memory Snapshot Plugin

take snapshots of collectgarbage("count") plus table sizes at specific moments, diff between snapshots to find leaks.
