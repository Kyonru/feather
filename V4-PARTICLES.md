# V4 — Particles: architecture

*Written 2026-09-10, after the owner's report: "particles are supposed to be efficient… ideally most
of the work should be done by the gpu, and the cpu only work as orchestration… also, the exported
code should behave exactly as the preview."*

---

## 0. How to use this document

§1–§4 are findings — every number in them was measured in this repository, and the commands are
given so you can re-measure rather than trust. §5 is the architecture. §6 is the work, in order.
Do not start §6 before reading §2: it corrects the premise the report was written on, and an
architecture built on the uncorrected version would optimise the wrong thing.

---

## 1. The situation

Particles is the largest tool in Studio and the only one whose output is *code someone ships*. It is
also the one with **four** separate implementations of the same behaviour — three in Lua, plus the
TypeScript curve editor (`easing.ts`, 129 lines) that draws the curve you author:

| # | Implementation | Lines | What it drives |
|---|---|---|---|
| 1 | `plugins/particle-system-playground/init.lua` | 4609 | The live preview **in an attached game** |
| 2 | `example/showcase_preview/main.lua` | 1237 | The love.js preview **Studio shows you** |
| 3 | `_generateCode()`, inside #1 as string literals | ~950 | The **exported** Lua someone ships |

Only a fragment is shared: `timeline_runtime.lua` (303 lines) is required by #1, and embedded into #3
*conditionally*. #2 shares nothing — it defines its own `easeTimelineValue`, its own
`evaluateKeyframes`, its own `normalizeTimeline`, its own emission gating.

The tool next door already solved this. `showcase_preview/main.lua:47` reads
`local PreviewRuntime = require("shader-graph.preview_runtime")` — Shader Graph has one preview
runtime and the preview requires it. Particles has three copies and requires none of them.

**This is why the export does not match the preview.** It is not a bug to be found; it is the
arrangement.

---

## 2. Correcting the premise

> "particles system are suposed to be efficient, they work mostly on the gpu"

**Not in LÖVE 11.7.** `love.graphics.ParticleSystem` simulates on the **CPU, in C++**: position,
velocity, acceleration, damping, size/colour interpolation, spin and lifetime are all stepped in
native code inside `ps:update(dt)`. The GPU's role is the *draw* — the system's particles are
uploaded as one batched vertex buffer and issued as a single draw call, and any per-pixel work is
whatever shader is bound. LÖVE 11.7 has no compute shaders; GPU-resident particle simulation is not
available to us.

So the goal is not "move simulation to the GPU". It is three separate things, and keeping them
separate is what makes the work tractable:

**(a) No per-particle work in Lua.** Every particle attribute LÖVE can interpolate natively is one
it steps in C++ across the whole buffer. Re-implementing any of it in Lua replaces a tight native
loop with an interpreted one. *Already true today* — §4.1.

**(b) No per-frame work in Lua that the value does not need.** This is where the CPU is actually
being spent, and it is entirely avoidable. §4.2.

**(c) The GPU does the varying.** The one genuine GPU lever is the bound shader: per-particle
variation that would otherwise need N systems or Lua bookkeeping can often be a function of the
particle's own attributes in the vertex/pixel stage. §4.4.

The owner's instinct — *"the cpu only work as orchestration whenever is possible, making sure things
are warmed, object pooling"* — is exactly right. It just lands on (b) and (c), not on moving
simulation anywhere.

---

## 3. The principle

**P1 — One program, three hosts.** The preview, the in-game plugin and the exported file must run
*the same code* deciding *the same things*. Where they differ, they differ in what they are attached
to (a canvas, a running game, a shipped project), never in what a keyframe means. This is the whole
of the owner's second requirement, and no amount of careful re-implementation substitutes for it.

**P2 — The runtime simulates; Lua orchestrates.** Lua's job per frame is to decide *what changed*
and tell the particle system. If nothing changed, Lua's job that frame is nothing.

