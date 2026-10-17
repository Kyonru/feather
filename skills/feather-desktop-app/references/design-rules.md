# Inspector and Studio design rules

Read this reference before changing existing Inspector or Studio behavior or UI. It records the product lens, cross-cutting interface rules, and the distinct visual direction of each application.

## The rule and the lens

> **Refine. Do not add.**

A change belongs to v4 refinement if it makes an existing feature better at what it already does. A
new capability, panel, tool or concept does not. *Amended 2026-09-09 by the owner:* a small addition
that completes a promise a feature already makes is in scope — a debugger with F8/F10/F11 and no
keyboard breakpoint is half-delivering what it has. A tenth panel is still not.

Judge every feature against these, in order — a failure high in the list makes the rest irrelevant:

- **L1 — Does it tell the truth?** Data is current, or the interface says plainly that it is not.
- **L2 — Does it survive the loop?** Anything configured survives a game restart and a trip to
  another panel.
- **L3 — Does it say what to do next?** An error ends with an action, ideally copyable, using the
  user's real project directory.
- **L4 — Is the common path short?** Count the steps for the two most common tasks.
- **L5 — Does it hold up at real scale?** 40,000 logs, an atlas-heavy project, a 3,000-line file.
- **L6 — Does it stay out of the way?** No toast for what is visible, no confirmation for what is
  reversible, no animation on a path walked fifty times a day.

## Cross-cutting findings

Each was one fix applied in many places. The outcome is recorded so it is not re-derived.

- **C0 — the semantic colour channel.** Inspector expressed four meanings with 54 raw Tailwind
  colours that ignored the user's theme and failed WCAG AA on roughly half of the 79 shipped themes.
  Now four ramps (`ok`, `warn`, `danger`, `info`, each with `-surface` and `-border`) are part of
  `THEME_CSS_VARIABLES`, derived per theme from its own background by `packages/ui/src/theme/
  semantic.ts`, and the theme registry itself lives once in `packages/ui/src/theme/`. A
  `no-restricted-syntax` rule rejects raw colour literals in both apps; `themeSemanticColors.test.ts`
  asserts AA for every theme against page, card and surface. **A surface token is not a mark:**
  painting a small dot or handle with `bg-*-surface` makes it invisible; `verify:enhanced` checks for
  that shape.
- **C1 — panel state survives navigation.** Decide per piece of state: URL, persisted per session,
  or genuinely ephemeral. 13 Inspector filters are persisted (`store/panel-state.ts`). Do not persist
  state whose purpose is momentary — reopening into a state nobody left it in is its own failure.
- **C2 — freshness is visible.** Panels go dormant when left, which keeps runtime overhead low but
  means a returned-to panel can show state from three restarts ago. `useFreshness` + `<Freshness/>`
  judge against the session's `connectedAt`, not the clock. Studio applies the same rule to live
  previews delivered through the bridge.
- **C3 — every diagnosis names a next action.** Done across Inspector's session warnings and
  filtered-empty states, and Studio's 15 error and empty states.
- **C4 — swallowed errors are decisions.** Each becomes ignorable (with a comment), surfaced, or
  diagnostics-only. The remaining cleanup is tracked in `ROADMAP.md`.
- **C5 — be strict where third-party data reaches rendering.** Feather's own runtime is disciplined
  with its payloads; the seam to guard is values authored outside this repository — plugin manifests
  (`pluginNavItems`), imported workspaces and user files. Coerce there, not
  everywhere (D14).

## Inspector — an instrument, not an interface

The reference class is measurement instruments (DevTools, Instruments, Grafana), not web design.
Bento and neo-brutalism were considered and rejected: both are built to attract attention, and
Inspector's user's attention belongs on their bug. Rules, in priority order:

- **ID1 — Colour is a reserved channel.** Chrome is achromatic; saturation is spent only on the four
  semantic states and on interaction. `--primary` means "you can act here" and never encodes data.
- **ID2 — Typography carries the hierarchy.** One sans for chrome, one mono for data,
  `tabular-nums` wherever digits line up.
- **ID3 — Rules, not cards.** Dividers and one spacing scale; elevation only for what floats.
- **ID4 — Motion only for causality**, respecting `prefers-reduced-motion`.

