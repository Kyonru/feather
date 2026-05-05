# Feather Roadmap

## 0.7.0 – Stability & Bug Fixes

- [ ] Fix observable bugs
  - [ ] Large names overflow
  - [ ] Large responses crash the app
  - [ ] Printing more than one parameter
- [ ] Full OS & Love2D version testing (Windows/macOS/Linux)
- [ ] Smooth UI under heavy load spikes
- [ ] Add tests

---

## 0.8.0 – Observability & Data

- [ ] Table diffing in observed variables
- [ ] Add app disk usage
- [ ] Add option to clear unused screenshots
- [ ] Low-overhead mode for production builds

---

## 0.9.0 – Assets & Resources

- [ ] Asset viewer (textures, audio list)
- [ ] Shader viewer
- [ ] Font inspector
- [ ] Sprite atlas explorer
- [ ] Graceful handling for unloaded/missing assets

---

## 0.10.0 – Developer Experience & Polish

- [ ] Hot-reload Lua modules
- [ ] Persistent filtered views & layout settings
- [ ] Documentation site + short demo videos
- [ ] Polish, branding, and onboarding docs

---

## 1.0.0 – Trust Release

- [ ] Security pass (remote debugging encryption, safe eval defaults)
- [ ] Improve security (commands, folders, os scripts)
- [ ] Add Developer signature to app to avoid installation warnings
- [ ] Add privacy policy
- [ ] Public plugin library launch
- [ ] Add i18n support
- [ ] Add multiple engine support - TBD
- [ ] Announce to broader gamedev communities
- [ ] BIG FEATURES
  - [ ] Step by step debugging like VS code
  - [ ] Time-Travel Debugging (Frame Timeline + State Snapshots)
    - [ ] Core idea:
      - [ ] Record frames → scrub backwards → inspect what happened
        - [ ] What it looks like in practice
          - [ ] 1. Timeline scrubber
            - [ ] horizontal bar of frames
            - [ ] pause game
            - [ ] drag back in time
          - [ ] 2. Per-frame data
            - [ ] Each frame stores:
              - [ ] logs
              - [ ] input events (your TYPE_LABELS system fits perfectly here)
              - [ ] selected state snapshot
          - [ ] 3. State inspector (this is the magic)
            - [ ] Click a frame → see:
              ```lua
              player = {
                x = 120,
                y = 340,
                velocity = { x = 2, y = -5 },
                state = "jumping"
              }
              ```
          - [ ] Now scrub one frame forward:
            ```lua
              player.y = 335
            ```
            > → You see exactly when things break
          - [ ] 1. Diff view (this is what makes it addictive)
            - [ ] Show changes between frames:
              ```
              player.y: 340 → 335
              velocity.y: -5 → -4.7
              state: "jumping" → "falling"
              ```
              > This replaces HOURS of print debugging.

---