**P3 — Exported code is the product.** It is the only artefact that outlives the session. It should
be code a competent LÖVE developer would be content to have written: no dead branches, no
`pcall` around calls that cannot fail, no configuration the project does not use.

---

## 4. The findings

### 4.1 Per-particle work is already native — that part is fine

The plugin uses the built-in properties rather than re-implementing them. Measured:

```sh
grep -ohE 'set[A-Z][A-Za-z]+' packages/runtime-lua/plugins/particle-system-playground/init.lua \
  | sort | uniq -c | sort -rn | head -20
```

`setColors` (19), `setSizes` (24), `setLinearAcceleration` (16), `setLinearDamping` (15),
`setSizeVariation` (14), `setEmissionArea` (15), `setSpin` (6), `setQuads` (8),
`setRadialAcceleration` (5), `setTangentialAcceleration` (5), `setRelativeRotation` (4). Colour
gradients and size curves go through `setColors`/`setSizes`, which is the native path.

**No change needed here.** Say so plainly rather than rewriting it.

### 4.2 Per-frame work is unconditional — wasteful, but smaller than it looks

`Runtime.applyTimelineToEmitter` (`timeline_runtime.lua:227`) runs **once per emitter per frame**
and, regardless of whether anything changed:

- evaluates **8 lanes** through `evaluateKeyframes` → `easeTimelineValue`, a 25-branch if-chain
- calls **6+ setters**: `setEmissionRate`, `setSpeed`, `setSizes`, `setDirection`, `setSpread`,
  `setOffset`
- allocates a fresh `sizes` table and `unpack`s it for `setSizes`, every frame
- routes every one of those through `callParticle`, which is `pcall`

For a composite with a constant emission rate and no keyframes at all, that is the full cost every
frame for a result that never changes. A 6-emitter composite at 60fps is ~2,880 evaluations and
~2,160 pcall'd setter calls per second to produce identical values.

**`pcall` density**, measured:

```sh
grep -c pcall packages/runtime-lua/plugins/particle-system-playground/init.lua        # 73
grep -c pcall packages/runtime-lua/example/showcase_preview/main.lua                  # 54
```

Under LuaJIT `pcall` allocates and blocks inlining across the call. On the hot path
(`updateParticleSystems` does `pcall(ps.update, ps, dt)` per system per frame) it is paying an
allocation to guard a call that cannot fail — `ps` is a ParticleSystem the plugin constructed.

It also swallows every error silently, which is V4-ENHANCED **C4** in a hot loop.

**Measured, rather than assumed.** Benchmarked in LÖVE's own LuaJIT, running the real
`applyTimelineToEmitter` against a mock ParticleSystem, 600 frames, 8 keyframed lanes per emitter:

| Scene | Now | Baked LUT + change detection |
|---|---|---|
| 6 emitters, curved | 0.045 ms/f · **1,660 KB** · 3600 calls | 0.006 ms/f · 1 KB · 3600 calls |
| 6 emitters, **constant lanes** | 0.017 ms/f · **1,660 KB** · 3600 calls | 0.005 ms/f · 1 KB · **6 calls** |
| 20 emitters, curved | 0.141 ms/f · **5,532 KB** · 3600 calls | 0.019 ms/f · 5 KB · 3600 calls |
| 50 emitters, curved | 0.351 ms/f · **13,830 KB** · 3600 calls | 0.051 ms/f · 12 KB · 3600 calls |

*(KB is total allocation over the 600 frames, measured with the collector stopped. An earlier
version of this table measured it with GC running and reported figures that swung 14x between runs
— that number was meaningless and is corrected here.)*

**An earlier draft of this section called this "the real cost". The measurement says otherwise, and
the correction matters for what P2 is worth doing *for*.** At 60fps the budget is 16.667 ms/frame:
six emitters cost **0.28%** of it, fifty cost **2.1%**. Curve evaluation is not what makes frames
late.

