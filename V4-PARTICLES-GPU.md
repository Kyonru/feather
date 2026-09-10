# Spec: a GPU particle system for LÖVE

**Status:** implementation brief. Written to be handed to an agent with no prior context on this
repository. Everything in §1, §3 and §6 was verified by running it on real hardware; the commands
are given so you can re-verify rather than trust.

**Target:** LÖVE 11.x (verified on 11.5, OpenGL 4.1 Metal, Apple M3 Max).

**Deliverable:** a standalone Lua module, `gpuparticles`, usable by any LÖVE project without this
repository.

---

## 0. Read this first

The phrase "GPU particle system" usually means compute shaders. **LÖVE 11.x has no compute
shaders.** Do not plan around them, and do not reach for `love.graphics.dispatchThreadgroups` — it
does not exist until LÖVE 12.

What LÖVE 11.x *does* have is enough to build a real GPU particle system by the pre-compute
techniques, and both were verified working before this spec was written:

- **instanced drawing with per-instance vertex attributes** — one draw call for the whole system
- **`glsl3` shaders**, including **texture reads in the vertex stage**
- **32-bit float canvases** (`rgba32f`, `rg32f`, `r32f`) and **up to 8 simultaneous render targets**

The design below uses these. Section 3 contains code that was compiled and run, not pseudocode.

---

## 1. Platform reality, verified

Run this before writing anything; if any line disagrees with the table, the design assumptions have
changed and you should say so rather than work around it.

```lua
-- probe.lua
function love.load()
  print(("LOVE %d.%d.%d"):format(love.getVersion()))
  print(love.graphics.getRendererInfo())
  for k, v in pairs(love.graphics.getSupported())   do print(k, v) end
  for k, v in pairs(love.graphics.getSystemLimits())do print(k, v) end
  for _, f in ipairs{"rgba16f","rgba32f","rg32f","r32f"} do
    print(f, love.graphics.getCanvasFormats()[f])
  end
  love.event.quit()
end
```

Measured result:

| Capability | Value | Why it matters |
|---|---|---|
| `instancing` | **true** | one draw call for N particles |
| `glsl3` | **true** | `in`/`out`, integer ops, vertex texture fetch |
| `multicanvasformats` | **true** | position and velocity to separate targets in one pass |
| `multicanvas` (limit) | **8** | up to 8 state textures per simulation pass |
| `rgba32f` / `rg32f` / `r32f` canvas | **supported** | full-precision particle state |
| `pixelshaderhighp` | **true** | `highp` float in the pixel stage |
| `Mesh:attachAttribute(..., "perinstance")` | **exists** | per-particle attributes |
| `love.graphics.drawInstanced` | **exists** | the draw entry point |
| compute shaders | **absent** | the constraint that shapes everything below |

**Do not assume these hold everywhere.** `getSupported().instancing` and the float canvas formats
must be checked at runtime, and the library must degrade (see §4.6), not crash, when they are false.

---

## 2. Two architectures — build both, in this order

### Mode A — *analytic* (stateless)

Particle state is never stored. Each particle carries only its **spawn record** (birth time,
lifetime, initial velocity, seed) as per-instance vertex attributes, and the vertex shader computes
where it is *right now* in closed form:

```
p(age) = p0 + v0·age + ½·a·age²
```

- **Per-frame CPU cost: zero.** Nothing is written, nothing is read back, nothing is stepped.
- Continuous emission is *implicit*: particle `i` is born at `i/rate`, and `mod(now - birth, life)`
  makes it recycle forever with no bookkeeping at all.
- **Limit:** motion must be a closed-form function of age. Constant acceleration, linear/exponential
  damping, sinusoidal turbulence and curl-noise-of-(seed, age) all qualify. **Collision, mutual
  interaction, and anything that depends on the particle's own current state do not.**

Build this first. It covers the large majority of real effects and it is the cheap one.

### Mode B — *stateful* (ping-pong)

Particle state lives in float canvases: one texel per particle, `xy` = position, `zw` = velocity. A
simulation pass renders a full-screen quad through a pixel shader that reads the current state
texture and writes the next. Rendering then reads that texture **in the vertex shader** to place
each quad.

