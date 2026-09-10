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
also the one with three separate implementations of the same behaviour:

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

### 4.2 Per-frame work is unconditional — this is the real cost

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

### 4.5 Nothing is warmed

```sh
grep -rniE "warm|prewarm|preheat" packages/runtime-lua/plugins/particle-system-playground/init.lua
```

No hits. A looping ambient effect (snow, rain, embers) starts empty and fills over its particle
lifetime, so the first seconds after `start()` do not look like the steady state the author tuned
against. LÖVE has no native prewarm; it is `ps:update(n)` in fixed steps before the first draw.

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

**What the generator still decides:** what to *omit*. A composite with no shaders should not carry
shader plumbing. That is a data question — which fields are present — not a semantics question, so
it is safe for the generator to answer and it keeps P3 honest.

---

## 6. The work

Ordered so each phase is independently shippable and verifiable.

### P1 — One semantic core *(largest, do first)*

Create `packages/runtime-lua/particles/core.lua` from `timeline_runtime.lua`, keeping its clamps.
Point the plugin at it. Delete `showcase_preview/main.lua`'s `easeTimelineValue`,
`evaluateKeyframes`, `normalizeTimeline` and `applyTimelineAt` and require the module instead, the
way that file already requires `shader-graph.preview_runtime`.

*Done when:* the preview clamps, and a `sizeScale` lane with `inElastic` looks identical in the
love.js preview, an attached game, and the exported file.

*Verify:* a unit test over `core.lua` asserting the four clamps, plus a preview test authoring an
`inElastic` size lane and asserting no negative size reaches a setter.

### P2 — Change detection

Add `apply.lua`. It compares this frame's resolved values against last frame's and calls only what
moved. Drop `pcall` from the per-frame path — construct the system once, validate there, then trust
it. Keep `pcall` at the boundaries where input is authored outside this repo (imported projects,
plugin manifests), per V4-STUDIO §8.

*Done when:* a composite with no keyframed lanes issues **zero** setter calls per frame after the
first.

*Verify:* a counting stub for the ParticleSystem — `core.lua` and `apply.lua` never touch LÖVE, so
this is a plain unit test, no graphics context.

### P3 — Lifecycle: pool and warm

Move the pooling that exists only in generated strings into `lifecycle.lua`, so the plugin and the
preview pool too. Add prewarm: `ps:update(step)` in fixed steps totalling the emitter's particle
lifetime before the first draw, for `loop` and `ambient` modes.

Prewarm is authored state — expose it, default it on for ambient, and put it in the project file.
A hidden prewarm is a preview that lies in the other direction.

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
