# V4 Enhanced — refining what Feather already does

**Status:** active · **Started:** 2026-09-09 · **Companion to:** [`V4.md`](./V4.md)

V4.md is about structure: separating products so they can ship independently. This document is
about the opposite axis — leaving the feature set exactly where it is and making each existing
feature better at its job.

---

## 1. Why this exists

Feather is a tool developers reach for while they are trying to do something else. Nobody opens
Inspector because they want to use Inspector; they open it because a sprite is in the wrong place
and they need to know why. That framing decides everything below.

A tool in that position is not judged on how much it can do. It is judged on whether it costs less
attention than the problem it is helping with. Every re-typed filter, every panel that might be
showing five-minute-old data, every error that names a failure without naming a fix — each one is
small, and each one is a reason to alt-tab back to `print()` and never come back.

**The thesis:** Feather's feature set is already broad enough. What decides whether people keep
using it is whether the features they already rely on stay out of their way.

### The rule

> **Refine. Do not add.**

A change belongs in this document if it makes an existing feature better at what it already does.
A change that introduces a new capability, panel, tool, or concept does not, however good the idea
— write it down somewhere else and come back to it when this work is finished.

This rule is strict because the failure mode is well known: a tool grows a tenth surface while the
first nine stay 80% done, and every one of those nine has a rough edge that makes someone give up.
Breadth is not the problem. Follow-through is.

**Amended 2026-09-09 by the owner:** a small addition that completes something already half-present
is in scope. The test is whether the feature already makes a promise it does not keep. A debugger
with F8/F10/F11 bound and no way to set a breakpoint by keyboard is not missing a feature; it is
half-delivering the one it has, and a user who reaches for F9 out of habit finds nothing. Closing
that is refinement. A tenth panel is still not.

---

## 2. The lens

Judge every feature against these. They are ordered: a failure high in this list makes the ones
below it irrelevant.

**L1 — Does it tell the truth?**
The data shown is current, or the interface says plainly that it is not. A debugging tool that
silently shows stale state is worse than no tool, because it sends you down a wrong path with
confidence. This is the one non-negotiable.

**L2 — Does it survive the loop?**
Development is: change code, restart game, look again. Dozens of times an hour. Anything the user
configured — a filter, a search, an expanded row, a toggle — should still be there on the other
side of a restart or a trip to another panel. Re-typing is the most common tax this tool charges.

**L3 — Does it say what to do next?**
An error or a warning should end with an action. "Session disconnected" is a diagnosis. "Session
disconnected — restart the game, or run `feather run <dir>`" is help.

**L4 — Is the common path short?**
Count the clicks and keystrokes for the thing people do most in that panel. Then count them for the
thing they do second-most. Those two numbers are the panel's real ergonomics.

**L5 — Does it hold up at real scale?**
Not 12 log lines: 40,000. Not 5 assets: an atlas-heavy project. Not a 20-line file: a 3,000-line
`main.lua`. Features are usually built against toy data and used against real data.

**L6 — Does it stay out of the way?**
No toast for something the user can already see. No confirmation for something reversible. No
animation on the path someone walks fifty times a day.

---

## 3. What is already right

Refinement work goes wrong when it treats a good codebase as a broken one. These are load-bearing
and should be preserved — several are the model for fixing the rest.

- **Log retention is genuinely engineered.** `store/log-history.ts` caps at 1000 entries across 16
  buckets, truncates individual entries at 12,000 chars, and has a quota-exceeded retry path that
  compacts rather than throwing away. Someone thought about the browser storage limit before it
  bit a user.
- **Console history is session-scoped and persisted.** `store/console-history.ts` keeps 200 inputs
  and 100 outputs, deduplicated, and `pages/console/index.tsx:476-486` scopes history, outputs and
  saved snippets to the active session. **This is the pattern the other panels should copy.**
- **Breakpoints and profiler probes survive restarts.** `store/debugger.ts:257-263` persists
  `breakpoints`, `profilerProbes`, `defaultEnabled` and `rootPaths`, while correctly leaving
  `pausedState`, `enabled` and `status` transient. The durable/ephemeral split is right.
- **The empty state does real work.** `router.tsx:134-175` shows the actual command to run —
  `feather run <cliProjectDir>` — with the user's own configured directory in it, plus routes to
  settings and install docs. That is L3 done properly.
- **The protocol-mismatch warning is deliberately narrow.** `pages/session/index.tsx:345-355`
  refuses to degrade session health for a runtime that merely predates protocol negotiation,
  because that would have shown "Needs attention" to every existing user on upgrade. The comment
  explaining why is as valuable as the code.
- **Logs and the data table are virtualized.** `pages/log/LogTable.tsx` and
  `components/data-table.tsx` already handle volume.

---

## 4. Design direction — an instrument, not an interface

Refining the features raises a question the codebase has never answered explicitly: what should
Feather *look* like? Left unanswered it gets answered by accident, one Tailwind class at a time,
which is exactly what has happened (**C0** below).

### Why the obvious candidates are wrong

Worth recording, because both will be proposed again by someone who has not read this.

