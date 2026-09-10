# V4 Studio — turning Feather Studio into a usable tool

**Status:** specification, not started · **Written:** 2026-09-10
**Companions:** [`V4.md`](./V4.md) (why Studio is a separate product) · [`V4-ENHANCED.md`](./V4-ENHANCED.md) — its §9 summarizes this

---

## 0. How to use this document

Read §1 and §2 first — they are short, and everything after them only makes sense once you know
that **Studio currently cannot be opened and used at all**, and why.

Then work §5 in order. Each step is self-contained: it names the files, the exact change, how to
check it, and what "done" means. Steps depend on the ones before them.

Every factual claim here was verified against the repository on 2026-09-10 and carries a file
reference. If something does not match what you find, **trust the code and correct this document** —
a stale spec is worse than none, and V4-ENHANCED's log has two entries about exactly that.

---

## 1. The situation

Feather Studio ships **35,325 lines** of source, including **25,500 lines** of working creative
tools, and renders none of them.

`apps/studio/src/StudioApp.tsx` is 60 lines and is still the Phase 05b placeholder. It draws a
header, an environment panel, and this:

> "The shader graph, texture lab and particle playground move here in Phase 05c. They are still
> served by Feather Inspector until then."

They moved in Phase 05c. The shell was never updated. Nothing in Studio's own UI imports anything
from `apps/studio/src/tools/`.

**Why nothing caught it.** Phase 05c was defined as a move, and the move was real and verified: the
LOC landed, the import boundary held, the lint guards stood, every suite went green. Nobody asked
whether the application could be opened, because that was not what the phase claimed to do. A
migration can be complete by its own definition and still leave a product that does not exist.

---

## 2. The design principle

> **Studio is a local authoring tool that can optionally reach a running game.**

This is the inverse of what the code currently assumes, and it decides nearly every open question
below.

Today "no game attached" is treated as a degraded state that the tools tolerate, because they were
written inside Inspector, where a gameless workspace was an unusual thing you deliberately created.
In Studio it is the **normal, fully capable** state. Someone opens Studio to build a shader; whether
a game happens to be running is beside the point until they want to see their work inside one.

Three consequences, which resolve most smaller decisions:

**P1 — Local is the default, not the fallback.**
Studio always has a workspace. It never asks for a session before letting you work, never shows a
session-required empty state, and never disables a control because no game is attached. A game gates
only what genuinely needs one: pushing into a live preview, and reading back from a running system.

**P2 — A connection is an addition; its absence is not an error.**
"Not connected" is a neutral fact. Style it as chrome, never as `danger`. The placeholder already
says this correctly — *"Optional. Studio works as a local editor without it"* — and that sentence
should survive into the real shell.

**P3 — Authoring work is durable.**
Inspector losing a filter costs a retype. Studio losing a shader graph costs an afternoon. Work
survives restarts and crashes, per workspace, by default.

---

## 3. What already exists

More than §9 of V4-ENHANCED first credited. Do not rebuild any of this.

| Thing | Where | State |
|---|---|---|
| Three creative tools | `apps/studio/src/tools/{shader-graph,particle-system-playground,texture-lab}/` | Working, 25,500 LOC |
| Tool entry components | each tool's `index.tsx` | All three export a default component |
| Theme registry | `apps/studio/src/assets/theme/registry/` | Full copy: GitHub, Noctis, Rainglow, Tokyo Night, VS C++ |
| Theme provider | `apps/studio/src/theme.tsx` | `ThemeProvider`, `useResolvedTheme`, `useSystemThemeMode` |
| Design tokens | written by `ThemeProvider` onto the root element | Complete — *when the provider is mounted* |
| Inspector bridge | `apps/studio/src/useInspectorBridge.ts` | Working, optional, null-bridge by default |
| Session mirror | `apps/studio/src/session/index.ts` | Present, but models Inspector's world (S3) |
| Stores | `apps/studio/src/store/{shader-graph,studio-preferences}.ts` | Working, persisted |
| Creative MCP | `apps/studio/src/mcp/`, `desktop/mcp-transport.ts`, `src-tauri/src/creative_mcp.rs` | Working, port 4007 |
| Tauri shell | `apps/studio/src-tauri/` | Working, `com.kyonru.love.feather.studio` |
| A working reference | `apps/studio/src/showcase/` | **Read this first** — see §4 |

