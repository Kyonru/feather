---
name: feather-desktop-app
description: Work on Feather's two React + Tauri desktop apps — Inspector (session debugging, pages, hooks, stores, WebSocket session model, plugin UI rendering) and Studio (shader graph, texture lab, particle playground) — plus the web showcase and their Playwright checks.
---

# Feather Desktop Apps

## When to use

Use this skill when changing Inspector (session UI, settings, plugin rendering, WebSocket state), Studio (the shader, texture and particle tools), the showcase, or their app-level tests.

They are separate applications ([architecture](../../apps/docs/architecture.md)): Inspector owns the game session; Studio is a local authoring tool that can optionally pair with Inspector through `packages/session-bridge`. Neither imports the other — `no-restricted-imports` enforces it and `pnpm run check:artifact-boundary` checks the built bundles. Shared code goes in `packages/ui` or `packages/host`. Read [design rules](references/design-rules.md) before changing an existing feature's behaviour or UI.

## First pass

- Inspector: start with `apps/inspector/src/router.tsx`, `apps/inspector/src/providers.tsx`, and the relevant page under `apps/inspector/src/pages/`.
- Studio: start with `apps/studio/src/StudioApp.tsx` and the tool under `apps/studio/src/tools/`.
- Follow data flow through `apps/inspector/src/hooks/`, `apps/inspector/src/store/`, and `apps/inspector/src/lib/send-command.ts`.
- For architecture and session flow, load [app architecture](references/app-architecture.md).
- For product direction, interface semantics, and the Inspector/Studio distinction, load [design rules](references/design-rules.md).
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

- App entry: `apps/inspector/src/main.tsx`, `apps/inspector/src/providers.tsx`, `apps/inspector/src/router.tsx`.
- Pages: `apps/inspector/src/pages/`.
- Shared components: `apps/inspector/src/components/`.
- Hooks: `apps/inspector/src/hooks/`.
- Stores: `apps/inspector/src/store/`.
- Protocol constants: `apps/inspector/src/constants/feather-api.ts`, `apps/inspector/src/constants/server.ts`.
- Command sending: `apps/inspector/src/lib/send-command.ts`.
- Tauri utilities: `apps/inspector/src/utils/linking.ts`, `apps/inspector/src/utils/file.ts`, `apps/inspector/src/utils/platform.ts`.
- Tauri/Rust layer: `apps/inspector/src-tauri/src/ws_server.rs`, `lib.rs`, `cli_status.rs`.
- Studio: shell `apps/studio/src/StudioApp.tsx`, tools `apps/studio/src/tools/{shader-graph,particle-system-playground,texture-lab}/`, Inspector pairing `apps/studio/src/useInspectorBridge.ts`, Rust shell `apps/studio/src-tauri/`.
- Showcase: `apps/showcase/` is a thin web shell; what it renders is Studio's public web mount in `apps/studio/src/showcase/` (browser-only, no Tauri, no session bridge).

## Verification

- Add or update e2e coverage for desktop behavior changes; use Playwright app e2e for desktop workflows and showcase e2e for browser-only creative tools.
- Typecheck: `pnpm run verify` (every app and package), or `pnpm run typecheck:web` / `pnpm run typecheck:studio` for one.
- Run Playwright app e2e: `pnpm run test:inspector:e2e` (Inspector) and `pnpm run test:studio:e2e` (Studio).
- Run showcase e2e when Studio's tools or the showcase change: `pnpm run test:showcase:e2e`.
- After changing either app's build or imports: `pnpm run build && pnpm run studio:build && pnpm run check:artifact-boundary`.
- For Tauri-specific behavior, use relevant Rust/Tauri tests where available.

## Docs touchpoints

- Update docs for user-visible desktop behavior, settings, protocol behavior, or creative tool workflows in the same change as the implementation.
- Update `CHANGELOG.md` for user-visible app UI, settings, protocol, Tauri, showcase, or Playwright e2e coverage changes.
- User-visible desktop workflows may need `apps/docs/usage.md`, `apps/docs/debugger.md`, `apps/docs/assets.md`, or `apps/docs/session-replay.md`.
- Showcase-specific changes may need `apps/docs/standalone-showcase.md`.
- Protocol or security changes may need `apps/docs/configuration.md` and `apps/docs/recommendations.md`.
- When a desktop workflow is backed by a plugin or subsystem README, prefer editing that source-side doc and exposing it through `apps/docs/` with a symlink.

## Avoid

- Do not hard-code plugin-specific React behavior when a generic plugin UI node can cover it.
- Do not put secrets, API keys, or command auth material in persistent UI logs.
- Do not let text overflow controls or create overlapping responsive layouts.
- Do not use decorative-heavy layouts that slow down repeated debugging workflows.