**Bento** optimizes for glanceable *variety* — heterogeneous cards at equal visual weight.
Inspector's core surfaces are deep uniform lists: logs, assets, frames, observers. Those need
hierarchy and vertical density, and bento's padding and gaps spend precisely the space §6.1 is
short of. Equal weight is also the wrong claim to make when one row is a fatal error and the
other four hundred are debug noise.

**Neo-brutalism** spends contrast on decoration — hard borders, offset shadows, saturated blocks.
That is the same budget the semantic colors need. If the chrome shouts, red stops meaning "this
crashed", because everything is already loud. It is also fatiguing across the eight-hour sessions
this tool is actually used in.

The deeper reason both fail is the same: they are styles built to *attract* attention. Inspector
must never want attention. The user's attention belongs on their bug.

### The direction

The reference class is not web design, it is **measurement instruments** — DevTools, Instruments,
Grafana, Linear. Four rules, in priority order.

**D1 — Color is a reserved channel.**
Chrome is achromatic: greys carrying a slight hue bias toward the existing rose accent, so they
read as chosen rather than defaulted. Saturation is spent *only* on the four semantic states and on
interaction. The accent (`--primary`, `#ad5b68`) means "you can act here" — selection, focus,
primary action — and never encodes data. The payoff is that a spot of color anywhere in the UI
carries meaning by construction, which is worth more than any amount of styling.

**D2 — Typography carries the hierarchy.**
One sans for chrome, one mono for data, and `font-variant-numeric: tabular-nums` everywhere digits
line up in a column — FPS, memory, timings, byte counts, durations. Without it a changing number
reflows its neighbours, which reads as jitter in exactly the panels you are watching *for* change.
Rank comes from weight and size so it does not have to come from color.

**D3 — Rules, not cards.**
Dividers and one spacing scale instead of elevation. Cards imply peers; this data has hierarchy.
Elevation stays at zero except for things that genuinely float — command palette, popovers,
dialogs. This also directly buys back the vertical density §6.1 needs.

**D4 — Motion only for causality.**
Animate to show that something *arrived* or *changed* — a new log line, a value updating, a panel
going stale. Never for decoration, and never on a path someone walks fifty times a day. Everything
respects `prefers-reduced-motion`.

None of this is a restyle. The existing Radix/shadcn foundation and the Night Owl-ish palette are
already most of the way there; this is mostly consolidation, and D1 is the part with teeth.

### C0 — The semantic color channel is broken *(verified — do this first)*

Listed as a cross-cutting finding because it is one, but placed here because it is what D1 exists
to fix, and because it is the prerequisite for **C2**: a staleness indicator needs a color that
already means something.

Inspector expresses four meanings with **fifty-four different colors**, as raw Tailwind literals:

| Meaning | Distinct colors in use | Examples |
|---|---|---|
| ok | **12** | `emerald-100/300/400/500/600/700/950`, `green-300/400/500/600/700` |
| warning | **17** | `amber-100…950`, `orange-400/500/600/700`, `yellow-400/500/600/950` |
| danger | **9** | `red-100/400/500/600/700/950`, `rose-100/500/950` |
| info | **16** | `blue-300…700`, `cyan-100…950`, `sky-100…950` |

158 raw literals against 338 uses of proper semantic tokens. Two consequences, both verified:

**They ignore the user's theme.** Inspector ships **79 themes** across five registries
(GitHub, Noctis, Tokyo Night, Rainglow, Visual Studio C++), and
`assets/theme/registry/types.ts` lets each override 36 `THEME_CSS_VARIABLES` — chrome, sidebar,
charts, even the four `plugin-*` colors. **Not one semantic state color is in that list.** So a
user on Noctis Light gets their theme's chrome and Tailwind's stock palette for the colors that
actually carry meaning.

**They fail contrast on the themes we ship.** Measured against real theme backgrounds:

| Literal | Noctis dark | Tokyo Night dark | app `.dark` | app light |
|---|---|---|---|---|
| `amber-700` | 3.21 ✗ | 3.07 ✗ | 3.77 ✗ | 4.54 ✓ |
| `green-700` | 3.21 ✗ | 3.07 ✗ | 3.77 ✗ | 4.54 ✓ |
| `red-600` | 3.34 ✗ | 3.19 ✗ | 3.92 ✗ | **4.37 ✗** |
| `blue-700` | 2.40 ✗ | 2.30 ✗ | 2.82 ✗ | 6.06 ✓ |
| `green-400` | 9.25 ✓ | 8.85 ✓ | 10.86 ✓ | **1.58 ✗** |
| `amber-300` | 11.18 ✓ | 10.69 ✓ | 13.12 ✓ | **1.30 ✗** |

WCAG AA is 4.5:1. The dark-leaning literals are near-invisible on light themes; the light-leaning
ones fail on every dark theme; `red-600` fails on Inspector's *own* default light background. The
colors carrying "this crashed" are unreadable on roughly half the themes the product ships.

This is not a style preference. It is a correctness bug in the signal channel, which is why it
outranks everything else in §5.

**Refinement.** Four semantic ramps, tokenized like everything else, each with a foreground, a
surface and a border so panels can use them for chips, rows and banners without inventing values:

```css
/* :root — light. Verified against --background #f0f4f8 and --card #f8fbff. */
--ok:      #0a6c46;  --ok-surface:     #e6f4ec;  --ok-border:     #b7ddc8;
--warn:    #8a5a00;  --warn-surface:   #fdf3e0;  --warn-border:   #e8cf9e;
--danger:  #b3261e;  --danger-surface: #fbeae9;  --danger-border: #eebbb7;
--info:    #1a5fa8;  --info-surface:   #e8f0fa;  --info-border:   #b9d0ea;

/* .dark — verified against --background #0d1117 and --card #161b22.
   --danger is the existing --destructive, so it aliases rather than diverging. */
--ok:      #5ddba4;  --warn:  #e5b567;
--danger:  #f85149;  --info:  #79b8ff;
```

Contrast of every value above, measured on both the page background and the card surface in its
own mode:

| Token | light on bg / card | dark on bg / card |
|---|---|---|
| ok | 5.85 / 6.23 | 10.93 / 10.00 |
| warn | 5.36 / 5.71 | 10.04 / 9.17 |
| danger | 5.91 / 6.30 | 5.65 / 5.16 |
| info | 5.85 / 6.23 | 9.11 / 8.33 |

All pass AA. Then three steps, in order:

1. Register the ramps in `@theme inline` as `--color-ok` … `--color-info`, so `text-ok`,
   `bg-warn-surface` and `border-danger-border` exist as ordinary utilities.
2. **Add them to `THEME_CSS_VARIABLES`** and give every theme values. This is the step that makes
   the channel real; without it the tokens are just better-named hardcoding. Hand-authoring is
   not viable at 79 themes, so they are derived per theme from its own background.
3. Replace the 158 literals, panel by panel, deciding what each one *meant* rather than
   transliterating the hue. Some will turn out to have meant nothing, and should become
   `muted-foreground`.

One inconsistency to settle while in here: `--primary` is the rose `#ad5b68` in light and a plain
grey `#8b949e` in dark, so the interaction accent D1 depends on simply vanishes in dark mode.

**Acceptance.** No raw Tailwind color literal remains in `apps/inspector/src`; a lint rule keeps it
that way. Every theme renders all four states at AA or better on its own background. Switching theme changes the state colors coherently instead of leaving them fixed.

---

## 5. Cross-cutting findings

These were found by reading Inspector's 25,146 lines across 13 surfaces. They are listed first
because each one is a single fix applied in many places, which is cheaper and more consistent than
fixing the same thing thirteen times with thirteen different solutions.

**C0 is in §4**, with the design direction it implements. It comes before everything here: it is a
correctness bug in the color channel, and C2 depends on it.

### C1 — Panel state does not survive navigation *(verified)*

The highest-frequency tax in the app. Inspector is a tabbed tool people bounce between constantly,
and most panels forget everything the moment you leave.

On the **default route**, `pages/log/LogTable.tsx:86-88`:

```ts
const [search, setSearch] = useState('');
const [typeFilter, setTypeFilter] = useState<LogFilter>('all');
const [followTail, setFollowTail] = useState(true);
```

Filter the log down to the one subsystem you care about, jump to Performance to check a number,
come back — you are staring at unfiltered output again and typing it a second time.

Confirmed elsewhere:

| Surface | Lost on navigation | Reference |
|---|---|---|
| Logs | search, type filter, follow-tail | `pages/log/LogTable.tsx:86-88` |
| Assets | search, and per-asset zoom/pan | `pages/assets/index.tsx:708`, `:522-523` |
| Performance | disk-usage toggle, follow-tail, paused | `pages/performance/index.tsx:313-315` |
| Compare, Time Travel, Session Replay | all local `useState`, no persistence or URL sync | — |

Console and Debugger already do better, so the codebase contains its own answer.

**Refinement.** Give panel state a home. Decide per piece of state which of three it is: **URL**
(shareable and back-button friendly — filters, search, selected item), **persisted per session**
(follows the game — expanded rows, per-asset zoom), or **genuinely ephemeral** (a dialog being
open). Then apply it uniformly. Console's session-scoped store is the working precedent; the
question to answer once, not per panel, is whether filters key off the session or are global.

**Acceptance.** Set a filter in every panel, navigate away and back, and find it intact. Restart
the game and find the session-scoped ones intact.

### C2 — Freshness is invisible *(verified)*

Inspector has **45 refresh affordances** and essentially **zero** indications of when data was last
updated — `assets`, `observable`, `performance`, `plugins`, `compare` and `session-replay` have no
"last updated", "as of", or staleness marker at all.

This directly contradicts **L1**, and it interacts badly with a deliberate design choice: panels
request fresh data when opened and then go dormant when you leave. That dormancy is correct — it is
what keeps Feather's runtime overhead low — but it means a panel you return to may be showing state
from ten minutes and three game restarts ago, rendered identically to live data.

The user is given a button to fix a problem they cannot see.

**Refinement.** Every panel that displays runtime state shows when that state arrived, and marks
itself visibly stale once it is dormant and the session has moved on. Prefer making the answer
obvious over adding another button — if a panel can cheaply tell it is stale, it should either
refresh or say so, not wait to be asked.