### 3.1 The showcase is the working reference

`apps/studio/src/showcase/` is Feather Studio running in a browser. It mounts the same tools from
the same directories and it works. When something in §5 is unclear, look there first.

Two caveats:

- It reaches the tools through **workarounds** for the session model being wrong (S3), notably
  `playgroundOverride` and a hand-passed `standalone` prop. Those workarounds are not the target
  shape; they are evidence of the defect.
- It is a public marketing surface with a gallery and its own layout. Studio is an application. Copy
  its **provider stack**, not its chrome.

---

## 4. Why nothing renders: the provider gap

This is the single highest-value fact in the document.

`apps/studio/src/main.tsx` mounts exactly one provider:

```tsx
<HostProvider host={host}>
  <StudioApp />
</HostProvider>
```

`apps/studio/src/showcase/providers.tsx` — which successfully renders the same tools — mounts four:

```tsx
<QueryClientProvider client={queryClient}>
  <HostProvider host={host}>
    <UiProvider value={uiDependencies}>
      <ThemeProvider>{children}</ThemeProvider>
    </UiProvider>
  </HostProvider>
</QueryClientProvider>
```

So Studio is missing **`QueryClientProvider`**, **`UiProvider`** and **`ThemeProvider`**.

What each absence would cost, if you mounted a tool today:

- **No `ThemeProvider`** — no design tokens on the root element. The tools reference shadcn tokens
  (`bg-card`, `text-muted-foreground`, `border-border`) **394 times**, and every one resolves to
  nothing. `theme.tsx`'s own comment records this happening to the showcase already: *"Without it
  `var(--background)` and friends resolve to nothing and the layout collapses."*
- **No `QueryClientProvider`** — the tools and their hooks use React Query. They throw.
- **No `UiProvider`** — `@feather/ui` components lose `useThemeMode`, `useSyntaxTheme` and
  `copyToClipboard`.

`apps/studio/src/studio.css` is 32 lines of placeholder styling with no tokens, which is fine and not
the problem: tokens come from the provider at runtime, not from that file.

---

## 5. The work

### S1 — Mount the providers

**Goal:** the tools can render at all.

**Files:** `apps/studio/src/main.tsx`

Build a provider stack matching `showcase/providers.tsx`, with these differences:

- The host stays resolved as it is today — `resolveHost()` already picks Tauri or web correctly and
  lazily imports `@tauri-apps/*`. **Do not change it**; a web build must not pull Tauri in.
- Keep the existing `setCreativeMcpTransport` wiring for the desktop case.
- `UiProvider` needs the same three dependencies the showcase supplies.

**Acceptance:** a tool mounted anywhere in Studio renders with real card backgrounds, borders and
muted text, in both light and dark, following the system preference.

**Check:** `pnpm run studio:dev`, then temporarily render `<TextureLab />` inside `StudioApp`. It
should look like a tool, not unstyled markup. Revert the temporary render before moving on.

---

### S2 — Build the shell

**Goal:** Studio becomes usable. **This is the step that makes Studio exist.**

**Files:** `apps/studio/src/StudioApp.tsx` (replace the placeholder), plus whatever navigation
components you add.

Requirements:

1. **Navigation across the three tools.** Shader Graph, Particle Playground, Texture Lab.
2. **Mount the entry components.** All three export defaults:
   - `apps/studio/src/tools/shader-graph/index.tsx` → `ShaderGraph`
   - `apps/studio/src/tools/particle-system-playground/index.tsx` → `ParticleSystemPlaygroundPage`
   - `apps/studio/src/tools/texture-lab/index.tsx` → `TextureLab`
3. **Do not pass `standalone`.** It is a workaround; S3 removes it. Passing it here would hide the
   defect S3 fixes and make S3 look unnecessary.
