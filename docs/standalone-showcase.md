# Standalone Showcase

The standalone showcase is a browser-hosted version of Feather's visual authoring
tools. It lets you try the Shader Graph and Particle System Playground without
starting the desktop app or connecting a local LÖVE project.

[Open the standalone showcase](https://feather-showcase.up.railway.app/)

Use it to experiment with shader nodes, preview generated GLSL, tune particle
emitters, scrub particle timelines, and see how the tools feel before wiring them
into a running game. The showcase runs separately from the documentation site so
its LÖVE preview can use the browser isolation headers required by love.js. The
particle preview receives the same timeline play/seek payloads as the desktop
tool, including clip timing and keyframe lanes.

## What Works There

- **Shader Graph** runs in the browser with the same graph editor, code output,
  template controls, node previews, and love.js preview target used by the
  desktop development flow.
- **Particle System Playground** runs with the same emitter editor, timeline,
  keyframe easing, local preview, and export workflow.
- Generated shader graphs and particle projects can be exported and imported
  between the showcase and the desktop app.

The showcase does not connect to a running game. Connected-game preview actions
such as **Show in Game**, runtime overlay apply, or game-owned particle systems
are only available from the Feather desktop app with a live session.

## Local Development

Use the showcase dev server when working on the browser-hosted tools:

```bash
npm run showcase:dev
```

The dev server prepares a real love.js preview target when possible. It serves
the generated love.js player and `showcase.love` bundle from an ignored
development directory, then exposes the preview under `/showcase-lovejs/`.

If the love.js player is not already available, the dev helper looks for
`SHOWCASE_LOVEJS_DIR`, `vendor/love.js`, and `.showcase-vendor/love.js`, then may
attempt to fetch a compatible player. For offline work, set
`SHOWCASE_LOVEJS_SKIP_FETCH=1` and provide `SHOWCASE_LOVEJS_DIR` manually.

## Preview Differences

The showcase preview is local to the browser. It should match the generated
shader or particle behavior, but it does not exercise the desktop WebSocket,
Tauri shell, or connected-game runtime. Use the desktop app when you need to
verify runtime session behavior, plugin commands, game-owned objects, or
connected-game overlays.