**Acceptance.** Open a panel, leave it, restart the game, come back: it is unambiguous within one
second whether you are looking at the new run or the old one.

### C3 — Diagnoses without a next action *(verified)*

`pages/session/index.tsx:328-335`:

> **Session disconnected** — "This session is selected but no longer receiving live runtime data."

True, and it stops exactly where the user's question starts. Contrast with the empty state in §3,
which hands over a runnable command. The empty state proves the team knows how to do this; it just
has not been applied to every terminal state.

**Refinement.** Audit every warning, error toast and empty state for a next action. Where one
exists, name it — ideally as something clickable or copyable, matching the empty state's approach
of embedding the user's real project directory rather than a placeholder.

### C4 — Failures the user never learns about *(verified, needs triage)*

44 instances of swallowed errors across Inspector. Some are correct — a clipboard write that fails
is not worth interrupting anyone. Others are not:

```ts
// router.tsx:126,128 — runtime interest and refresh commands
}).catch(() => {});
sendCommand(sessionId, command).catch(() => {});
```

If those fail, panels quietly stop receiving the data they asked for and the user sees an empty
panel with no explanation — an L1 failure reached by a different route than C2.

**Refinement.** Triage all 44. Each becomes one of: genuinely ignorable (leave it, with a comment
saying why), worth surfacing to the user, or worth surfacing only in a diagnostics view. The point
is that each one is a decision rather than a default.

---

## 6. Feature-by-feature — Inspector

Thirteen surfaces. Each gets its own pass, and a pass is not finished until its acceptance line is
demonstrably true.

**Honesty about status.** §5 was derived from reading the whole app, so it applies everywhere.
The per-feature notes below are **starting points, not completed audits** — where something is
marked *verified* it was checked directly in this pass; everything else is the question to answer,
not a finding. Do not treat an unverified line as a defect until you have reproduced it.

### The template

Work each surface in this shape, and record the result in place:

1. **Use it for real.** Run a game with `pnpm run up`, do the thing this panel is for, and note
   every moment of friction before reading any code. This is the most valuable step and the easiest
   to skip.
2. **Score it against L1–L6.** Name the specific failure, not a general impression.
3. **Check it at scale** (L5) with real data volumes.
4. **Propose refinements, ranked** by friction removed per unit of risk.
5. **Write the acceptance line** — how someone else confirms it is better.

### 6.1 Logs — the default route

The first thing every user sees and the highest-traffic surface in the product.

- **Verified:** virtualized; retention engineered (§3); filters ephemeral (**C1**).
- Ask: is search substring-only, and is that enough at 40k lines? Can you get *out* of the tool —
  copy a line, copy a stack, export a filtered view — without leaving the keyboard? When a log
  arrives while you are scrolled up, what happens, and is follow-tail's behaviour obvious?
- **Acceptance:** find one line among tens of thousands, act on it, and return to a live tail
  without re-typing anything.

### 6.2 Session — health and identity

Where users go when something is wrong, so its own clarity matters more than most.

- **Verified:** the warning set is thoughtful; the protocol-mismatch nuance (§3) is a highlight;
  the disconnected warning has no remedy (**C3**).
- Ask: are warnings ordered by what to do first, or by construction order? Is "Needs attention"
  actionable at a glance?
- **Acceptance:** a user with a broken session reaches the right fix from this page alone.

### 6.3 Performance and Profiler — 1,794 LOC, 4 files

The largest surface after settings.

- **Verified:** disk-usage, follow-tail and paused are ephemeral (**C1**); no freshness marker
  (**C2**).
- Ask: is a capture's cost obvious *before* starting it? Are captures comparable across runs, given
  that comparing before/after is the entire point of profiling? Does the panel distinguish "cheap
  to leave open" from "actively measuring"?
- **Acceptance:** profile a change, compare against the previous run, and reach a conclusion without
  exporting anything by hand.

### 6.4 Debugger — 1,531 LOC

- **Verified:** breakpoints and probes persist (§3); F10/F11 stepping and Cmd+F search are bound
  (`pages/debugger/index.tsx:287,882-885`); the fewest empty-state strings of any large surface,
  which is worth a look given how many states a debugger has.
- Ask: when source cannot be resolved, does it explain the root-path problem and offer the fix?
  What does a breakpoint in a file the runtime never loads look like? Is the paused/running state
  unmissable from anywhere in the app?
- **Acceptance:** set a conditional breakpoint in a 3,000-line file, hit it, inspect a frame, and
  step out — mostly from the keyboard.

### 6.5 Console

Currently the best-behaved surface, and the reference for the others.

- **Verified:** session-scoped persisted history, outputs and snippets; 200/100 caps.
- Ask: is multi-line editing comfortable? Are long results readable, or do they flood the pane? Is
  the security gate explained where it is enforced, or only in settings?
- **Acceptance:** iterate on a snippet across a game restart without losing it.

### 6.6 Assets

- **Verified:** search and per-asset zoom/pan are ephemeral (**C1**); no freshness marker (**C2**).
- Ask: how does it behave on an atlas-heavy project (**L5**)? Is there a path from "this texture is
  wrong" to "this is the file on disk"?
