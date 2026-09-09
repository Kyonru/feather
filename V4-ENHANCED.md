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

## 4. Cross-cutting findings

These were found by reading Inspector's 25,146 lines across 13 surfaces. They are listed first
because each one is a single fix applied in many places, which is cheaper and more consistent than
fixing the same thing thirteen times with thirteen different solutions.

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

## 5. Feature-by-feature — Inspector

Thirteen surfaces. Each gets its own pass, and a pass is not finished until its acceptance line is
demonstrably true.

**Honesty about status.** §4 was derived from reading the whole app, so it applies everywhere.
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

### 5.1 Logs — the default route

The first thing every user sees and the highest-traffic surface in the product.

- **Verified:** virtualized; retention engineered (§3); filters ephemeral (**C1**).
- Ask: is search substring-only, and is that enough at 40k lines? Can you get *out* of the tool —
  copy a line, copy a stack, export a filtered view — without leaving the keyboard? When a log
  arrives while you are scrolled up, what happens, and is follow-tail's behaviour obvious?
- **Acceptance:** find one line among tens of thousands, act on it, and return to a live tail
  without re-typing anything.

### 5.2 Session — health and identity

Where users go when something is wrong, so its own clarity matters more than most.

- **Verified:** the warning set is thoughtful; the protocol-mismatch nuance (§3) is a highlight;
  the disconnected warning has no remedy (**C3**).
- Ask: are warnings ordered by what to do first, or by construction order? Is "Needs attention"
  actionable at a glance?
- **Acceptance:** a user with a broken session reaches the right fix from this page alone.

### 5.3 Performance and Profiler — 1,794 LOC, 4 files

The largest surface after settings.

- **Verified:** disk-usage, follow-tail and paused are ephemeral (**C1**); no freshness marker
  (**C2**).
- Ask: is a capture's cost obvious *before* starting it? Are captures comparable across runs, given
  that comparing before/after is the entire point of profiling? Does the panel distinguish "cheap
  to leave open" from "actively measuring"?
- **Acceptance:** profile a change, compare against the previous run, and reach a conclusion without
  exporting anything by hand.

### 5.4 Debugger — 1,531 LOC

- **Verified:** breakpoints and probes persist (§3); F10/F11 stepping and Cmd+F search are bound
  (`pages/debugger/index.tsx:287,882-885`); the fewest empty-state strings of any large surface,
  which is worth a look given how many states a debugger has.
- Ask: when source cannot be resolved, does it explain the root-path problem and offer the fix?
  What does a breakpoint in a file the runtime never loads look like? Is the paused/running state
  unmissable from anywhere in the app?
- **Acceptance:** set a conditional breakpoint in a 3,000-line file, hit it, inspect a frame, and
  step out — mostly from the keyboard.

### 5.5 Console

Currently the best-behaved surface, and the reference for the others.

- **Verified:** session-scoped persisted history, outputs and snippets; 200/100 caps.
- Ask: is multi-line editing comfortable? Are long results readable, or do they flood the pane? Is
  the security gate explained where it is enforced, or only in settings?
- **Acceptance:** iterate on a snippet across a game restart without losing it.

### 5.6 Assets

- **Verified:** search and per-asset zoom/pan are ephemeral (**C1**); no freshness marker (**C2**).
- Ask: how does it behave on an atlas-heavy project (**L5**)? Is there a path from "this texture is
  wrong" to "this is the file on disk"?
- **Acceptance:** locate a suspect asset and identify its source file without leaving the panel.

### 5.7 Plugins — 1,529 LOC

Renders generic UI for arbitrary Lua plugins, so its failure modes are other people's plugins.

- Ask: what does a plugin that returns a malformed action or an unexpected control render as?
  Is enable/disable state legible per session? Does the catalog distinguish "not installed",
  "installed and off", and "incompatible"?
- **Acceptance:** a plugin author can tell from this page alone why their plugin is not appearing.

### 5.8 Observability

- **Verified:** no freshness marker (**C2**), which matters more here than anywhere — observed
  values are exactly the thing you must not read stale.
- Ask: what happens when a value changes faster than the panel updates? Is history available, or
  only the current value?
- **Acceptance:** watch a value across a state change and trust what you see.

### 5.9 Time Travel · 5.10 Session Replay

Grouped because they share the recorded-state model.