4. **Keep the Inspector connection affordance**, and keep its framing (P2). The existing copy —
   *"Optional. Studio works as a local editor without it; connecting lets you push work straight
   into a running game."* — is correct. Move it somewhere it does not dominate the window; it is
   secondary to the work.
5. **Remember which tool was open** (V4-ENHANCED **C1**, and use `usePanelState`'s reasoning: state
   the user chose and would be annoyed to re-choose). Studio has no equivalent store yet; a small
   persisted store is fine, and it should be global rather than per session for the same reason
   Inspector's is.

Routing is a judgement call. Studio has no router today and does not obviously need one — three
tools and local state is enough. If you add one, note that the tools were written as Inspector
*pages* and may assume a router context; check before assuming either way.

**Acceptance:** open Studio with no Inspector running and no game, reach all three tools, and use
each one.

**Check:** `pnpm run studio:tauri`. Also `pnpm run test:studio:e2e` — and see §7 about the four
existing tests, which assert the placeholder.

---

### S3 — Invert the session model

**Goal:** the tools stop treating "no game" as degraded.

This is where P1 becomes code. **Read §6.1 before starting** — the semantics are subtle and the
existing predicates are easy to misread.

**The defect, exactly.** Both Texture Lab and Particle Playground contain:

```ts
const creativeSession = isCreativeSession(activeSession);
const playground = creativeSession ? localPlayground : livePlayground;
```

With no Inspector attached, `activeSession` is `null`, so `isCreativeSession(null)` is `false`, so
they select **`livePlayground`** — the controller that needs a running game. The ternary is backwards
for Studio's default, and Studio *never creates a creative session*:
`createCreativeSessionId` exists in `session/index.ts` and is called from nowhere.

**Shader Graph already does it correctly** — `tools/shader-graph/index.tsx:75`:

```ts
const localMode = !sessionSupportsRuntime(activeSession);
```

That is the shape to converge on.

**Sites** (all verified 2026-09-10):

| File | Line | What it does |
|---|---|---|
| `tools/particle-system-playground/index.tsx` | 54, 56, 59 | `creativeSession`, controller choice, `localMode = standalone \|\| creativeSession` |
| `tools/particle-system-playground/components/ParticlePreviewMonitor.tsx` | 56 | runtime session gate |
| `tools/texture-lab/index.tsx` | 16, 17, 19 | `creativeSession`, workspace id, controller choice |
| `tools/shader-graph/index.tsx` | 75 | already correct — the reference |
| `tools/shader-graph/LoveNodePreview.tsx` | 79 | runtime session gate |
| `hooks/use-shader-graph.ts` | 35 | runtime session gate |
| `session/plugin-control.ts` | 24 | runtime session gate |

**The change:**

1. Replace `isCreativeSession` branching with one explicit mode derived from the bridge — `local`
   (always available) or `attached` (a game is reachable). Express it once, in `session/`, and have
   the tools read it.
2. Delete `CREATIVE_SESSION_PREFIX`, `createCreativeSessionId`, `isCreativeSession` and the
   `'creative'` `SessionKind` from `apps/studio/src/session/index.ts`. They describe Inspector's
   exception. In Studio the same words name the default, which is precisely why the code reads
   backwards. (Inspector removed its own copy for the same reason — see V4.md **D43**.)
3. Remove the `standalone` prop from `ParticleSystemPlaygroundPage` and the `playgroundOverride`
   injection the showcase uses. Both are workarounds for this defect; when the default is right, they
   have nothing to do.
4. Leave the **runtime session gates** alone in substance. `sessionSupportsRuntime` answers a real
   question — *may I push to a live game?* — and its answer is legitimately `false` in local mode.
   Rename if it clarifies; do not remove.

**Acceptance:** no tool asks whether a session is "creative". Standalone Studio uses the local
controller because that is the default path, not because a prop said so. The showcase renders
without `playgroundOverride`.