- **Per-frame CPU cost:** two `setCanvas` + one full-screen draw, independent of particle count.
- **Enables:** collision against a heightfield or SDF, attractors that depend on current position,
  flow fields sampled at the particle's location, chained forces.
- **Costs:** two extra canvases per state vector, a full-screen pass per step, and float precision
  care.

Build this second, behind the same public API, selected by whether the effect needs it.

---

## 3. Verified primitives

These were compiled and executed. Use them as the starting point rather than rewriting from memory.

### 3.1 Instanced analytic particles — the whole of Mode A

```lua
-- One unit quad, reused by every particle.
local quad = love.graphics.newMesh({
  { "VertexPosition", "float", 2 },
  { "VertexTexCoord", "float", 2 },
}, {
  { -0.5, -0.5, 0, 0 }, { 0.5, -0.5, 1, 0 }, { 0.5, 0.5, 1, 1 }, { -0.5, 0.5, 0, 1 },
}, "fan", "static")

-- One record per particle. "stream" if bursts will rewrite slices, "static" if purely implicit.
local instances = love.graphics.newMesh({
  { "ParticleBirth", "float", 1 },
  { "ParticleLife",  "float", 1 },
  { "ParticleVel",   "float", 2 },
  { "ParticleSeed",  "float", 1 },
}, spawnRecords, nil, "stream")

for _, name in ipairs({ "ParticleBirth", "ParticleLife", "ParticleVel", "ParticleSeed" }) do
  quad:attachAttribute(name, instances, "perinstance")
end

love.graphics.drawInstanced(quad, particleCount)
```

```glsl
#pragma language glsl3
varying float vAge01;

#ifdef VERTEX
attribute float ParticleBirth;
attribute float ParticleLife;
attribute vec2  ParticleVel;
attribute float ParticleSeed;

uniform float u_time;
uniform vec2  u_gravity;
uniform vec2  u_origin;
uniform float u_size;

vec4 position(mat4 transform, vec4 vertex) {
  float age = mod(u_time - ParticleBirth, ParticleLife);   // implicit recycling
  vAge01    = age / ParticleLife;
  vec2  p   = u_origin + ParticleVel * age + 0.5 * u_gravity * age * age;
  float s   = u_size * (0.5 + 0.5 * ParticleSeed);
  return transform * vec4(vertex.xy * s + p, 0.0, 1.0);
}
#endif

#ifdef PIXEL
vec4 effect(vec4 color, Image tex, vec2 tc, vec2 sc) {
  float fade = 1.0 - vAge01;
  return vec4(color.rgb, color.a * fade * smoothstep(0.5, 0.0, length(tc - 0.5)));
}
#endif
```

Verified: 10,000 instances drew and rendered (805 lit samples of a 64×64 grid over the target).

### 3.2 Bursts — write only the slice that changed

Continuous emission needs no CPU at all. A burst does, and the cost is proportional to the burst,
not the system:

```lua
-- ring buffer: slot cursor wraps; only the new records are uploaded
mesh:setVertices(burstRecords, writeCursor)
```

Measured on a 100,000-particle buffer:

| Operation | Cost |
|---|---|
| write one 512-particle burst at an offset | **0.120 ms** |
| rewrite all 100,000 records | **3.149 ms** — never do this per frame |

The ring buffer is the design: keep a cursor, write forward, wrap. Overwriting a still-living
particle is acceptable and is the standard behaviour — size the buffer so it is rare.

### 3.3 Stateful simulation — the whole of Mode B

```lua
local stateA = love.graphics.newCanvas(w, h, { format = "rgba32f" })
local stateB = love.graphics.newCanvas(w, h, { format = "rgba32f" })
stateA:setFilter("nearest", "nearest")   -- REQUIRED: never interpolate state
stateB:setFilter("nearest", "nearest")

love.graphics.setCanvas(stateB)
love.graphics.setBlendMode("replace", "premultiplied")   -- REQUIRED: see §7.1
love.graphics.setShader(simulate)
simulate:send("u_state", stateA)
simulate:send("u_dt", dt)
love.graphics.draw(stateA, 0, 0)
love.graphics.setShader()
love.graphics.setBlendMode("alpha")
love.graphics.setCanvas()
stateA, stateB = stateB, stateA
```

