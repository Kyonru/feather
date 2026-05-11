# Feather Roadmap

## Guiding Direction

### Core Priorities

1. Stability & trust first
2. Strong observability/debugging foundation
3. Asset/runtime inspection workflow
4. Fast iteration & hot-reload experience
5. Extensible plugin ecosystem
6. Public/community-ready release

---

## 0.10.x — Iteration Workflow & Developer Experience

Focus:
Reduce iteration time and improve daily usability.

### 0.10.0 – Developer Experience & Workflow

#### Graphics Tooling

- [ ] Shader inspector
  - [ ] View/edit GLSL uniforms
  - [ ] Hot-reload shader files

- [ ] Sprite atlas explorer
- [ ] Font inspector

#### Runtime Visualization

- [ ] Scene graph inspector
  - [ ] Visualize draw order
  - [ ] Entity hierarchy tree
  - [ ] Collapsible runtime tree view

#### Workspace Experience

- [ ] Persistent filtered views
- [ ] Persistent layout settings
- [ ] Saved debugger sessions
- [ ] Better keyboard shortcuts

---

## 0.11.x — Plugin Ecosystem

Focus:
Turn Feather into a platform instead of only a debugger.

### 0.11.0 – Plugins & Extensions

#### Official Plugins

- [ ] Scene graph inspector
- [ ] Shader inspector
- [ ] Save data inspector

---

## 1.0.0 — Trust Release

Focus:
Production-ready release with security, trust, and community adoption.

### Security & Safety

- [ ] Security pass
  - [ ] Remote debugging encryption
  - [ ] Command validation
  - [ ] File/folder restrictions
  - [ ] OS script protections

### Platform Readiness

- [ ] Add developer signature to avoid installation warnings
- [ ] Add privacy policy
- [ ] Improve crash recovery
- [ ] Final compatibility validation

### Internationalization

- [ ] Add i18n support

### Ecosystem Expansion

- [ ] Multiple engine support (TBD)

### Launch

- [ ] Public release campaign
- [ ] Announce to broader gamedev communities
- [ ] Community showcase/demo projects
- [ ] Creator partnerships/tutorials

#### Quality

- [ ] Add stress-test scenarios
- [ ] Improve error reporting/logging

#### Platform Reliability

- [ ] Full OS & Love2D version testing (Windows/macOS/Linux)
- [ ] Smooth UI under heavy load spikes
- [ ] Graceful recovery from debugger disconnects
- [ ] Improve websocket stability and reconnection handling

#### Performance

- [ ] Low-overhead runtime communication improvements
- [ ] Reduce observer serialization overhead
- [ ] Optimize screenshot/memory handling

---

## Ideas

- Being able to generate (maybe from a couple of templates \ pre made docker images) android and ios projects where lua code can be embedded, similar to how expo for react native works. (explore how to make hot reloading possible, but not needed for first iteration).
  - `feather build android`
  - `feather build ios`
  - `feather build steamos`
  - `feather build web`
- Ideally when building android and ios, the project should use cache from previous build to reduce the amount of time it takes to see lua code in mobile.
- Step by step setup guide for Steam deck (what legally is allowed).
- Release command, takes care of removing feather if integrated, and prepare builds with release flavors
  - `feather release android`
- Interactive itch.io \ steam releases (also non-interactive)
  - `feather upload itch.io`
- feather needs to be able to read from a secret file and inject them to builds if possible.
  - Doctor should say what's missing to be able to use these commands (sdks, where to get them, etc).
  - maybe a `feather.yml` to configure the cli
- Easy integration with CLI

Goals: Being as close as possible to expo
