# Inspector application architecture

> Status (2026-10-16): partially implemented. This is the original audit; see [README.md](./README.md#current-disposition) for the reconciled status.

## Goal

Keep Inspector as one session-oriented application, but separate ingestion, domain state, and UI so
high-volume game traffic does not force every concern through one hook or one active-session global.
Panel-level design and usability work belongs in the
[desktop design rules](../skills/feather-desktop-app/references/design-rules.md).

## Findings

### 1. `use-ws-connection.ts` is an application kernel hidden in a hook (`P1`)

At roughly 1,031 lines it owns:

- Tauri event subscription and retry;
- envelope parsing and binary-reference reconciliation;
- session creation, migration, reconnect, and cleanup;
- a switch for every inbound message;
- React Query writes and Zustand writes;
- log persistence and deduplication;
- debugger bootstrapping;
- file downloads, clipboard writes, ZIP generation, and toasts.

Many hooks and pages still import query keys and data types through this file even though
`src/lib/session-query-keys.ts` now exists. That makes a transport implementation an accidental
public module.

### 2. Multi-session data is split between keyed caches and global active state (`P1`)

React Query data is keyed by session, but `useConfigStore` holds one global `config` and one global
`disconnected` flag. Switching and reconnecting sessions therefore requires imperative copying and
careful ordering in the connection hook. A disconnect event can also drive a global toast even
when another session is active.

### 3. All route modules are eagerly imported (`P1`)

`src/router.tsx` statically imports every major page. The largest pages include Settings (~1,812
lines), Debugger (~1,712), Console (~1,105), plugin content (~1,041), Assets (~956), and Profiler
(~937). Users opening Logs pay parse/evaluation cost for tools they may never open.

### 4. The host boundary is partial (`P2`)

`@feather/host` exists, but many Inspector components and hooks still import `@tauri-apps/*`
directly. `main.tsx` also statically imports both the web and Tauri host implementations before
choosing one. That weakens browser test fidelity and makes capability ownership unclear.

### 5. Domain types live beside transport code (`P2`)

Console, time-travel, replay, and performance consumers import types from
`use-ws-connection.ts`. This reverses the desired dependency: the transport adapter should depend
on domain contracts, never define them for the rest of the app.

### 6. Page and e2e modules are concentrated (`P2`)

Several pages combine query/state adapters, command construction, transformations, layout, and
dialogs. `apps/inspector/e2e/app.spec.ts` is over 3,400 lines. This makes ownership and focused test
selection harder even when behavior is correct.

## Proposed boundaries

```text
native transport adapter
  -> inbound envelope decoder
  -> per-message domain reducer
  -> per-session repository
  -> thin hooks/selectors
  -> routes and components
```

### Transport

Create a non-React connection service that subscribes once and exposes typed control/binary events.
It should know nothing about toasts, downloads, or page components.

### Protocol reducers

Give each domain a small handler: logs, performance, observers, assets, plugins, debugger, console,
time travel, and replay. A central registry maps message type to handler. Unknown and malformed
messages go to one diagnostic channel.

### Per-session repository

Make `SessionRecord` the owner of connection state, config, freshness, and domain cache references.
Derive active config/disconnected state from `activeSessionId`; do not copy it into a second global
store. File sessions can implement the same read model while exposing no live-command capability.

### Effects

Move notification, save-file, clipboard, and ZIP behavior behind explicit effect handlers invoked
from domain events. This lets reducers stay deterministic and unit-testable.

### Routes

Use `React.lazy`/route-level code splitting for heavy surfaces. Keep the shell, Logs, session tabs,
and error boundary in the entry chunk. Prefetch a route on sidebar hover/focus if navigation delay
is measurable.

### Host capabilities

Expand `FeatherHost` only for capabilities genuinely shared by web and Tauri, then migrate direct
imports systematically. Native-only connection setup can remain in a Tauri adapter loaded by the
desktop entry. Use separate entry points or dynamic import so the browser build does not evaluate
Tauri modules.

## Suggested module layout

```text
apps/inspector/src/
  connection/
    service.ts
    tauri-transport.ts
    binary-assembler.ts
    diagnostics.ts
  protocol/
    dispatch.ts
    logs.ts
    performance.ts
    plugins.ts
    debugger.ts
    ...
  sessions/
    repository.ts
    selectors.ts
    persistence.ts
  effects/
    notifications.ts
    exports.ts
```

This is a responsibility sketch, not a requirement to move everything at once.

## Acceptance

- Connection service tests feed recorded messages without mounting React.
- Each message type has one reducer/handler and one domain contract owner.
- Session A disconnecting cannot mark Session B disconnected or replace B's config.
- Heavy routes are absent from the initial production chunk.
- Query keys and domain types have no dependency on the transport hook.
- Browser entry has no eager Tauri module evaluation.
- Existing Inspector/Studio artifact-boundary checks remain green.
- Panel usability changes follow the
  [desktop design rules](../skills/feather-desktop-app/references/design-rules.md); future work is
  tracked in [`ROADMAP.md`](../ROADMAP.md).