*(Called D1–D4 in the retired V4-ENHANCED; renamed so they do not collide with the decision log.)*

| Surface | Outcome |
| --- | --- |
| 6.1 Logs | Follow-tail fixed; search measured at 40k lines (`logSearch.test.ts`); filtered-view export implemented. |
| 6.2 Session | 9/9 warnings actionable, ordered by severity |
| 6.3 Performance / Profiler | Baseline survives a restart (`profilerCarryOver.test.ts`); recording state explicit |
| 6.4 Debugger | Problem counts navigable; source failure names path and fix; keyboard stepping pinned |
| 6.5 Console | Reviewed, no change — the reference for session-scoped persistence |
| 6.6 Assets | Missing filter truthful at scale (`missing-paths.ts`). |
| 6.7 Plugins | Manifest values and payloads bounded before rendering; structured health visible. Author-facing install-state acceptance is tracked in `ROADMAP.md`. |
| 6.8 Observability | Reviewed, no change |
| 6.9 Time Travel | Cost shown and bounded |
| 6.10 Session Replay | Reviewed; its toasts are export/import feedback |
| 6.11 Compare | Empty state names the command; stale-filter escape hatch |
| 6.12 Settings | Findable from the palette |
| 6.13 About | Accurate after the split |

## Studio — a workbench, not an instrument

**Studio is a local authoring tool that can optionally reach a running game.**

- **Studio P1 — Local is the default, not the fallback.** Never a session-required state; a game
  gates only live preview and read-back.
- **Studio P2 — A connection is an addition; its absence is not an error.** "Not connected" is styled
  as chrome, never as `danger`.
- **Studio P3 — Authoring work is durable.** Losing a shader graph costs an afternoon. Named
  workspaces persist all three tools and survive abrupt renderer exits.

Inspector's direction is wrong for Studio: Inspector's product is the data it shows, Studio's is the
artifact the user is making, and the artifact is made of colour.

- **W1 — The artifact is the only colourful thing.** State colour is allowed; decorative and accent
  colour near a preview are not. Emphasis next to the artifact comes from weight, size or contrast.
- **W2 — Neutral by necessity.** You cannot judge a colour against a surround that has its own. A
  preview sits on a dedicated, switchable ground remembered per tool: dark `#141414`, **neutral
  `#767676` (true 18% grey, the default)**, light `#d4d4d4`, checker 8px `#5a5a5a`/`#6f6f6f`. Chrome
  is dark and desaturated. *Dark-by-default regardless of system preference is deferred.*
- **W2b — Regions are separated by value, not lines.** Borders are reserved for affordances —
  inputs, buttons. `.surface` / `.surface-inset` / `.section-label` in `theme-tokens.css` are the
  idiom. Tailwind v4's default border colour is `currentColor`; the base rule
  `* { border-color: var(--border) }` must be present in every app stylesheet.
- **W2c — Navigation overlays; it does not occupy.** The tool menu is an overlay that closes on
  selection.
- **W3 — Parameters are handles, not forms.** Drag to scrub, click to type, arrows to nudge. An Apply
  button beside a control means the control is wrong.
- **W4 — Feedback follows the hand.** The preview updates during the drag; the last good result
  stays on screen until the next arrives.
- **W5 — One workspace, not three pages.** Each tool is left list | centre work | right parameters,
  resizable, sizes persisted per tool.
- **W6 — The work has a name.** Workspaces are named, listed, switchable and saved continuously.

**Studio definition of done:** (1) build a shader, a particle system and a texture with no Inspector
and no game, never seeing a session-required state; (2) work survives force-quit; (3) connecting
adds live preview and disconnecting loses nothing; (4) state colours follow the theme at AA; (5)
Studio contributes no colour and previews sit on a switchable neutral ground; (6)
`verify:enhanced` covers Studio; (7) all standard test lanes pass. All seven conditions are met.

**Session semantics.** `apps/studio/src/session/index.ts` mirrors Inspector's session shape, fed
only by `syncFromBridge`. With no Inspector, `sessionId` is `null` and `sessionSupportsRuntime(null)`
is `false`; `useIsLocalMode` is the test for local mode.