What the numbers indict is **allocation**, by three orders of magnitude. Six emitters churn
**1.66 MB per 10 seconds** (166 KB/s); fifty churn **13.8 MB** (1.38 MB/s). A fresh `sizes` table
and its `unpack` every frame, per emitter, plus the result table `applyTimelineToEmitter` returns
and nobody keeps.

The damning row is the second one: **a composite whose lanes are all constant allocates exactly as
much as one that is fully keyframed** — 1,660 KB either way. The garbage is unconditional. It has
nothing to do with whether the animation is doing anything.

GC pressure is what produces the hitches people feel; steady-state microseconds are not. Baking
drops the allocation to ~1 KB — near enough to zero — and change detection drops 3,600 setter calls
to **6**.

**One caveat on the platform.** `jit.status()` returns **false** on arm64 macOS — LuaJIT cannot
JIT-compile there (W^X), so LÖVE runs the interpreter. These figures are therefore the *pessimistic*
case, and they are the case the owner's own machine is in. On x86_64 players the same Lua is
compiled and cheaper still, which reinforces the conclusion: this is a cleanliness and allocation
fix, not a frame-rate rescue.

```sh
# reproduce: scripts/bench-particle-timeline.lua, run under LÖVE
love scripts/bench-particle-timeline
```

### 4.3 The export does not match the preview — verified, not suspected

`timeline_runtime.lua` clamps four values. The preview Studio shows clamps **none**:

```sh
grep -nE "math.max\(0, Runtime.evaluateKeyframes|clamp\(Runtime.evaluateKeyframes" \
  packages/runtime-lua/plugins/particle-system-playground/timeline_runtime.lua   # 4 hits
grep -nE "math.max\(0, evaluateKeyframes|clamp\(evaluateKeyframes" \
  packages/runtime-lua/example/showcase_preview/main.lua                         # 0 hits
```

| Value | plugin + export | preview |
|---|---|---|
| `emissionRate` | `math.max(0, …)` | unclamped |
| `speedScale` | `math.max(0, …)` | unclamped |
| `sizeScale` | `math.max(0, …)` | unclamped |
| `opacity` | `clamp(…, 0, 1)` | unclamped |

This is reachable with ordinary authoring, because the overshoot easings are *supposed* to leave
[0,1]. For a lane keyframed 0 → 1:

| Easing | min | max |
|---|---|---|
| `inBack` | **-0.1000** | 1.0 |
| `outBack` | 0.0 | **1.1000** |
| `inElastic` | **-0.3731** | 1.0 |
| `outElastic` | 0.0 | **1.3731** |

So a `sizeScale` lane with `inElastic` drives sizes to **-37%** in the preview and **0** in the
exported code. The user sees one thing and ships another, with no warning, from a stock easing.

**A second divergence, in the opposite direction:** the exported code pools instances
(`pooledInstances`, `MAX_POOLED_INSTANCES` — `init.lua:3639,4382`). Neither the live plugin nor the
preview pools at all. So the export has allocation behaviour the preview cannot show you.

### 4.4 Batching is given up in one specific place

Atlas `playback = "variants"` (`init.lua:587`) constructs **up to 16 additional ParticleSystems**,
one per atlas frame, and the draw path loops `for _, ps in ipairs(atlasSystems(system))` issuing a
separate `love.graphics.draw` for each (`init.lua:2482`). One emitter becomes 16 draw calls and 16
`ps:update(dt)` calls.

This is the one place where the GPU lever in §2(c) applies directly: picking a random atlas frame
per particle is a texture-coordinate offset, which is a shader's job. `setQuads` already handles the
*animated* case natively in one system; only `variants` fans out.

### 4.5 Warming is authored, exported, and honoured by nobody

*(An earlier draft of this section said "nothing is warmed", which was wrong — the mechanism is
already there. What is missing is worse: it is wired up everywhere except where it counts.)*

