# Feather Roadmap

## 0.1.3 – Core Stability

- [ ] Fix deep linking pointer
- [ ] Fix deep linking

  ```ts
  {
    "tauri": {
      "security": {
        "dangerousDisableAssetCspModification": false,
        "csp": null
      },
      "allowlist": {
        "shell": {
          "open": true,
          "scope": ["vscode://*"]
        }
      }
    }
  }
  ```

- [ ] Log levels & colors

---

## 0.2.0 – Developer Customization

- [ ] Add settings:
  - custom port
  - custom URL
  - dark/light mode
  - custom editor deeplinking
  - default settings
  - download feather rock file for the version you are using
- [ ] Add basic plugin support
- [ ] Add optional plugins:
  - SIGNAL
  - LUA STATE
  - CARGO
- [ ] Mini overlay mode

---

## 0.3.0 – Variable Inspection

- [ ] Change `test` folder to `example` folder
- [ ] Add Tests
- [ ] Add mismatch version notification
- [ ] Add check for updates
- [ ] Editable observed variables
- [ ] Logs should be fetched globally not in tab

---

## 0.4.0 – Performance & Assets

- [ ] Add about page
- [ ] Add changelog page
- [ ] Add license page
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

**Legend:**

- **Low Effort**: UI or small logic changes
- **Medium Effort**: New UI + backend work
- **High Effort**: Requires significant architecture or API work