```glsl
#pragma language glsl3
uniform Image u_state;    // xy = position, zw = velocity
uniform float u_dt;
uniform vec2  u_gravity;

vec4 effect(vec4 color, Image tex, vec2 tc, vec2 sc) {
  vec4 s   = Texel(u_state, tc);
  vec2 vel = s.zw + u_gravity * u_dt;
  vec2 pos = s.xy + vel * u_dt;
  return vec4(pos, vel);
}
```

Verified numerically: with `u_gravity = (0, 200)` and `dt = 1/60`, one step yields
`vel.y = 3.333333` and `pos.y = 0.055556` — exact.

### 3.4 Vertex texture fetch — how Mode B gets its state into the draw

```glsl
#pragma language glsl3
#ifdef VERTEX
uniform Image u_state;
uniform float u_texSize;
attribute float ParticleIndex;

vec4 position(mat4 transform, vec4 vertex) {
  vec2 uv = (vec2(mod(ParticleIndex, u_texSize), floor(ParticleIndex / u_texSize)) + 0.5) / u_texSize;
  vec4 st = Texel(u_state, uv);            // reading a texture in the vertex stage
  return transform * vec4(vertex.xy + st.xy, 0.0, 1.0);
}
#endif
```

Verified to compile and run. Note the `+ 0.5` texel-centre offset — without it you sample a corner
and may read a neighbouring particle.

---

## 4. The library

### 4.1 Layout

```
gpuparticles/
  init.lua        public API, capability detection, mode selection
  emitter.lua     one emitter: buffers, spawn records, ring cursor
  analytic.lua    Mode A: buffer construction, the analytic draw
  stateful.lua    Mode B: canvases, ping-pong, the simulation pass
  shaders/
    analytic.glsl
    simulate.glsl
    render.glsl
  forces.lua      composable closed-form force terms (§4.4)
```

No dependencies beyond LÖVE. No global state. Every object explicitly released via `:release()`.

### 4.2 Public API

```lua
local gpuparticles = require("gpuparticles")

local emitter = gpuparticles.newEmitter({
  max        = 50000,
  texture    = image,            -- optional; a soft disc is generated if absent
  mode       = "auto",           -- "auto" | "analytic" | "stateful"

  rate       = 2000,             -- particles/second, 0 for burst-only
  lifetime   = { 1.0, 2.5 },     -- min, max
  position   = { 0, 0 },
  spread     = math.pi / 6,
  direction  = -math.pi / 2,
  speed      = { 80, 220 },

  gravity    = { 0, 300 },
  damping    = 0.4,
  sizes      = { 8, 12, 0 },     -- interpolated over particle life
  colors     = { {1,0.8,0.3,1}, {1,0.2,0,0.6}, {0.2,0.2,0.2,0} },
  spin       = { -2, 2 },
  blendMode  = "add",
})

function love.update(dt) emitter:update(dt) end
function love.draw()     emitter:draw(x, y) end

emitter:emit(256)                -- burst
emitter:setPosition(x, y)
emitter:warm(1.5)                -- see §4.5
emitter:release()
```

The API deliberately mirrors `love.graphics.ParticleSystem` naming (`setSizes`, `setColors`,
`setSpread`, `setLinearAcceleration`) so it reads as a drop-in to anyone who knows LÖVE. Where a
concept has no native equivalent, name it plainly.

### 4.3 `mode = "auto"`

Inspect the configuration and pick:

- any of `collision`, `attractors`, `flowField`, or a user force marked `stateful` → **Mode B**
- otherwise → **Mode A**

The choice must be **derived, never asked for**. Expose `emitter:getMode()` for diagnostics and
tests. An effect that could be analytic and silently runs stateful is a bug.

### 4.4 Forces