`kickStartSteps` and `kickStartDt` are real authored fields — they are in the Studio type, in the
project file, and in the export. The names come from Hot Particles, whose model this tool's data
was derived from. Where they are actually honoured:

| Path | References | Applied? |
|---|---|---|
| Studio TS | 7 | authored, sent |
| plugin `init.lua` | 9 | **only** on an explicit `"kick-start"` button action (`init.lua:3075`) |
| exported code | 4 | written into the systems table and **never read** |
| `showcase_preview/main.lua` | **0** | not implemented at all |

So: you set a kick-start, the preview ignores it, the export records it as dead data, and the
attached game applies it only if you press a button. A looping ambient effect (snow, rain, embers)
therefore starts empty in every path that matters and fills over its particle lifetime, so the
first seconds never look like the steady state you tuned against.

LÖVE has no native prewarm; it is `ps:update(dt)` in fixed steps before the first draw — which is
exactly what `init.lua:3079` already does. It just needs to happen on start, in all three hosts,
instead of on a button in one.

---

## 5. The architecture

One module owns particle semantics. Everything else is a host that feeds it.

```
      packages/runtime-lua/particles/          <- new, the only place semantics live
        core.lua        evaluate lanes, clamp, decide what changed
        apply.lua       turn a decision into native ParticleSystem calls
        lifecycle.lua   build / pool / warm / release
                 |
   +-------------+-------------+----------------------+
   |             |             |                      |
 plugin      showcase_preview  exported file      unit tests
 (attached)  (love.js preview) (what ships)       (no LÖVE needed)
```

**`core.lua` must not touch LÖVE.** It takes a timeline, a time and a base table, and returns a
plain table of resolved values. That is what makes it testable without a graphics context, and it is
the same move that worked in Inspector — extract the judgement, test that (V4-STUDIO §8).

**`apply.lua` is the only code that calls a setter.** It takes `core`'s output plus the previous
output and issues *only the setters whose value changed*. This is P2 and §4.2 in one function.

**The exported file embeds these modules verbatim**, not a re-implementation of them. It is
generated by concatenating the same source the preview loads, plus a data table for this composite.
`timeline_runtime.lua` already demonstrates the pattern (`M.source` as a string, `load`ed at require
time); it just needs to be the rule instead of the exception, and unconditional instead of
`if hasGenericLane`.

### 5.1 Custom curves stay exactly as they are — they get baked, not simplified

The question this architecture has to answer is whether arbitrary authored curves survive. They do,
and the reason is a property of the data: **a lane is a pure function of time.** It reads no runtime
state — not particle count, not the emitter's transform, nothing. So it can be sampled once and
looked up thereafter.

`core.lua` bakes each lane into a flat array at load (and, in the editor, on edit). Per frame a lane
costs an array index and a lerp instead of a keyframe search plus a 25-branch easing chain.

**Resolution is the whole correctness argument.** Sample at least once per displayed frame and the
result is exact as far as anyone can observe, because the samples land where the frames do.
Measured against the exact curve at real 60fps frame times over a 3-second timeline:

| Curve | 64 samples (46.9 ms step) | 180 samples (16.7 ms step) | 360 samples (8.3 ms step) |
|---|---|---|---|
| `hold` step | **64.444%** error | **0.000%** | **0.000%** |
| elastic in+out | 3.031% | 0.031% | 0.031% |
| `inOutCubic` | 0.130% | 0.000% | 0.000% |

Undersampling is visibly wrong — a `hold` step baked at 64 samples is 64% off, because a hard edge
smeared across 47 ms is a different animation. At one sample per frame it is exact. **The rule:
`resolution = ceil(duration * 120)`** — two samples per frame at 60fps, which leaves headroom for
frame-time jitter and high-refresh displays.

