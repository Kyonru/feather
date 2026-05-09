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

## 0.8.x — Observability & Runtime Data

Focus:
Build the core runtime inspection experience.

#### Runtime Insights

- [ ] Add app disk usage
- [ ] Add memory usage tracking
- [ ] Add frame-time/performance metrics
- [ ] Low-overhead mode for production builds

#### File & State Management

- [ ] Add option to clear unused screenshots
- [ ] Save data inspector
  - [ ] Read/write `love.filesystem` save files
  - [ ] JSON preview/editor
  - [ ] Binary save inspection support

#### Plugin System Foundations

- [ ] Initial plugin API architecture
- [ ] Plugin sandboxing model
- [ ] Internal plugin loader

---

#### CLI

- [CLI.ROADMAP.md](CLI.ROADMAP.md)

## 0.9.x — Assets & Runtime Inspection

Focus:
Inspect and manipulate game resources live.

### 0.9.0 – Assets & Resources

#### Asset Viewer

- [ ] Asset viewer
  - [ ] Loaded textures
  - [ ] Audio sources
  - [ ] Fonts
  - [ ] Runtime previews

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

#### Reliability

- [ ] Graceful handling for unloaded/missing assets

---

## 0.10.x — Iteration Workflow & Developer Experience

Focus:
Reduce iteration time and improve daily usability.

### 0.10.0 – Developer Experience & Workflow

#### Hot Reloading

- [ ] Hot-reload Lua modules
  - [ ] Watch file changes
  - [ ] Auto-clear `package.loaded`
  - [ ] Re-require changed modules
  - [ ] Reload directly from debugger edits

#### Runtime Control

- [ ] Tween inspector
  - [ ] Live tween visualization
  - [ ] Flux/hump.timer integration
  - [ ] Progress bars
  - [ ] Pause/cancel tweens remotely

#### Workspace Experience

- [ ] Persistent filtered views
- [ ] Persistent layout settings
- [ ] Saved debugger sessions
- [ ] Better keyboard shortcuts

#### Documentation & Onboarding

- [ ] Documentation website
- [ ] Short demo videos
- [ ] Quick-start templates
- [ ] Example Love2D integrations

#### UI/UX Polish

- [ ] Improve branding
- [ ] Improve onboarding
- [ ] UI polish pass

---

## 0.11.x — Plugin Ecosystem

Focus:
Turn Feather into a platform instead of only a debugger.

### 0.11.0 – Plugins & Extensions

#### Public Plugin API

- [ ] Stable plugin API
- [ ] Plugin lifecycle hooks
- [ ] Desktop ↔ runtime communication APIs

#### Official Plugins

- [ ] Scene graph inspector
- [ ] Tween inspector
- [ ] Shader inspector
- [ ] Save data inspector
- [ ] Asset viewer

#### Distribution

- [ ] Public plugin library
- [ ] Plugin installer UI
- [ ] Plugin version management
- [ ] Plugin marketplace website

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

- [ ] Add automated tests
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