Mode A's constraint is that motion is a closed-form function of `age`. Provide a small set of terms
that compose analytically, and refuse anything else at construction time with a clear message:

| Force | Closed form | Mode |
|---|---|---|
| constant acceleration | `½·a·t²` | A |
| linear damping | `v₀·(1 − e^(−k·t))/k` | A |
| radial / tangential accel about the emitter | closed form in polar | A |
| sinusoidal turbulence | `amp·sin(freq·t + seed·τ)` | A |
| curl noise of `(seed, t)` | evaluated per-vertex, stateless | A |
| flow field sampled at current position | — | **B** |
| collision | — | **B** |
| attractors | — | **B** |

`forces.lua` returns GLSL source fragments that are concatenated into the vertex shader, plus the
uniforms each needs. Shader variants must be **cached by the set of forces**, not rebuilt per frame.

### 4.5 Warmup

`emitter:warm(seconds)` must be O(1) in Mode A: warming is just offsetting `u_time` backwards, since
position is a function of age. In Mode B it is N simulation steps. Make the Mode A path exact and do
not fake it with a loop.

### 4.6 Degradation

If `getSupported().instancing` is false, or the required canvas format is missing, fall back to
LÖVE's built-in `love.graphics.ParticleSystem` behind the same API and set a flag readable via
`emitter:getBackend()`. Log **once**, not per frame. The library must never hard-fail on a machine
that can still run the game.

---

## 5. Parity with `love.graphics.ParticleSystem`

Match these, because users will expect them, and because a migration path matters:

`setColors` (≥8 stops — GPU has no 8-stop limit, so allow more), `setSizes`, `setSizeVariation`,
`setSpeed`, `setSpread`, `setDirection`, `setLinearAcceleration`, `setRadialAcceleration`,
`setTangentialAcceleration`, `setLinearDamping`, `setSpin`, `setSpinVariation`, `setRotation`,
`setRelativeRotation`, `setEmissionArea`, `setEmitterLifetime`, `setParticleLifetime`, `setOffset`,
`setQuads`, `setInsertMode`, `setBufferSize`, `emit`, `start`/`stop`/`pause`/`reset`,
`getCount`.

**Deliberately beyond the native system**, and worth stating as the reason this exists:

- particle counts in the hundreds of thousands (§6)
- more than 8 colour and size stops
- per-particle deterministic randomness from a seed, so an effect replays identically
- curl noise and turbulence without CPU cost
- collision and flow fields (Mode B)

**Deliberately not attempted:** per-particle sorted alpha blending. Sorting hundreds of thousands of
particles per frame is a different project. Use additive blending, or depth-independent ordering,
and document the limitation.

---

## 6. Performance envelope, measured

Mode A, one `drawInstanced` per emitter, 512×512 target, 3px particles, Apple M3 Max:

| Particles | Build (Lua, once) | Upload (once) | **Draw / frame** |
|---|---|---|---|
| 10,000 | 1 ms | 0.8 ms | **0.020 ms** |
| 50,000 | 5 ms | 3.7 ms | **0.055 ms** |
| 100,000 | 9 ms | 6.9 ms | **0.034 ms** |
| 250,000 | 24 ms | 17.8 ms | **0.056 ms** |

**Read these carefully.** Draw time is essentially flat from 10k to 250k, which means the test was
never GPU-bound — it was measuring draw submission. Two honest consequences:

1. **The real ceiling is fill rate, not particle count.** These were 3px particles on a 512×512
   target. Large soft particles at 1080p with heavy overdraw will be fill-bound long before they
   are vertex-bound. Benchmark the shape you actually ship.
2. **Buffer construction in Lua is the bottleneck**, at ~0.1 ms per 1,000 records. It happens once,
   but a 250,000-particle emitter costs ~24 ms to build — do it at load, never mid-frame, and
   consider filling the buffer with `love.data.newByteData` and a `ffi.cast` if LuaJIT's FFI is
   available (guard it: `pcall(require, "ffi")`).

