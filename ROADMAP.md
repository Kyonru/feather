# Feather Roadmap

## 0.2.0 – Developer Customization

- [x] Add settings and about page:
  - [x] custom port
  - [x] custom URL
  - [x] dark/light mode
  - [x] custom editor deeplinking
  - [x] default settings
  - [x] download feather rock file for the version you are using
- [x] Add basic plugin support
- [x] Add optional plugins:
  - [x] SIGNAL
  - [x] LUA STATE
  - [ ] ~~CARGO~~
- [x] Add plugin documentation
- [ ] ~~Mini overlay mode~~

Use OverlayStats instead (see [this](https://github.com/Oval-Tutu/bootstrap-love2d-project/blob/main/game/lib/overlayStats.lua)).

---

## 0.3.0 – Variable Inspection

- [x] Change `test` folder to `demo` folder
- [ ] Add Tests
- [x] Add mismatch version notification
- [ ] Add check for updates
- [ ] Editable observed variables
- [ ] Logs should be fetched globally not in tab
- [ ] Add optional screenshot on error
- [ ] Add clear logs button

---

## 0.4.0 – Performance & Assets

- [x] Add about page
- [ ] Add changelog page (github link)
- [ ] Add license page (github link)
- [ ] Asset viewer (textures, audio list)
- [ ] Table diffing in observed variables
- [ ] Add Security Information section to README

---

## 0.5.0 – Community Release

- [ ] Plugin API improvements
- [ ] Expression evaluator (`eval` in game)
- [ ] Entity/component list
- [ ] Bounding box overlay toggle
- [ ] Remote connect to other devices
- [ ] Polish, branding, and onboarding docs

---

## 0.6.0 – Stability & Compatibility

- [ ] Full OS & Love2D version testing (Windows/macOS/Linux)
- [ ] Add remote debugging
- [ ] Fix edge cases for large log/variable data
- [ ] Configurable performance sampling interval
- [ ] Low-overhead mode for production builds, scripts and plugins to disable code in production

---

## 0.7.0 – Plugin System Maturity

- [ ] Stable public plugin API documentation
- [ ] Runtime load/unload plugins
- [ ] Versioned plugin compatibility
- [ ] Example plugin repository for community use

---

## 0.8.0 – Asset/Resource Expansion

- [ ] Shader viewer
- [ ] Font inspector
- [ ] Sprite atlas explorer
- [ ] Graceful handling for unloaded/missing assets

---

## 0.9.0 – UX & Developer Experience Polish

- [ ] Hot-reload Lua modules
- [ ] Expression evaluator safe mode
- [ ] Persistent filtered views & layout settings
- [ ] Smooth UI under heavy load spikes
- [ ] Documentation site + short demo videos

---

## 1.0.0 – Trust Release

- [ ] Security pass (remote debugging encryption, safe eval defaults)
- [ ] Public plugin library launch
- [ ] Announce to broader gamedev communities
- [ ] Add i18n support

---
