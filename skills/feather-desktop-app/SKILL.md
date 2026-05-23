---
name: feather-desktop-app
description: Work on Feather's React and Tauri desktop app, pages, hooks, stores, WebSocket session model, plugin UI rendering, design patterns, and Playwright checks.
---

# Feather Desktop App

## When to use

Use this skill when changing the desktop React/Tauri app, session UI, settings, plugin rendering, shader or particle tools, WebSocket state, or app-level tests.

## First pass

- Start with `src/router.tsx`, `src/providers.tsx`, and the relevant page under `src/pages/`.
- Follow data flow through `src/hooks/`, `src/store/`, and `src/lib/send-command.ts`.
- For architecture and session flow, load [app architecture](references/app-architecture.md).
- For UI conventions and testing, load [UI and testing](references/ui-and-testing.md).
- For Tauri commands, WS events, auth, and the Rust layer, load [tauri and protocol](references/tauri-and-protocol.md).
- If the change affects plugin payload rendering, also use `feather-plugin-authoring`.

## Core rules

- The desktop app is an operational devtool, not a marketing site. Keep screens dense, scannable, and task-focused.
- Preserve existing React, hook, store, and page-layout patterns before adding new abstractions.
- Keep WebSocket/session state centralized enough that pages do not each invent protocol handling.
- Plugin UI is rendered from serialized Lua payloads. React should remain an implementation detail for plugin authors.
- Keep Tauri APIs behind existing utility patterns for file dialogs, opener, filesystem, and platform behavior.
- Use existing component and styling conventions; this repo already uses Radix/Base UI, Tailwind, lucide-react, and local components.
- Avoid large visual rewrites unless the task asks for them.

## Common implementation map

- App entry: `src/main.tsx`, `src/providers.tsx`, `src/router.tsx`.
- Pages: `src/pages/`.
- Shared components: `src/components/`.
- Hooks: `src/hooks/`.
- Stores: `src/store/`.
- Protocol constants: `src/constants/feather-api.ts`, `src/constants/server.ts`.
- Command sending: `src/lib/send-command.ts`.
- Tauri utilities: `src/utils/linking.ts`, `src/utils/file.ts`, `src/utils/platform.ts`.
- Tauri/Rust layer: `src-tauri/src/ws_server.rs`, `lib.rs`, `cli_status.rs`.
- Showcase app: `src/showcase/` (browser-only, no Tauri, own Vite/Playwright configs).

## Verification

- Add or update e2e coverage for desktop behavior changes; use Playwright app e2e for desktop workflows and showcase e2e for browser-only creative tools.
- Typecheck/build web app: `npm run build` or targeted typecheck when appropriate.
- Run Playwright app e2e: `npm run test:app:e2e`.
- Run showcase e2e when showcase or creative tools change: `npm run test:showcase:e2e`.
- For Tauri-specific behavior, use relevant Rust/Tauri tests where available.

## Docs touchpoints

- Update docs for user-visible desktop behavior, settings, protocol behavior, or creative tool workflows in the same change as the implementation.
- Update `CHANGELOG.md` for user-visible app UI, settings, protocol, Tauri, showcase, or Playwright e2e coverage changes.
- User-visible desktop workflows may need `docs/usage.md`, `docs/debugger.md`, `docs/assets.md`, or `docs/session-replay.md`.
- Showcase-specific changes may need `docs/standalone-showcase.md`.
- Protocol or security changes may need `docs/configuration.md` and `docs/recommendations.md`.
- When a desktop workflow is backed by a plugin or subsystem README, prefer editing that source-side doc and exposing it through `docs/` with a symlink.

## Avoid

- Do not hard-code plugin-specific React behavior when a generic plugin UI node can cover it.
- Do not put secrets, API keys, or command auth material in persistent UI logs.
- Do not let text overflow controls or create overlapping responsive layouts.
- Do not use decorative-heavy layouts that slow down repeated debugging workflows.