For calibration, a CPU-side Lua timeline updating 50 emitters costs ~0.35 ms/frame and allocates
~1.4 MB/s. Mode A draws 250,000 particles for 0.056 ms and allocates nothing.

---

## 7. Traps — each of these was hit while verifying this spec

### 7.1 Blend mode silently corrupts state (the expensive one)

Rendering a simulation pass with the default blend mode multiplies your data by its own alpha
channel. With `u_gravity = (0, 200)`, `dt = 1/60`:

| Blend mode | `pos.y` | |
|---|---|---|
| expected | 0.055556 | |
| `"alpha"` (default) | **0.185185** | wrong by exactly `×3.3333` — which is `vel.y`, the `w` component |
| `"replace", "premultiplied"` | 0.055556 | correct |

There is no error and no warning; the simulation just drifts. **Always
`setBlendMode("replace", "premultiplied")` around a state pass**, and restore afterwards.

### 7.2 State textures must use nearest filtering

`setFilter("nearest", "nearest")` on every state canvas. Linear filtering blends adjacent particles'
state into each other.

### 7.3 Unbind the canvas before reading it

`Canvas:newImageData()` throws `cannot be called while that Canvas is currently active`. Call
`love.graphics.setCanvas()` first. This will bite in tests, which read back to assert.

### 7.4 Texel centres

Sample state at `(index + 0.5) / texSize`, not `index / texSize`.

### 7.5 Readback stalls the pipeline

`newImageData()` forces a full GPU sync. It is the right tool for tests and completely wrong for
per-frame logic. If the game needs particle positions on the CPU, the design is wrong — keep that
data CPU-side from the start.

### 7.6 `#pragma language glsl3` must be the first line

Before any comment or blank line, or it is ignored and the shader silently compiles as GLSL 1.

---

## 8. Build order

Each step must run and be demonstrable before the next begins.

1. **Capability probe** (§1) as `gpuparticles.getCapabilities()`, plus the fallback path (§4.6).
   *Done when* it reports correctly on the target machine and the fallback draws with the native
   system.
2. **Mode A, implicit emission only** — no bursts, constant acceleration, size and colour over life.
   *Done when* 100,000 particles draw in one call with zero per-frame allocation.
3. **Bursts** via the ring buffer (§3.2). *Done when* a 512-particle burst costs the measured
   ~0.12 ms and does not disturb living particles.
4. **Force composition** (§4.4) with shader-variant caching. *Done when* adding a force does not
   recompile per frame.
5. **Mode B** — ping-pong, vertex texture fetch, one force that requires it (a flow field).
   *Done when* the numeric check in §3.3 passes and `mode = "auto"` selects B for it.
6. **Parity pass** (§5), then an example project per force.

---

## 9. Verification

**Every claim in this spec was verified by running it. Hold the implementation to the same
standard.** Specifically:

- **Numeric tests, not visual ones.** Render to a float canvas, read back, assert exact values —
  §3.3 is the template. A screenshot comparison will not catch the §7.1 corruption; an equality
  assertion catches it instantly.
- **Verify a test by breaking the thing it tests.** Make the fix, watch the test pass, revert the
  fix, watch it fail, restore. A test that passes both ways is not testing what you think.
- **Assert the mode.** For each example effect, assert `emitter:getMode()` is the cheaper mode where
  it should be. Silent promotion to Mode B is the main way this design decays.
- **Benchmark the shape you ship**, at real resolution with real particle sizes (§6).

Ship a `bench/` LÖVE project printing the §6 table on the current machine, so a regression in draw
cost is visible rather than inferred.

---

## 10. If this is integrated with Feather

Optional; the library must stand alone regardless.

Feather's particle tool exports Lua that configures `love.graphics.ParticleSystem`. This library
would be a **second export target**, chosen when an effect asks for counts or forces the native
system cannot reach. The tool's existing authoring vocabulary already matches §5's naming, and its
timeline lanes are pure functions of time — so a lane becomes a uniform driven by `u_time`, or is
baked into a small LUT texture the vertex shader samples, and costs nothing per frame.

The rule to preserve: **an effect that does not need the GPU backend must not be given it.**
