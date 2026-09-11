# V4 Studio — turning Feather Studio into a usable tool

**Status:** S1–S3b done, S4/S5 open · **Written:** 2026-09-10 · **Last worked:** 2026-09-11
**Companions:** [`V4.md`](./V4.md) (why Studio is a separate product) · [`V4-ENHANCED.md`](./V4-ENHANCED.md) — its §9 summarizes this

---

## 0. How to use this document

Read §1 and §2 first — they are short, and everything after them only makes sense once you know
that **Studio currently cannot be opened and used at all**, and why.

§5 is the visual direction; §6 is the work. Read §5 before S2 — the shell is where it lands. Each step is self-contained: it names the files, the exact change, how to
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
the same directories and it works. When something in §6 is unclear, look there first.

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

**A second half of this gap, found while implementing S1:** `@theme inline` — the block that maps the
tokens onto Tailwind's color utilities, and therefore what makes `bg-card` *exist* as a class at
all — lived only in `showcase-app.css`. Without it Tailwind never generates those utilities, so the
classes are inert no matter what the token values are. It now lives in
`apps/studio/src/theme-tokens.css`, imported by both Studio and the showcase so they cannot drift on
what a card looks like.

---

## 5. The look: a workbench, not an instrument

Inspector's visual direction is settled in V4-ENHANCED §4: *an instrument, not an interface* — color
reserved as a signal channel, typography carrying hierarchy, rules instead of cards, motion only for
causality. It is right for Inspector and **it is the wrong answer here**, which is worth stating
plainly because the two applications share a component library and the temptation to share a look is
strong.

They are different species of tool:

|  | Inspector | Studio |
|---|---|---|
| What you do | **read** it | **work on** it |
| The product | the data it shows | the artifact you are making |
| Success | you understand something | you made something you like |
| The window's job | present state faithfully | stay out of the way of the work |
| Color belongs to | the tool, as signal | **the artifact** |

The last row is the one that changes everything. Inspector can spend color on state because nothing
else in the window has any. Studio cannot: a texture, a gradient, a shader preview and a particle
system are *made of* color, and every colored pixel of interface competes with them for the judgment
the user is trying to make.

### The metaphor

**A workbench.** A large neutral surface, the work in the middle, tools within reach but out of the
way, and good light.

It is a useful metaphor because it decides things. A workbench is not decorated. Its surface is
chosen so it does not lie to you about what you are making. Tools sit at the edges where your hand
falls, not in the middle where the work goes. And nothing on a good workbench is more interesting to
look at than the thing being built on it.

### W1 — The artifact is the only thing allowed to be colorful

The preview, the graph, the simulation get the space and the saturation. Everything else — panels,
labels, controls, borders — is achromatic, or as close as it can get while staying legible.

This is stricter than Inspector's D1, which reserves color for the four semantic states. Studio keeps
that channel (a failed shader compile is still `danger`, and V4-ENHANCED **C0** still applies) but
adds a rule above it: **state color is allowed; decorative color is not, and neither is accent color
near a preview.** If a control needs emphasis next to the artifact, it gets it from weight, size or
contrast, not from hue.

*Concretely:* no colored panel backgrounds, no accent-tinted headers, no colored tool icons. The
`--primary` rose is for focus and selection only, and it does not appear inside a preview region.

### W2 — Dark by default, neutral by necessity

Studio should open dark, regardless of the system preference, and it should let the user switch.
This is a real departure from Inspector — `apps/studio/src/theme.tsx` currently follows the system —
and the reason is not fashion.

**You cannot judge a color against a surround that has its own.** Simultaneous contrast is a
measurable perceptual effect: the same swatch reads lighter against dark, darker against light, and
shifts hue against a tinted ground. A bright interface beside a texture you are authoring makes that
texture look darker and more saturated than it is, and you will compensate — in the file, wrongly.
Every tool where people judge color for a living defaults dark for this reason.

Two rules follow:

**The chrome is dark and desaturated.** Around `#242424` for the workbench surround — dark enough not
to compete, light enough that a black artifact still reads against it. Pure black is worse than
mid-dark: it maximizes contrast against everything, making previews look brighter and more saturated
than they are.

**The immediate surround of a preview is neutral and switchable.** Not the panel color — a dedicated
ground, with the user able to choose it, because there is no single correct answer:

| Ground | Value | For |
|---|---|---|
| Dark | `#141414` | judging bright artifacts, glows, additive particles |
| **Neutral** | `#767676` | **the default** — true 18% grey, the least-biasing ground |
| Light | `#d4d4d4` | judging dark artifacts and edges |
| Checker | 8px `#5a5a5a`/`#6f6f6f` | judging alpha |