- **Acceptance:** locate a suspect asset and identify its source file without leaving the panel.

### 6.7 Plugins — 1,529 LOC

Renders generic UI for arbitrary Lua plugins, so its failure modes are other people's plugins.

- Ask: what does a plugin that returns a malformed action or an unexpected control render as?
  Is enable/disable state legible per session? Does the catalog distinguish "not installed",
  "installed and off", and "incompatible"?
- **Acceptance:** a plugin author can tell from this page alone why their plugin is not appearing.

### 6.8 Observability

- **Verified:** no freshness marker (**C2**), which matters more here than anywhere — observed
  values are exactly the thing you must not read stale.
- Ask: what happens when a value changes faster than the panel updates? Is history available, or
  only the current value?
- **Acceptance:** watch a value across a state change and trust what you see.

### 6.9 Time Travel · 6.10 Session Replay

Grouped because they share the recorded-state model.

- **Verified:** both keep all state in `useState` (**C1**); Session Replay carries the most toasts
  of any panel (6) — worth checking against **L6**.
- Ask: is it obvious what is being recorded, at what cost, and how to get back to live? Can you
  scrub to a moment quickly, or only step?
- **Acceptance:** reproduce a bug from a recording without re-running the game.

### 6.11 Compare

- **Verified:** all local state (**C1**); needs two connected sessions, and the command palette
  already explains that ("Direct links show an empty state until two sessions are connected") —
  check the panel itself is as clear.
- **Acceptance:** two sessions, one meaningful difference, found fast.

### 6.12 Settings — 1,789 LOC, the largest single file

- **Verified:** carries the most toasts (10); the MCP surface copy was corrected in this pass.
- Ask: is it findable — can someone locate a setting without scrolling all of it? Does every
  security-relevant toggle explain its consequence at the point of decision?
- **Acceptance:** change a security-relevant setting and correctly predict what it did.

### 6.13 About

Small, and the only page that is purely informational. Check it is accurate after the v4 split
rather than aspirational, then leave it alone.

---

## 7. Method

**Use the tool before reading its code.** `pnpm run up <example>` brings up Inspector with a
connected game in one command. Friction you feel in ninety seconds of real use is worth more than
an hour of reading, and it is the only way to find the things that are annoying rather than wrong.

**One surface per change.** A pass over Logs is a reviewable unit. A pass over "the UI" is not.

**Cross-cutting fixes come first.** C1 and C2 touch most surfaces; solving them once, well, beats
thirteen local solutions that drift apart.

**Write the acceptance line before the code.** If you cannot state how someone else would confirm
the improvement, the improvement is not defined yet.

**`pnpm run verify:enhanced` is the gate.** It checks the property each finding claims to have
fixed — measured, not asserted — and prints the shortest manual route to seeing each one. A finding
without a check in `scripts/verify-enhancements.mjs` is not finished. A green run still does not
tell you whether the tool *feels* better, which is what the manual routes are for.

**Every refinement is testable.** These are user-visible behaviours, which means Playwright can
hold them. Note the trap this repo already hit (V4.md **D43**): a test that asserts current
behaviour will lock in the very thing you are trying to change. Assert the property you want, not
the markup you have.

**Watch for regressions in the things §3 lists.** They are good; leave them better or leave them
alone.

---

## 8. Status board

| # | Surface | Pass | Notes |
|---|---|---|---|
| D | Design direction (§4) | AGREED, NOT APPLIED | D1-D4; the rules the passes below are held to |
| C0 | Semantic color channel | **DONE** | Ramps derived per theme, AA-verified across all 79; literals replaced; lint rule holds it |
| C1 | Panel state persistence | **DONE** | 13 filters persisted globally; `pnpm run verify:enhanced` |
| C2 | Freshness and staleness | **DONE** | `useFreshness` + `<Freshness/>`; judged against the session, not the clock |
| C3 | Next-action audit | **DONE (Session)** | 9/9 warnings actionable; other panels' empty states still to audit |
| C4 | Swallowed-error triage | **MOSTLY DONE** | 44 → 27; 11 surface, 10 named deliberate; 27 left, mostly clipboard/invoke |
| 6.1 | Logs | **MOSTLY DONE** | follow-tail fixed; scale measured; export of a filtered view still open |
| 6.2 | Session | NOT STARTED | |
| 6.3 | Performance / Profiler | NOT STARTED | |
| 6.4 | Debugger | **DONE** | problem counts navigable; source failure names the path and the fix; keyboard stepping pinned |
| 6.5 | Console | NOT STARTED | Reference implementation |
| 6.6 | Assets | NOT STARTED | |
| 6.7 | Plugins | NOT STARTED | |
| 6.8 | Observability | NOT STARTED | |
| 6.9 | Time Travel | NOT STARTED | |
| 6.10 | Session Replay | NOT STARTED | |
| 6.11 | Compare | NOT STARTED | |
| 6.12 | Settings | NOT STARTED | |
| 6.13 | About | NOT STARTED | Smallest |