**Cost of that choice:** 2.8 KB per baked lane at 360 samples. Bake only what needs it — a constant
lane is one number, not an array, and `timelineLanePlan` (`init.lua:3237`) already classifies lanes
as constant / linear / generic, so the classification exists and is being thrown away. In practice
most lanes are constant, so the realistic footprint is far below the 451 KB an all-generic
8-lane × 20-emitter worst case would take.

**The editor is the one place that must not bake eagerly.** Baking 6 emitters × 8 lanes costs about
8 ms, which is fine on an edit and far too expensive while a keyframe is being dragged. While a drag
is in progress, evaluate directly — the exact path still exists and is only 0.046 ms/frame — and
bake on release. The preview stays live and the playback path stays fast.

**What this does *not* change:** which easings exist, what a keyframe means, or the shape of a
project file. Baking is an implementation of `core.lua`, invisible above it. Authored curves are
untouched on disk, and `core.lua` keeps an exact evaluator for the editor and for tests to compare
the baked path against.

### 5.2 Hot Particles' performance, and how to have it *and* the timeline

Hot Particles (ReFreezed) is the reference the owner named, so it is worth being precise about
where its speed comes from. Read its export template — `exportTemplates/defaultLuaModule.lua`, 142
lines — and the answer is immediate:

```lua
local ps = LG.newParticleSystem(image1, 256)
ps:setColors(...)          ps:setDirection(...)     ps:setEmissionArea(...)
ps:setEmissionRate(...)    ps:setEmitterLifetime(...)
ps:setLinearAcceleration(...)  ps:setLinearDamping(...)
ps:setParticleLifetime(...)    ps:setRadialAcceleration(...)
ps:setSizes(...)           ps:setSpeed(...)         ps:setSpin(...)
...20 setters in total, then:
table.insert(particles, {system=ps, kickStartSteps=…, kickStartDt=…, emitAtStart=…, …})
return particles
```

**There is no update function.** The exported module is configuration: twenty setters run once, and
the consuming game calls `ps:update(dt)` and `love.graphics.draw(ps)`. Every animation Hot Particles
can express is a *native per-particle* interpolation — eight colour stops, eight sizes, spin,
accelerations, damping — stepped in C++ across the whole buffer. Per-frame Lua cost: **zero**.

It is fast because its authoring model *is* LÖVE's ParticleSystem, one to one. That is a real
design achievement and it is also the whole explanation. **Hot Particles has no timeline** — no
emission-rate ramp over an effect's life, no bursts at authored times, no multi-emitter
choreography. Our timeline is strictly more than it offers, and the honest reading of "the same
performance" is therefore not "be as fast as Hot Particles at what Hot Particles does" — it is:

> **An effect pays only for the tier it actually uses.**

**Tier 0 — native.** Everything the effect does is expressible as native properties. Compiles to
what Hot Particles emits: setters at load, zero per-frame Lua, and the exported file has no runtime
attached to it at all. This is the default, and most effects live here.

**Tier 1 — timeline.** The effect keyframes something over its own life. Costs one baked-LUT sample
and a changed-value check per lane per frame — **0.006 ms/frame for six emitters** (§4.2), against
0.045 unbaked. Only lanes that are actually keyframed exist; a constant lane is a number and
collapses the emitter back toward tier 0.

The tiering must be **derived, not declared**. Nobody picks a tier in the UI; the compiler looks at
the effect and emits the cheapest form that expresses it. `timelineLanePlan` (`init.lua:3237`)
already classifies lanes as constant / linear / generic — the classification exists and is thrown
away. Keep it, and let it decide what gets emitted.

The test that this is real: **an effect with no keyframes must export a file with no update loop in
it**, byte-comparable in shape to Hot Particles' template. If it exports a timeline runtime that
does nothing, the tiering is decorative.

### 5.3 The authoring model