- **Verified:** both keep all state in `useState` (**C1**); Session Replay carries the most toasts
  of any panel (6) — worth checking against **L6**.
- Ask: is it obvious what is being recorded, at what cost, and how to get back to live? Can you
  scrub to a moment quickly, or only step?
- **Acceptance:** reproduce a bug from a recording without re-running the game.

### 5.11 Compare

- **Verified:** all local state (**C1**); needs two connected sessions, and the command palette
  already explains that ("Direct links show an empty state until two sessions are connected") —
  check the panel itself is as clear.
- **Acceptance:** two sessions, one meaningful difference, found fast.

### 5.12 Settings — 1,789 LOC, the largest single file

- **Verified:** carries the most toasts (10); the MCP surface copy was corrected in this pass.
- Ask: is it findable — can someone locate a setting without scrolling all of it? Does every
  security-relevant toggle explain its consequence at the point of decision?
- **Acceptance:** change a security-relevant setting and correctly predict what it did.

### 5.13 About

Small, and the only page that is purely informational. Check it is accurate after the v4 split
rather than aspirational, then leave it alone.

---

## 6. Method

**Use the tool before reading its code.** `pnpm run up <example>` brings up Inspector with a
connected game in one command. Friction you feel in ninety seconds of real use is worth more than
an hour of reading, and it is the only way to find the things that are annoying rather than wrong.

**One surface per change.** A pass over Logs is a reviewable unit. A pass over "the UI" is not.

**Cross-cutting fixes come first.** C1 and C2 touch most surfaces; solving them once, well, beats
thirteen local solutions that drift apart.

**Write the acceptance line before the code.** If you cannot state how someone else would confirm
the improvement, the improvement is not defined yet.

**Every refinement is testable.** These are user-visible behaviours, which means Playwright can
hold them. Note the trap this repo already hit (V4.md **D43**): a test that asserts current
behaviour will lock in the very thing you are trying to change. Assert the property you want, not
the markup you have.

**Watch for regressions in the things §3 lists.** They are good; leave them better or leave them
alone.

---

## 7. Status board

| # | Surface | Pass | Notes |
|---|---|---|---|
| C1 | Panel state persistence | NOT STARTED | Cross-cutting; verified on Logs, Assets, Performance |
| C2 | Freshness and staleness | NOT STARTED | Cross-cutting; 45 refresh affordances, ~0 indicators |
| C3 | Next-action audit | NOT STARTED | Cross-cutting |
| C4 | Swallowed-error triage | NOT STARTED | 44 sites to classify |
| 5.1 | Logs | NOT STARTED | Highest traffic; start here |
| 5.2 | Session | NOT STARTED | |
| 5.3 | Performance / Profiler | NOT STARTED | |
| 5.4 | Debugger | NOT STARTED | |
| 5.5 | Console | NOT STARTED | Reference implementation |
| 5.6 | Assets | NOT STARTED | |
| 5.7 | Plugins | NOT STARTED | |
| 5.8 | Observability | NOT STARTED | |
| 5.9 | Time Travel | NOT STARTED | |
| 5.10 | Session Replay | NOT STARTED | |
| 5.11 | Compare | NOT STARTED | |
| 5.12 | Settings | NOT STARTED | |
| 5.13 | About | NOT STARTED | Smallest |

Suggested order: **C1 → C2 → 5.1 → 5.4 → 5.3**, then the rest. C1 and C2 remove the most friction
per unit of work; Logs, Debugger and Performance are where users spend their time.

---

## 8. Out of scope

Recording these so they stay decided rather than being relitigated each time someone reads this.

- **New features, panels and tools.** The rule in §1. Ideas are welcome; they go elsewhere.
- **Redesigns.** Refinement means the user's existing muscle memory keeps working. If a change
  requires relearning the panel, it is not this.
- **The v4 split.** V4.md owns it, and it is essentially complete.
- **Studio, CLI, and the extension.** They get their own sections in this document once Inspector
  is done. Inspector is first because it is where users spend the most time and because it is the
  product most likely to be abandoned over friction.

---

## 9. Log

Append findings, decisions and completed passes here so the next person inherits the reasoning and
not just the diff.

**2026-09-09 — Document created.** Cross-cutting findings C1–C4 derived from a read of all 25,146
lines of Inspector across 13 surfaces. Per-feature sections are starting points, explicitly not
completed audits. Nothing has been changed in the application yet.