Suggested order: **~~C0~~ → ~~C1~~ → ~~C2~~ → ~~6.1~~ → ~~6.4~~ → 6.3**, then the rest. C0 first because it is a
correctness bug and because C2 needs a working color channel to build on. C1 and C2 then remove the
most friction per unit of work. Logs, Debugger and Performance are where users spend their time.

---

## 9. Out of scope

Recording these so they stay decided rather than being relitigated each time someone reads this.

- **New features, panels and tools.** The rule in §1, as amended: completing a promise the
  feature already makes is in scope; a new surface is not.
- **Redesigns.** Refinement means the user's existing muscle memory keeps working. If a change
  requires relearning the panel, it is not this.
- **The v4 split.** V4.md owns it, and it is essentially complete.
- **Studio, CLI, and the extension.** They get their own sections in this document once Inspector
  is done. Inspector is first because it is where users spend the most time and because it is the
  product most likely to be abandoned over friction.

---

## 10. Log

Append findings, decisions and completed passes here so the next person inherits the reasoning and
not just the diff.

**2026-09-09 — Document created.** Cross-cutting findings C1–C4 derived from a read of all 25,146
lines of Inspector across 13 surfaces. Per-feature sections are starting points, explicitly not
completed audits. Nothing has been changed in the application yet.

**2026-09-09 — C0 done.** The channel exists and is enforced.

Rather than hand-author four ramps across 79 themes, they are derived:
`assets/theme/registry/semantic.ts` solves each state's lightness against the theme's own
background until it clears the contrast target, and `index.ts` applies that to every theme as it is
assembled. A new theme gets correct state colors for free; a theme that wants a specific value
still wins, because derivation never overwrites an authored one.

Deriving was not sufficient on its own, and the test proved it. Solving against the page background
alone left `--danger` at 4.15:1 on `--danger-surface` — the chip pairing, which is a harder ground
because it is a tint of the same hue. 66 theme/state combinations failed that way. Foregrounds are
now solved against every ground they render on at once: background, card, and their own surface.
`scripts/tests/themeSemanticColors.test.ts` holds all of it, including that no two states collapse
to the same value. Across all 79 themes the minimum contrast is now 5.23:1 against AA's 4.5.

Then the 311 literals. Most were mechanical, but the pass surfaced five places where color was
claiming something untrue, and those were the point of the exercise:

- Plugin capability badges coloured a taxonomy as states — `filesystem` read as a warning,
  `audio` as "ok". Replaced with the distinction that matters when auditing a plugin: filesystem
  and network reach outside the game, everything else is chrome.
- The four debugger flow buttons were four different colors for four adjacent controls of the same
  kind, and two had become state tokens claiming "Continue" is an ok state. All now chrome; the
  icon and label already distinguish them.
- Profiler probe kinds likewise, where "stop" had become danger. `ProfilerProbeIcon` already gives
  each kind its own icon.
- Performance metric cards carried six decorative hues shown only while selected, so a selected
  frame-time card looked like a failure and disk usage like a warning whatever the numbers said.
  Selection is interaction, so it is the accent, once.
- Lua value types and stack-trace highlighting are syntax, not state. They keep literals behind a
  documented lint exemption; borrowing `--ok` for a number would make green mean "fine" in one
  place and "number" in another. They belong in the theme's syntax palette — a later pass.

Log badges moved from solid fills to tinted chips. The fills hand-picked a pair per mode with no
contrast guarantee on any theme; the chip pairing is the one the test asserts. It also reads better
in a dense log list, where a column of saturated blocks makes a real error harder to find.

A `no-restricted-syntax` rule now rejects raw Tailwind color literals in `apps/inspector/src`, so
this cannot drift back. Full suite 7/7.

**2026-09-09 — C1 done.** Panel state has a home: `store/panel-state.ts`, a persisted store behind
a `usePanelState` hook with `useState` ergonomics, so migrating a panel is one line per field.

The decision the document said to make once: **global, not per session.** A restart mints a new
session id, and the loop this protects is *change code, restart, look again* — keying filters to the
session would clear them on exactly the event they most need to survive.

13 filters now persist across Logs, Assets, Performance, Compare, Observability, Debugger and
Console. Two deliberate exclusions, both because persisting would make the tool lie: Performance's
`paused`, since returning to a silently frozen chart is the stale-data trap, and Console's draft
`input`, since restoring a half-typed command into a console you can execute from is a worse
surprise than retyping it.

Correction to §5: the finding listed Compare, Time Travel and Session Replay together as holding
ephemeral state that should persist. Compare does. Time Travel and Session Replay do not — reading
them, everything they hold is a scrub position, a loading flag or a record id, all of which are
genuinely ephemeral. Nothing to fix there.

Persisting filters created a trap that had to be closed in the same change: a filter that outlives
the visit needs a way out as quick as the way in, or coming back looks like missing logs rather
than an active search. Log search gained a clear control, and Settings → Reset to defaults now
clears panel state too.

**2026-09-09 — C2 done.** Panels can now say whether what they are showing is current.