**Check:** with no Inspector, all three tools are fully usable and none shows a session-required
state. `pnpm run test:showcase:e2e` still passes.

---

### S4 — Durable workspaces

**Goal:** P3. Work survives restarts, crashes and tool switches.

**Current state:**

- Texture Lab has workspaces — `store/studio-preferences.ts` holds `textureLabWorkspaceId` and
  `textureLabWorkspaces`, with `activateTextureLabWorkspace`.
- Particle Playground has per-workspace persistence keyed by an id —
  `tools/particle-system-playground/use-local-particle-playground.ts` (`writeLocalParticleWorkspace`,
  `loadLocalParticleWorkspace`, `deleteLocalParticleWorkspace`) — but with no session the id is
  `undefined` and it falls back to `defaultLocalParticleData()`.
- Shader Graph has `activateWorkspace` in `store/shader-graph.ts`.

So all three have the machinery and none of them has an owner. **The missing piece is a workspace
concept at the application level**, not in each tool.

Requirements: one shared notion of "the thing I am working on" — named, listed, switchable, saved on
change, and supplying the id each tool's existing persistence already wants. Deleting a workspace
should be explicit and confirmed; this is the one place in Feather where a confirmation is warranted,
because it is the only irreversible destruction of the user's own work.

**Acceptance:** build something in each tool, force-quit Studio, reopen it, and find all three
exactly as you left them.

**Check:** do it by hand — `pnpm run studio:tauri`, work, `kill -9` the process, reopen. An
automated test is welcome but the manual check is the one that matters, because it is the one a user
performs.

---

### S5 — Apply what Inspector already learned

**Goal:** Studio starts where Inspector finished rather than rediscovering it.

From V4-ENHANCED §4–§5, in rough priority:

- **C0 — semantic color.** Studio has **86 raw Tailwind color literals** in
  `apps/studio/src/**/*.tsx`. Studio's theme registry is a separate copy from Inspector's, so the
  semantic ramps (`--ok`, `--warn`, `--danger`, `--info` with `-surface`/`-border`) need porting or
  sharing. Read `apps/inspector/src/assets/theme/registry/semantic.ts` — the derivation is done and
  contrast-tested, and it must be **solved against every ground including its own surface** (that
  bug cost 66 theme/state combinations the first time). Note also the follow-up: surfaces are for
  row and region tints; **dots and bars need the foreground**, or they render invisible.
- **C1 — panel state.** Filters and tool selection persist. `apps/inspector/src/store/panel-state.ts`
  is the pattern; global, not per session.
- **C2 — freshness.** Only applies in `attached` mode, and matters there: a preview reflecting a game
  that has since restarted is the same lie. `apps/inspector/src/hooks/use-freshness.ts` judges
  against the session's `connectedAt`, not the clock.
- **C3 — next actions.** Every error and empty state names what to do.
- **C5 — third-party data.** The shader graph loads user files and the tools accept imported
  workspaces. Be strict wherever a value authored outside this repository reaches rendering.

**Acceptance:** `pnpm run verify:enhanced` gains a Studio section, and the `no-restricted-syntax`
lint rule banning raw color literals covers `apps/studio/src` as it does `apps/inspector/src`
(`eslint.config.js`).

---

## 6. Reference

### 6.1 Session semantics — read before S3

`apps/studio/src/session/index.ts` mirrors Inspector's session shape so 25,500 lines of tools could
move without being rewritten. The mirror is fed **only** by `syncFromBridge`, from Inspector, over
the bridge.

Consequences, all true today:

- With no Inspector: `sessionId` is `null`, `sessions` is `{}`, `activeSession` is `null`.
- `isCreativeSession(null)` → `false`. It does **not** mean "local"; it means "not one of Inspector's
  creative sessions", and Studio never makes one.
- `sessionSupportsRuntime(null)` → `false`. This one is honest: there is no game to push to.
- So `!sessionSupportsRuntime(activeSession)` is the correct test for "local mode" today, which is
  why Shader Graph works standalone and the other two do not.

### 6.2 The Inspector bridge

