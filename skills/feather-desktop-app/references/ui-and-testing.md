# UI And Testing

## UI conventions

- Use the existing app shell, navigation, and page layout components.
- Keep controls compact and predictable.
- Use lucide-react icons for tool buttons where available.
- Use tabs for view switching, switches/checkboxes for booleans, selects/menus for option sets, and inputs/sliders for numeric or text values.
- Prefer readable dense panels over landing-page composition.
- Avoid nested cards and decorative backgrounds.
- Make fixed-format tools use stable dimensions so hover states and dynamic labels do not shift layout.

## Plugin UI rendering

Plugin UI payloads are serialized Lua node trees. The desktop renderer should:

- tolerate unknown fields
- handle missing optional labels defensively
- route buttons to plugin action requests
- route form node changes to params updates
- avoid plugin-specific assumptions when generic node types work

If a new node type is added, update Lua helpers, desktop renderer, docs, and tests together.

## Verification commands

- `npm run typecheck:web`
- `npm run build`
- `npm run test:app:e2e`
- `npm run test:showcase:e2e`

For UI changes, use Playwright screenshots or app smoke checks when visual regressions are plausible.

## Test taxonomy

- App workflows: `e2e/app.spec.ts` via `npm run test:app:e2e`.
- Showcase/browser-only creative tools: `e2e/showcase.spec.ts` via `npm run test:showcase:e2e`.
- Tauri/Rust protocol behavior: Rust tests in `src-tauri/src/ws_server.rs` via the relevant cargo test.
- Lua/plugin wire payloads: `npm run test:lua:e2e`.

## Accessibility and resilience

- Keep button labels/tooltips clear for icon-only actions.
- Ensure long user strings do not overlap adjacent content.
- Show empty, loading, disconnected, and error states where protocol data may be unavailable.