The judgement deliberately is not age. A value from 40 seconds ago is fine when the game has been
up an hour and wrong when it restarted five seconds ago, so freshness is measured against the
attached session's `connectedAt`, not the clock. Data that predates the session is from a previous
run, however recent it looks. `isFromPreviousRun` is a pure function so that judgement is testable
without a React tree, and `scripts/tests/freshness.test.ts` pins it — including that age alone never
marks data stale, because a warning that fires on a quiet panel trains people to ignore it.

`<Freshness/>` is quiet when the answer is boring — muted, small, no icon, because most of the time
it says "12s ago" and should be skippable — and loud when the data is from a previous run, which is
the case that sends someone chasing a bug in state that predates their fix. The refresh action is
offered only in that case: a refresh button you never needed is the noise L6 warns about.

Wired into Assets and Observability first. Observability matters most — observed values are exactly
the data you cannot afford to read stale, since watching them change is the entire point.

**2026-09-09 — C3 and C4.**

C3 on the Session panel: all nine warnings now end with what to do, and the disconnected one carries
the run command built from the user's own configured project directory, the way the empty state
already did. The audit also found a warning that should not have existed: *Debugger attention* fired
on `pausedState || problems`, so sitting at a breakpoint — a thing you did deliberately — raised a
warning and degraded session health, in the middle of the work where noise costs most. Pausing is
state; only genuine sync and condition failures are warnings now. Other panels' empty states are
still to audit, so this is done for Session rather than done.

C4 turned out to be two findings wearing one coat, and the fix was to name them. A bare
`.catch(() => {})` cannot say whether the silence was considered or merely convenient, so there are
now two senders. `sendUserCommand` surfaces failure and covers 11 sites the user reaches by pressing
a button — stop the recording, clear the logs, import a replay — where silence left them believing
something happened that did not. `sendBackgroundCommand` swallows *by design*, with the reasoning in
one place, and covers the `req:*` refreshes that are retried anyway and whose real signal is C2's
staleness indicator rather than a toast per hiccup.

44 down to 27. The remainder are clipboard writes, `invoke` calls and plugin actions that still need
reading one at a time; the two named helpers mean any new bare swallow now stands out as untriaged.

**2026-09-09 — Crash in the log search, reported from real use.**
`TypeError: undefined is not an object (evaluating 'log.str.toLowerCase')` on the first keystroke.

The cause was a type that was never true. `schema` declared `str: z.string()`, but nothing anywhere
validated against it — `parseLogLine` did `JSON.parse` and cast the result, and the WebSocket path
casts too. So a runtime that omitted `str` produced a `Log` whose `str` was `undefined`, typed as a
string, and the filter dereferenced it.

Fixed at both levels. The schema now defaults `str` and `trace` rather than requiring them, and
`parseLogLine` actually parses through it — a log line missing its message is still evidence
something happened, and dropping it would hide exactly the malformed output someone is hunting. The
matching logic moved to `pages/log/search.ts` with no React in it and is defensive regardless,
because the WebSocket path still casts and searching is the last place that should be strict about
shape: it is what people reach for when the output already looks wrong.

Two things worth remembering from this one. First, C1 did not cause the crash but made it far more
reachable — a persisted filter is non-empty across much more of the app's life than one that reset
on every navigation. Persisting state raises the cost of every latent bug in the code that state
feeds. Second, **the first regression test I wrote was a false pass.** It seeded
`feather-log-history` with a `buckets` array; the real shape is `logsBySession` keyed by id, so no
malformed log ever reached the filter and the test went green against the unfixed code. Reintroducing
the bug to watch the test fail is what caught it. A test that has never failed has not been tested.

**2026-09-09 — 6.1 Logs.**

The panel's three open questions, answered.

**Scale (L5) is fine, and that is the finding.** Measured over a realistic typing burst: 4.3 ms per
keystroke across 40,000 logs, 1.1 ms at 10,000. No debouncing or deferred value was added, because
adding either would have been complexity bought against a cost that is not there. Worth recording so
the next person does not optimise it on instinct.

**Follow-tail was fighting the user.** Virtuoso's `followOutput` already behaves correctly — its own
documentation says it "scrolls down only if the list is already at the bottom" — but an effect
alongside it called `scrollToIndex` unconditionally on every arrival, overriding that. Scroll up to
read something during a chatty session and the next log line dragged you back to the tail. Reading
older output while a game was running was close to impossible, and the fix was deleting code rather
than adding it. The jump-to-tail on a *filter* change is kept and now keyed only on the filter,
because that is a deliberate act where landing at the tail is what you want.

**Getting data out is partly solved.** `CopyButton` covers the message, the stack and the full JSON —
but only from the side panel, after selecting a log. There is no copy from the list itself and no
export of a filtered view, which is what the acceptance line asks for. Left open.

One honest gap. I could not build a browser test for the arrival case: the e2e harness's
`emitMessage` did not deliver a `type: 'log'` message to the list in the time I gave it, and the
first draft of the test would have passed vacuously for exactly that reason. The precondition
assertion I added caught it — asserting the injected log actually arrives before checking scroll —
so the test failed loudly instead of lying. Rather than ship it, the check in `verify:enhanced` is a
static one, labelled as static: it asserts the effect is no longer keyed on arrivals and that
`followOutput` is still passed. The behaviour itself rests on the library's documented contract and
on reading the code. That is weaker than a browser test and is recorded as such.