*(The owner: "i'm okay with redesigning how particles are created, like the whole feature, as long
as we achieve the same things with a more intuitive design.")*

Hot Particles' UI is a flat panel of sliders in fixed groups, with min/max pairs and eight numbered
colour slots — it mirrors the LÖVE API exactly, which makes it predictable and totally unmysterious,
and also makes the user do the translation from "I want embers drifting up" to twenty parameters.
Feather's editor went the other way: gizmos, curve editors, a timeline. Neither is wrong; they solve
different halves.

The redesign keeps both halves and orders them by how people actually work:

**1. Start from an effect, not a parameter.** Templates already exist (`presets.ts`) and are the
most-used entry point. Make them the opening screen rather than a dropdown — fire, smoke, sparks,
rain, snow, explosion, trail — each a working effect the moment it is picked.

**2. Shape it with direct manipulation.** The gizmos are the tool's real advantage over a slider
panel and must survive: `DirectionSpreadGizmo`, `LinearAccelPlane`, `CircularForceGizmo`,
`RotationSpinGizmo`, `TextureOffsetGizmo`, `SizeCurveEditor`, `ColorGradientEditor`,
`DampingRangeEditor`. Drag on the preview, not in a form.

**3. Expose the native model plainly underneath.** Every gizmo writes a named LÖVE property, and the
panel should say which. Someone who knows `setLinearAcceleration` should be able to find it, and
someone who does not should never have to. This is what makes the export legible to the person who
receives it — it is the same vocabulary.

**4. The timeline is a layer you add, not a surface that is always there.** Today every composite
carries a timeline whether or not it uses one, which is why a constant-lane effect allocates as much
as a keyframed one (§4.2). Make adding a lane an explicit act, show which lanes exist, and let an
effect with none be visibly, structurally simpler — including in what it exports (§5.2).

**What must survive the redesign**, because these are the capabilities Hot Particles does not have
and they are the reason this tool exists: multi-emitter composites, the timeline with bursts and
per-lane easing, live push into a running game, custom shaders per emitter, texture atlases with
animated and variant playback, and project import/export.

**What the redesign should remove:** the assumption that every effect needs every surface.

**What the redesign owes the export:** kick-start applied on start rather than on a button (§4.5),
and the tier-0 guarantee in §5.2 — the file someone ships should be the file they would have
written.

**What the generator still decides:** what to *omit*. A composite with no shaders should not carry
shader plumbing. That is a data question — which fields are present — not a semantics question, so
it is safe for the generator to answer and it keeps P3 honest.

---

## 6. The work

Ordered so each phase is independently shippable and verifiable.

### P1 — One semantic core — **DONE 2026-09-10**

`packages/runtime-lua/plugins/particle-system-playground/core.lua` (327 lines) is now the only
definition of what a keyframe means. All three hosts require it; none defines easing or keyframe
evaluation locally.

**Located in the plugin directory, not `packages/runtime-lua/particles/`** as this document
originally said. `scripts/generate-manifest.sh` only walks `feather/` and `plugins/`, so a new
top-level directory would never have been installed into a game. The plugin directory is also the
precedent the tool next door set with `shader-graph/preview_runtime.lua`.

What landed:

- **`core.lua`** — pure Lua, no `love` reference, no `require`. `Core.resolve` returns every lane's
  value for a frame *already clamped*, so no host can forget. `Core.resolveSizes` fills a
  caller-owned table, which is the allocation fix P2 needs.
- **`timeline_runtime.lua`** — 303 lines to 125, now only the setter half plus `coreSource()`. Its
  semantics used to live inside a `[=[ ]=]` string, which is why **luacheck never saw them**: the
  Lua lint went from 146 files to 147 by moving them into a real file.
- **`showcase_preview/main.lua`** — 1237 lines to 1080. 151 lines of duplicated semantics deleted,
  and `applyTimelineAt` now goes through `Core.resolve`, which is what actually fixes the reported
  bug. It previously called the evaluator directly and clamped nothing.
- **The duration clamp** — the plugin clamped to [0.25, 60] and the preview only to a 0.25 floor, so
  a 90-second timeline looped at a different point in each. One rule now.
- **A fourth implementation was found:** `apps/studio/src/tools/particle-system-playground/easing.ts`
  (129 lines) draws the curve editor. It is not Lua, so it cannot require `core.lua` — it is pinned
  instead by a generated contract (below). Checked numerically: all 26 easings already agreed, so
  this divergence was latent, not shipped.

*Verified by:*

| Test | Asserts |
|---|---|
| Lua e2e, 13 new assertions | the clamps hold across 180 frames of an `inElastic` lane; `resolveSizes` reuses and truncates its buffer |
| `particleEasingContract.test.ts` | `easing.ts` matches `core.lua` for all 26 easings × 21 samples |
| `particleCoreIsSingular.test.ts` | no host re-defines the semantics; `core.lua` stays LÖVE-free; the preview bundles and resolves through it |
| plugin e2e, export equivalence | the exported file's embedded core is loaded and compared against the live one — **all 26 easings**, 21 samples each |

Each was verified by breaking what it tests. Two findings from doing so:

1. Removing the clamps from `Core.resolve` fails the Lua e2e as intended.
2. **The export-equivalence test was vacuous when first written.** It sampled six hand-picked
   easings, and a deliberately drifted `inQuad` passed straight through it. It now iterates
   `Core.EASINGS` and asserts the count is 26, so a subset cannot silently be compared again.

### P2 — Change detection — **DONE 2026-09-10**

`apply.lua` is now the only code that calls a setter, and it sends only what moved. Lanes are
compiled once — constant lanes to a number, varying lanes to a baked lookup table — and cached
against the track's own identity, so the expensive part happens on edit rather than per frame.

Measured with `love scripts/bench-particle-timeline`, 600 frames, 8 lanes per emitter:

| Scene | Before | After |
|---|---|---|
| 6 emitters, curved | 0.038 ms/f · 368 KB · 3600 calls | 0.014 ms/f · **3.6 KB** · 3600 calls |
| 6 emitters, **constant** | 0.015 ms/f · 368 KB · 3600 calls | 0.008 ms/f · 3.6 KB · **6 calls** |
| 20 emitters, curved | 0.143 ms/f · 1,226 KB · 3600 calls | 0.046 ms/f · **12.0 KB** · 3600 calls |
| 50 emitters, curved | 0.330 ms/f · 3,066 KB · 3600 calls | 0.111 ms/f · **30.1 KB** · 3600 calls |

Allocation drops ~100x and time ~3x. The row that matters is the second: a composite with no
keyframed lanes now issues **6 setter calls total** instead of 3,600, because after the first frame
there is nothing to say.

**`pcall` is gone from the per-frame path.** `apply.lua` calls methods on the object it is handed
and never touches the `love` global, which is also what lets a counting stub stand in for a
ParticleSystem in the tests. It is guarded: `particleCoreIsSingular.test.ts` fails if `pcall`
reappears there.

**Two allocations were found by measuring rather than reasoning.** The first was the benchmark's own
options table, rebuilt per frame — the test allocating, not the code, which would have masked the
thing being measured. The second was real: `resolveSizes` called `parseNumberList`, which builds a
table, on every emitter every frame — 369 KB per 600 frames on the path whose whole purpose is to
allocate nothing. It now reads a numeric list in place.

**A behaviour fix fell out of dropping `pcall`.** LÖVE's `setSizes` accepts at most eight values,
and a longer list used to raise inside the `pcall`, so **no sizes were applied at all**. `core.lua`
now caps at eight, which applies the first eight instead of silently none.

**Invalidation is the sharp edge.** A change detector is wrong the moment something else writes the
system. `Runtime.invalidateEmitter` is called wherever the properties are re-snapshotted
(`captureTimelineBase`) or the system is reset, and `Apply.invalidate` makes the next tick rewrite
everything.

*Cost to be aware of:* compiling 50 emitters × 8 varying lanes takes ~94 ms (6 emitters: ~11 ms).
That is per edit, not per frame, and only varying lanes are baked — but it is why §5.1 says the
editor must not bake while a keyframe is being dragged.

### P3 — Lifecycle: pool and warm

Move the pooling that exists only in generated strings into `lifecycle.lua`, so the plugin and the
preview pool too.

Prewarm needs building, not designing: `kickStartSteps`/`kickStartDt` are already authored, already
in the project file and already in the export (§4.5). Apply them **on start**, in all three hosts,
instead of on a button in one — the loop at `init.lua:3079` is the implementation. Then make the
exported code read the fields it already writes.

Default it on for `ambient`, since that is the mode whose whole point is a steady state.

*Done when:* an ambient composite looks the same in frame 1 as at t=10s, in all three hosts.

### P4 — Atlas variants without the fan-out

Replace the up-to-16-systems path with one system and a shader that offsets texture coordinates per
particle. Keep the multi-system path behind the existing project field until the shader path is
proven, then migrate projects forward.

*Done when:* a `variants` composite draws in one draw call. *Verify:* count draws in the preview.

### P5 — Generated code is the same program

Rewrite `_generateCode` to emit: the shared modules verbatim, a data table, and a thin host. Its
current ~950 lines of string-building shrink to roughly the data table plus the omission logic.

*Done when:* `_generateCode` contains no easing maths, no keyframe evaluation and no lane names —
those live in the module it embeds.

*Verify:* run the exported file headless against the same timeline and assert the resolved values
match `core.lua` frame for frame. This is the test that makes the owner's requirement mechanical
rather than a matter of care.

---

## 7. What is out of scope

- Rewriting the editor UI. This is the runtime and the export.
- GPU-resident simulation. Not available in LÖVE 11.7 (§2).
- Matching Hot Particles feature for feature. It is the performance reference (§5.2), not the
  functional one — the timeline, multi-emitter composites and live push into a running game are
  deliberately beyond it.
- The 4609-line `init.lua` as a whole. P1–P5 remove its duplicated semantics; the remaining
  plugin/session plumbing is a separate concern.

---

## 8. Traps

**Do not "fix" the preview by copying the clamps into it.** That is the fourth implementation. The
clamps must move to a module all three require, or this document was pointless.

**The clamp change is a behaviour change for existing projects.** Someone may have tuned an effect
against the unclamped preview. Landing P1 makes their preview match their export — which is the
point — but it will *look different* to them. Say so in the release note.

**Verify a test by breaking the thing it tests.** Three tests in the Studio work passed against
unfixed code. Make the fix, watch the test pass, revert the fix, watch it fail, restore.

**`pcall` removal is not blanket.** §4.2 is about the per-frame path on objects this code
constructed. Input authored outside the repo still gets validated.

**Watch the buffer size.** Pooling and prewarm both interact with `setBufferSize`: a prewarmed
ambient system that hits its buffer cap silently stops emitting, which reads as "the effect broke"
rather than "the buffer is full".

---

## 9. Definition of done

1. One module defines what a keyframe means; the plugin, the preview and the exported file all use
   it, and none of them defines easing or keyframe evaluation locally.
2. An `inElastic` size lane renders identically in all three.
3. A composite with no keyframed lanes issues no per-frame setter calls.
4. Ambient composites are warm on the first frame, in all three.
5. `variants` atlases draw in one call.
6. A test runs the exported file and `core.lua` over the same timeline and asserts they agree.
7. An effect with no keyframed lanes exports a file with **no update loop in it** — setters at load
   and a data table, the shape Hot Particles emits (§5.2). If it still ships a runtime, the tiering
   is decorative.
8. A kick-start set in the editor is visible in the preview, not only in an attached game (§4.5).