`#767676` is not a taste: it is the sRGB value whose relative luminance is 0.18, the neutral
photographers and colorists standardize on precisely because it biases perception least. The checker
values are deliberately close together and mid-valued — a high-contrast black/white checker is itself
a strong simultaneous-contrast stimulus and makes semi-transparent edges hard to read.

The chosen ground is per tool and remembered (**C1**).

### W2b — Regions are separated by value, not by lines

*(Added 2026-09-10 on the owner's direction, after the first shell read as too heavy.)*

Take the VS Code approach: regions differ by a half-step of **background value**, and drawn borders
are reserved for things that need an affordance — inputs, buttons, anything you can click into.

A border is a line you have to look at. A value step does the same job of saying *these are
different regions* and then stops registering once you no longer need it, which is exactly the
behaviour a workbench's chrome should have. Drawn edges everywhere also read as decoration, and W1
has already spent the decoration budget at zero.

*Concretely:* `border-r` / `border-b` between layout regions becomes `bg-sidebar` (or another step)
on one side. A card sitting inside a tool that already owns the window loses its outline entirely —
that outline was Inspector's idiom, where cards separated peers on a scrolling page; here the
section is already inside its own region and the line has nothing to do. Grouping comes from a value
step and a quiet heading.

*What keeps its border:* form controls, and any element whose edge tells you where to click.

**Applied 2026-09-10.** The complaint that started this — *"the shader graph have strong border on
every container"* — turned out to have a cause underneath the taste question, and it is worth
recording because the taste fix alone would have hidden it:

Tailwind v4 changed the default `border` colour from a light grey to **`currentColor`**. shadcn
covers this with a base rule (`* { border-color: var(--border) }`); the showcase entry had that rule,
but `apps/studio/src/studio.css` never did. Every `border` utility in Studio was therefore drawing in
the *text* colour — **15.8:1** against the page, where the intended token is **1.25:1**. Shader Graph
alone rendered **172** near-black outlines. That is not a heavy design, it is a missing line of CSS.

Three things followed:

1. **The base layer landed in `studio.css`**, alongside the removal of ~9 lines of dead
   `.studio-panel` / `.studio-button` placeholder CSS that the real shell had already replaced —
   which was independently hardcoding `#d7dbe1` borders and a `#f4f5f7` body, overriding the theme.
   The body now takes `bg-background` from the token, so themes actually reach it.
2. **An earlier softening was reverted.** `--color-border` had been mixed down to 55% while the real
   cause was still unknown; with borders resolving correctly that produced 1.13:1 — too faint to
   read as a division. The raw token is 1.25:1, which is the VS Code range *and* what Inspector
   already uses. Sharing one value serves the "single product" complaint better than a Studio-only
   variant.
3. **The idiom got named.** `.surface` / `.surface-inset` / `.section-label` in `theme-tokens.css`
   replaced 59 ad-hoc boxed containers written 8 different ways and 42 labels written 7 different
   ways. Controls kept their borders, and so did anything carrying a state colour — those were
   classified out by the presence of `h-\d` / `cursor-` / `focus` / `hover:` / `disabled:` or a
   palette colour, not by hand.

*Guarded by* `the three tools share one visual language` in `apps/studio/e2e/studio.spec.ts`, which
walks all three tools and fails on any sRGB border darker than rgb(90,90,90). Verified by reverting
the base rule and watching it report 172.

**A defect this surfaced.** Tightening the spacing moved a diagnostic's fix button under the floating
LÖVE preview — `fixed bottom-4 right-4`, so it sits over whatever occupies that corner, which in
Shader Graph is the diagnostics list. The button was 59px inside the preview's box and could not be
clicked at all. The preview now publishes its measured footprint as `--floating-preview-gutter` (via
`ResizeObserver`, because it is resizable and a hardcoded value goes stale on the first drag) and
`ShaderRightPanel` reserves it in standalone. *Guarded by* `the floating preview never covers the
diagnostics it explains`.

### W2c — Navigation overlays; it does not occupy

*(Added 2026-09-10 on the owner's direction.)*

The tool switcher is a menu behind a hamburger, opening as an overlay, not a permanent rail.

Three tools do not justify taking width from a node graph or a texture preview for the whole
session — W1 says the artifact gets the space, and a rail contradicts it every minute it is on
screen. What remains permanently is a thin strip: which tool you are in, and whether a game is
attached. Everything else appears over the work when asked for and leaves when you have chosen.

The cost is one extra click to switch tools, which is why the menu **closes on selection** — the
interaction must not also charge a dismissal.

### W3 — Parameters are handles, not forms

Asset work is continuous adjustment: *a bit more, a bit less, no — back.* An interface built from
text fields and Apply buttons makes that loop cost four actions instead of one.

Every numeric parameter is **draggable to scrub**, click-to-type for precision, and arrow-key
nudgeable (shift for coarse, alt for fine). Every color parameter opens its picker in place. Ranges
show their bounds. Nothing needs confirming.

*Concretely:* if a control has an Apply button beside it, the control is wrong. The exception is
anything genuinely expensive or destructive — generating a large texture, deleting a workspace —
where a deliberate act is the point.

### W4 — Feedback follows the hand

The preview updates **during** the drag, not on release. That loop — adjust, see, adjust — is the
entire product, and its latency is the quality metric users will feel before they can name it.

Where something cannot be instant (a heavy generation, a compile, a round trip to a live game), it
says so with a progress affordance in place, and the last good result stays on screen until the new
one arrives. A preview that blanks while recomputing is worse than one that is briefly stale, because
blanking destroys the comparison you were in the middle of making.

This is where Studio's motion budget goes. V4-ENHANCED **D4** says motion only for causality; here,
causality *is* the interaction, so the propagation of a change through the graph and into the preview
is worth animating. Nothing else is.

### W5 — One workspace, not three pages

Inspector is tabbed because you look at one thing at a time. Studio is not: you need the graph, the
preview and the parameters **simultaneously**, because the whole job is relating them.

Shader Graph established this shape — palette | canvas | inspector, resizable, in the showcase's
composition. S3b brought the other two tools into the same model:

| Tool | Left | Center (the work) | Right |
|---|---|---|---|
| Shader Graph | node palette | node canvas + preview | node parameters |
| Particle Playground | system / emitter list | **simulation preview** | emitter parameters + timeline |
| Texture Lab | recipe / generator list | **texture preview** | generator parameters |

Regions are resizable and their sizes persist per tool (**C1**). The center region is never smaller
than the sum of the sides.

### W6 — The work has a name

An asset is a thing someone made, not a scratch buffer. Workspaces are named, listed, switchable,
and saved continuously (**P3**, and S4 builds it). The name is visible while you work, because it is
the answer to "which one is this?" — and it is the only place in Studio where a delete needs
confirming.

### What this means for the shell

Applying W1–W6 to S2, the shell should be:

- **A frame, not a page.** No large application header. A thin strip names where you are; tool
  switching lives in an overlay menu behind it (**W2c**).
- **Dark, achromatic, quiet.** The shell contributes no color at all.
- **The tool fills the rest.** The tool owns the entire remaining window and manages its own regions.
- **The Inspector connection lives at the edge.** A small status affordance, styled as chrome (**P2**
  — its absence is not an error). It belongs near the tool switcher, not in a banner.
- **The workspace name is visible**, in the same strip.
---

## 6. The work

### S1 — Mount the providers — **DONE** (c95b272)

**Goal:** the tools can render at all.

**Files:** `apps/studio/src/main.tsx`

Build a provider stack matching `showcase/providers.tsx`, with these differences:

- The host stays resolved as it is today — `resolveHost()` already picks Tauri or web correctly and
  lazily imports `@tauri-apps/*`. **Do not change it**; a web build must not pull Tauri in.
- Keep the existing `setCreativeMcpTransport` wiring for the desktop case.
- `UiProvider` needs the same three dependencies the showcase supplies.
- **Leave the theme behaviour alone for now.** §5 **W2** argues Studio should open dark regardless
  of the system preference. The owner has deferred that: themes are wanted and the default is a
  later conversation. `theme.tsx` keeps following the system, and W2's *preview ground* rule (the
  neutral, switchable surround) lands in S3b regardless — it is the part that actually affects
  color judgement, and it does not depend on which theme is active.

**Acceptance:** a tool mounted anywhere in Studio renders with real card backgrounds, borders and
muted text, in both light and dark, following the system preference.

**Check:** `pnpm run studio:dev`, then temporarily render `<TextureLab />` inside `StudioApp`. It
should look like a tool, not unstyled markup. Revert the temporary render before moving on.

---

### S2 — Build the shell — **DONE** (c95b272, refined in a44e7ce)

**Goal:** Studio becomes usable. **This is the step that makes Studio exist.**

**Files:** `apps/studio/src/StudioApp.tsx` (replace the placeholder), plus whatever navigation
components you add.

**Read §5 first.** It is the visual direction, and the shell is where most of it lands — a frame
rather than a page, achromatic, with the tool owning everything below a compact strip.

Requirements:

1. **Navigation across the three tools.** Shader Graph, Particle Playground, Texture Lab. A compact
   left rail or top strip, not an application header — §5 explains why the work gets the space.
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

### S3 — Invert the session model — **DONE** (c95b272)

**Goal:** the tools stop treating "no game" as degraded.

This is where P1 becomes code. **Read §7.1 before starting** — the semantics are subtle and the
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

### S3b — Give the other two tools the workbench shape — **DONE** (2026-09-11)

**Goal:** §5 **W5**. All three tools are workspaces, not pages.

Shader Graph is already right: palette | canvas | inspector, resizable, composed in
`showcase/ShowcaseShaderGraph.tsx`. The other two are not, and both use Inspector idioms that no
longer fit:

- `tools/texture-lab/index.tsx:62` — a `<main>` with a `<header>`, i.e. a page.
- `tools/particle-system-playground/index.tsx:32` — `rounded-md border bg-card`, Inspector's card.

Rebuild both as three regions using `@feather/ui/resizable`, per the table in §5 **W5**, with the
preview in the center. Add the neutral, switchable preview ground from **W2** — no preview should
sit on the panel color.

This is a layout change, not a rewrite: the panels inside each tool keep working. Do it after S3 so
you are not moving components and changing their session behaviour at once.

**Acceptance:** each tool shows its work, its parameters and its list at the same time, the regions
resize, and the preview sits on a neutral ground the user can change.

**Implementation:** Particle Playground now uses the selected **Context Lens** direction: a
composite/emitter navigator, a docked love.js simulation preview with an optional resizable timeline
layer, and an emitter inspector whose Preview & Assets tab retains movement, texture, and shader
authoring. Texture Lab uses **Preview Priority**: all 44 generators and saved recipes remain directly
reachable in the navigator, the generated texture owns the largest region, and Parameters/Atlas
share the inspector. Both workbenches persist their pane sizes independently. Their preview grounds
offer dark, neutral, light, and checker calibration surfaces using the exact W2 values; Particle
Playground sends the selected ground into love.js rather than painting only around the canvas.

No existing commands were removed: particle import/save/Lua/ZIP export remain under Project;
undo/redo, playback, reset, kick-start, textures, shaders, motion, emitter controls, and the full
timeline remain available. Texture generation, presets, image/SDF/spline/shape editing, recipes,
atlas fill/playback/onion-skin/frame replacement, PNG/ZIP export, and creative-tool handoff remain
available. Studio and showcase E2E coverage exercises those preservation paths, resizing, and
per-tool persistence.

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

### S5 — Apply what Inspector already learned — **C0, C1, C3 DONE 2026-09-10**

**Goal:** Studio starts where Inspector finished rather than rediscovering it.

**C0, C1 and C3 landed. C2 and C5 remain.**

#### C0 — semantic colour

The derivation is **shared, not ported**. `packages/ui/src/theme/semantic.ts` owns the
contrast-solving — hand-copying 211 lines of it would have produced the divergence this repository
keeps finding, and the two apps cannot import each other, so the package was the only honest home.

**82 of 86 raw literals became tokens.** The other four are identity, not state, and now say so with
an inline disable: Texture Lab's move and resize handles (told apart by shape *and* colour over
arbitrary texture content) and Shader Graph's violet "Probe" badge, which marks *what a node is*,
not that something is wrong with it.