**2026-09-09 — 6.4 Debugger, first pass.**

The panel asked "what does a breakpoint in a file the runtime never loads look like?" and the answer
was: a badge reading **"3 rejected"**, with no route to which three, in which files, or why. The
condition-error badge was marginally better — the runtime's message was in a `title` tooltip, but
only for the most recent one, and only on hover. A count you cannot open is a dead end: it tells you
something is wrong and then refuses to say what.

Both are now openable and list each issue with its file, line and the runtime's own reason, and
selecting one jumps to that file and line — reusing the same navigation the stack-frame list already
uses, so it is not a new interaction to learn.

Rejections moved from `destructive` to `warn` while in here. A breakpoint the runtime declined will
not fire, which is worth knowing, but nothing has crashed. Reserving danger for actual failures is
what keeps danger meaning something.

The e2e test was verified the way the last one should have been: reverted to the old dead-end badge
first, confirmed it failed, then restored the fix. Still open on this surface: what source resolution
failure looks like, and whether it explains the root-path problem and offers the fix.

**2026-09-09 — 6.4 Debugger finished.** The two questions I had left open, answered rather than
deferred.

**Source resolution failure.** The read was `readTextFile(absPath).catch(() => { setFileContent(null) })`
— one of C4's remaining swallows, discarding both the path it tried and the reason it failed. The
panel then said "File content is unavailable. Open the project folder or select a readable .lua
file." for two different situations: nothing selected yet, which is normal, and a file it genuinely
could not read, which is not.

Those are now separate. Nothing selected says so plainly. A failed read shows the **resolved
absolute path** it tried, the runtime's own reason, and a button that opens the folder picker —
plus the sentence that actually helps: the project root is inferred from the running game's config,
so it is usually what is wrong. Showing the path is the whole trick; one glance tells you whether
the root is wrong or the filename is, which no amount of generic wording does.

**The keyboard acceptance line.** I had called this untestable and needing a real session. That was
wrong — Playwright drives a keyboard. All four flow controls are bound (F8 continue, F10 over, F11
into, Shift+F11 out) and now pinned by a test that presses each one while paused and asserts the
matching `cmd:debugger:*` reaches the game. A second test covers the guard that matters more: a
stepping key must not fire while you are typing in a field. Both were verified by breaking them —
removing `isEditableTarget` from the guard makes the second fail with "a stepping key fired while
typing in a text field".

What genuinely still needs a person: whether setting a *conditional* breakpoint and inspecting a
frame are reachable without the mouse. They are context-menu and click driven today. That is a
gap worth closing, but it is an addition to the keyboard surface rather than a refinement of it, so
it goes on the list rather than into this pass.

**2026-09-09 — 6.4 keyboard completion, and an amendment to the rule.**

The owner widened §1: a small addition that completes something already half-present counts as
refinement. The distinction that makes it safe is whether the feature already makes a promise it
does not keep. A debugger with F8/F10/F11 bound and no keyboard route to a breakpoint is not missing
a feature — it is half-delivering the one it has, and a user who reaches for F9 out of habit finds
nothing there.

**F9 toggles a breakpoint, Shift+F9 edits its condition**, both acting on the line you are paused
at. Those are the bindings every editor uses, so most people will try them before reading anything.
Acting on the paused line is what makes it work without inventing a cursor concept the source view
does not have — and the paused line is the line you care about when paused.

Why the gutter needed this at all: it is one button per line. The frames list is already reachable
by Tab and Enter because the frames are real buttons and a call stack is short, so that half of the
acceptance line was already met. The gutter is not — reaching line 1,847 of a real `main.lua` means
1,847 tab stops, which is reachable in principle and unusable in practice. That is an L4 failure,
not an accessibility footnote.

The shortcut is advertised in the gutter tooltip **only on the paused line**, because that is the
only line it can act on. Promising a key that does nothing would be worse than saying nothing.

Two smaller things fell out. The condition dialog had no accessible description — Radix warns about
it, and the warning is right: announcing only "Breakpoint condition — line 42" leaves a screen
reader user to guess what the field wants. And the first version of the test chained toggle-on,
dialog, toggle-off, which failed because focus after the dialog closed blocked the last key; splitting
them tests each behaviour rather than their interaction. Verified by disabling the F9 branch and
watching it fail.

**2026-09-09 — §4 design direction added, and C0 found while writing it.** The question was which
visual style suits Inspector; the answer turned out to matter less than what the audit for it
turned up. Bento and neo-brutalism were both considered and rejected for recorded reasons. The
direction is D1–D4: color as a reserved channel, typography for hierarchy, rules over cards, motion
only for causality — an instrument rather than an interface.

C0 is the finding: four meanings expressed by 54 different Tailwind literals, none of them
reachable by the 28 shipped themes, several failing WCAG AA on the very backgrounds those themes
set — including `red-600` on Inspector's own default light ground. Proposed replacement tokens were
contrast-checked before being written down rather than after. Still no application code changed.
