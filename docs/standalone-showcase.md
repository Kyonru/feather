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