**The C0 regression happened again, and was caught.** A mechanical pass turned the two drag handles
into `bg-info-surface` / `bg-ok-surface` — a pale region tint on a 12px solid mark over a texture,
which is invisible. `verify:enhanced` now checks for exactly that shape.

#### The whole registry is shared now, not just the derivation

*(2026-09-10, on the owner's call.)* Ten of the eleven theme files were **byte-identical** between
the two apps — one registry maintained twice, 4,602 duplicated lines — and the eleventh differed
only because C0 had landed in one of them. Same shape as the particle semantics: the copy that has
not drifted yet is the one that is about to.

`packages/ui/src/theme/` holds all of it: `registry/` (79 themes across five families), `dark.ts`,
`light.ts`, `semantic.ts`, and the `NOTICE.md` attribution that belongs with them. Both apps import
`@feather/ui/theme/registry`; neither has an `assets/theme` directory any more. **4,824 lines
deleted, 45 added**, across six import sites. With `types.ts` now a sibling of `semantic.ts`, the
generic signature the split had forced went away too.

#### C1 — panel state: already satisfied

Checked rather than assumed. Studio persists the active tool (`studio-ui.ts`), preferences including
collapsed palette categories (`studio-preferences.ts`), and the shader graph itself. A survey found
exactly **one** un-persisted filter: the node palette's search box. It stays that way deliberately —
you type it to find a node and immediately drag that node out, so persisting it would reopen the
palette pre-filtered, which is the "reopening into a state nobody left it in" trap C1 warns about.

#### C3 — next actions: mostly satisfied, two gaps closed

Of 15 error and empty states, most already name the action, and "No composites yet" has a **New
Composite** button directly beneath it. Two did not: the node picker's "No nodes found" now says the
search is filtering and that clearing it shows everything, and three connected-game preview failures
now name the likely cause and what to check.

#### Still open from this phase

- **C2 — freshness.** Only applies in `attached` mode, and matters there: a preview reflecting a game
  that has since restarted is the same lie. `apps/inspector/src/hooks/use-freshness.ts` judges
  against the session's `connectedAt`, not the clock.
- **C5 — third-party data.** The shader graph loads user files and the tools accept imported
  workspaces. Be strict wherever a value authored outside this repository reaches rendering.

**Acceptance — both met.** `pnpm run verify:enhanced` has an S5 section with five checks, and the
`no-restricted-syntax` rule covers `apps/studio/src` alongside `apps/inspector/src`. The rule was
confirmed to bite by reintroducing a literal. `themeSemanticColors.test.ts` asserts every shipped
theme clears WCAG AA for all four states against page, card **and its own surface**, and that
neither app has grown its own registry back.

---

## 7. Reference

### 7.1 Session semantics — read before S3

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

### 7.2 The Inspector bridge

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

### 7.3 Ports

`4004` game WebSocket · `4005` Inspector MCP bridge · `4006` CLI MCP HTTP transport ·
`4007` Studio creative MCP · `4008` Studio↔Inspector bridge · `1420` Inspector dev · `1430` Studio dev.

### 7.4 Commands

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

## 8. Traps

Each of these has already cost time in this repository. They are listed so they cost it once.

**The existing Studio e2e tests assert the placeholder.** `apps/studio/e2e/studio.spec.ts` has four
tests checking for the subtitle "Shader graph · Texture lab · Particle playground", the connect
button and the note. S2 will break them, and that is correct — they encode the state you are
replacing. Rewrite them to assert the property you want, not the markup you have. This is V4.md
**D43**: a test that asserts current behaviour locks in the thing you are trying to change.

**An app's config is part of the migration.** When previews moved out of Inspector, the love.js Vite
plugin was extracted so *"only Studio and the showcase consume this"* — its own words. The showcase
got wired up; **Studio never did**. `apps/studio/vite.config.ts` had no plugin and no
`publicDir`, so every preview iframe requested `/showcase-lovejs/...`, hit the SPA fallback, and
rendered **Studio inside its own iframe**. Reported as *"the preview node... is currently displaying
the page itself"*. Studio's `build` was missing the two asset steps too, so the packaged app shipped
the same hole.

This is the Phase 05c pattern again (§1): the code moved, the tests passed, and the product it
moved *to* did not work. When a shared module names its consumers, check that each one actually
imports it — and check the build output, not just the dev server. *Guarded by* `the love.js preview
target is served, not the app itself`, which also asserts `showcase.love` and the player are there,
since an entry page that resolves while its assets 404 is the same defect one level down.

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

## 9. Definition of done

Studio is finished as a tool when all of these are true:

1. A developer installs Studio, opens it with **no Inspector and no game**, and builds a shader, a
   particle system and a texture without ever seeing a session-required state.
2. Their work is still there after a force-quit and reopen.
3. Connecting to Inspector **adds** live preview, and disconnecting removes it without losing work
   or showing an error.
4. Every state color follows the user's theme and clears WCAG AA on it.
5. Studio contributes no color of its own, and every preview sits on a neutral ground the user can
   change — so what someone sees while authoring is the artifact, not the interface's opinion of it
   (§5). *(Dark-by-default is deferred: see S1.)*
6. `pnpm run verify:enhanced` covers Studio and passes.
7. `pnpm run test` passes 7/7.

Then Studio gets its own feature-by-feature section in V4-ENHANCED, and the same lens (L1–L6) is
applied to each of its three tools — which is where the real refinement of the creative work begins.
This document only gets it to the point where that is worth doing.