`apps/studio/src/useInspectorBridge.ts` returns:

```ts
type InspectorConnection = {
  bridge: SessionBridge;
  connected: boolean;
  session: SessionDescription;
  error: string | null;
  connect: () => Promise<void>;
};
```

It starts as a **null bridge** and only connects on an explicit user action — Studio never probes
loopback by itself. Keep that: it is a deliberate security property, not an oversight.

The contract lives in `packages/session-bridge/`, with 16 tests in
`packages/session-bridge/test/bridge.test.mts`, most of them negative (forged capability, revoked,
expired, incompatible peer, no session). Read them before changing anything about the connection.

### 6.3 Ports

`4004` game WebSocket · `4005` Inspector MCP bridge · `4006` CLI MCP HTTP transport ·
`4007` Studio creative MCP · `4008` Studio↔Inspector bridge · `1420` Inspector dev · `1430` Studio dev.

### 6.4 Commands

```sh
pnpm run studio:dev            # Studio web dev server, port 1430
pnpm run studio:tauri          # Studio desktop app
pnpm run studio:build          # production build
pnpm run typecheck:studio
pnpm run test:studio:e2e       # Playwright, apps/studio/e2e/
pnpm run test:showcase:e2e     # the showcase renders the same tools — run it after S3
pnpm run verify                # typecheck, lint, drift checks (~5s warm)
pnpm run test                  # every lane, serially, ~3 min
pnpm run verify:enhanced       # the V4-ENHANCED gate; extend it in S5
```

---

## 7. Traps

Each of these has already cost time in this repository. They are listed so they cost it once.

**The existing Studio e2e tests assert the placeholder.** `apps/studio/e2e/studio.spec.ts` has four
tests checking for the subtitle "Shader graph · Texture lab · Particle playground", the connect
button and the note. S2 will break them, and that is correct — they encode the state you are
replacing. Rewrite them to assert the property you want, not the markup you have. This is V4.md
**D43**: a test that asserts current behaviour locks in the thing you are trying to change.

**Verify a test by breaking the thing it tests.** Three tests in this work passed against unfixed
code before anyone noticed. The routine that catches it: make the fix, watch the test pass, revert
the fix, watch it fail, restore. If it does not fail, it is not testing what you think.

**Extract the judgement and test that.** Studio's e2e harness is thinner than Inspector's. Where a
browser test is hard to get right, pull the decision into a pure module and unit test it — that
resolved this problem three times in Inspector (`searchableText`, `isFromPreviousRun`,
`profilerStateForNewSession`, `pluginNavItems`). It is faster than fighting a harness and leaves
better-shaped code.

**Adding a field to a persisted store is a migration.** State written before your field rehydrates
without it. A controlled component handed `undefined` can render nothing at all. Give every new
persisted field a fallback at the point of use.

**Inspector and Studio must not import each other.** Enforced by `no-restricted-imports` in
`eslint.config.js` for `apps/inspector/src/**` and `apps/studio/src/**`. Shared code goes in
`packages/`. If S5 shares the semantic ramps, that is where they belong.

**The runtime is disciplined; third parties are not.** Feather's own Lua runtime is careful with the
payloads it sends. The values worth being strict about are the ones authored outside this repository
— plugin manifests, imported workspaces, user files.

---

## 8. Definition of done

Studio is finished as a tool when all of these are true:

1. A developer installs Studio, opens it with **no Inspector and no game**, and builds a shader, a
   particle system and a texture without ever seeing a session-required state.
2. Their work is still there after a force-quit and reopen.
3. Connecting to Inspector **adds** live preview, and disconnecting removes it without losing work
   or showing an error.
4. Every state color follows the user's theme and clears WCAG AA on it.
5. `pnpm run verify:enhanced` covers Studio and passes.
6. `pnpm run test` passes 7/7.

Then Studio gets its own feature-by-feature section in V4-ENHANCED, and the same lens (L1–L6) is
applied to each of its three tools — which is where the real refinement of the creative work begins.
This document only gets it to the point where that is worth doing.
