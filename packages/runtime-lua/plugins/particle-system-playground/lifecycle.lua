--- Building, warming and pooling particle systems.
--
-- Two things live here, both of which existed somewhere before and nowhere
-- useful.
--
-- **Warming.** A looping or ambient effect starts empty and fills over its
-- particle lifetime, so its first seconds never look like the steady state the
-- author tuned against. LÖVE has no native prewarm; it is `ps:update(dt)` in
-- fixed steps before the first draw. The fields for it — `kickStartSteps` and
-- `kickStartDt` — were already authored, already in the project file and
-- already in the export, and honoured by nobody: the preview did not implement
-- them, the export wrote them and never read them, and the plugin applied them
-- only behind a manual button. See packages/runtime-lua/plugins/particle-system-playground/README.md, Particles §4.5.
--
-- **Pooling.** Reusing a finished effect instead of building a new one. It
-- existed only inside the exporter's generated strings, so the two hosts that
-- could show you its behaviour did not have it.
--
-- **No `love` reference.** Warming takes an updater function and pooling takes
-- a factory, so both unit-test without a graphics context.
--
-- @module particle-system-playground.lifecycle

local Core = require("plugins.particle-system-playground.core")

local Lifecycle = {}

Lifecycle.DEFAULT_DT = 1 / 60
Lifecycle.MAX_STEPS = 600           -- 10 seconds at 1/60; beyond this is a hang, not a warmup
Lifecycle.MAX_POOLED_INSTANCES = 32

--- How many steps this emitter should be advanced before its first draw.
--
-- An authored `kickStartSteps` always wins, including an authored zero — the
-- author turning warmup off is a decision, not an absence. Otherwise `ambient`
-- effects warm by default, because a steady state is the whole point of one,
-- and `loop`/`one-shot` do not, because their beginning is meant to be seen.
function Lifecycle.warmStepsFor(system, mode)
  local authored = system and system.kickStartSteps
  if authored ~= nil then
    local steps = math.floor(Core.safeNumber(authored, 0))
    return Core.clamp(math.max(0, steps), 0, Lifecycle.MAX_STEPS)
  end

  if Core.normalizeMode(mode) == "ambient" then
    local lifetime = math.max(
      Core.safeNumber(system and system.particleLifetimeMax, 0),
      Core.safeNumber(system and system.particleLifetimeMin, 0)
    )
    if lifetime <= 0 then
      lifetime = 1
    end
    local dt = Lifecycle.warmDtFor(system)
    return Core.clamp(math.ceil(lifetime / dt), 0, Lifecycle.MAX_STEPS)
  end

  return 0
end

function Lifecycle.warmDtFor(system)
  local dt = Core.safeNumber(system and system.kickStartDt, Lifecycle.DEFAULT_DT)
  if dt <= 0 then
    return Lifecycle.DEFAULT_DT
  end
  -- A huge dt does not warm, it teleports: particles jump past their own
  -- lifetime and the result is emptier than not warming at all.
  return math.min(dt, 1 / 10)
end

--- Advance an emitter to its steady state.
--
-- `update` is called `steps` times with `dt`. Returns the number of steps run,
-- which is what the tests assert on.
function Lifecycle.warm(update, system, mode)
  local steps = Lifecycle.warmStepsFor(system, mode)
  if steps <= 0 or type(update) ~= "function" then
    return 0
  end
  local dt = Lifecycle.warmDtFor(system)
  for _ = 1, steps do
    update(dt)
  end
  return steps
end

--- A pool of finished effect instances.
--
-- `factory` builds one when the pool is empty; `reset` prepares a reused one.
-- Bounded, because an unbounded pool is a leak with a friendly name.
function Lifecycle.newPool(limit)
  return {
    items = {},
    limit = math.max(0, math.floor(Core.safeNumber(limit, Lifecycle.MAX_POOLED_INSTANCES))),
    reused = 0,
    built = 0,
    dropped = 0,
  }
end

function Lifecycle.acquire(pool, factory)
  local count = #pool.items
  if count > 0 then
    local instance = pool.items[count]
    pool.items[count] = nil
    pool.reused = pool.reused + 1
    return instance, true
  end
  pool.built = pool.built + 1
  return factory(), false
end

--- Return an instance to the pool.
--
-- Returns true when it was kept. A full pool drops it, and the caller is then
-- responsible for releasing whatever it holds — saying so is the difference
-- between a pool and a leak.
function Lifecycle.release(pool, instance)
  if instance == nil then
    return false
  end
  if #pool.items >= pool.limit then
    pool.dropped = pool.dropped + 1
    return false
  end
  pool.items[#pool.items + 1] = instance
  return true
end

--- Copy every authored property from one particle system to another.
--
-- Atlas "variants" playback fans one emitter into up to sixteen systems that
-- differ only in which atlas frame they draw, and they have to be kept in step.
-- Only the two variadic getters allocate; the rest read and write in place.
--
-- Like the rest of this module it calls methods on the objects it is handed and
-- never touches the `love` global, so it is testable with stubs.
function Lifecycle.copyProperties(from, to, skipQuads)
  if not from or not to then
    return
  end

  -- Reads and writes in one go, without a closure or a result table per
  -- property. The previous version allocated both, twenty times per variant
  -- per sync; with sixteen atlas variants that was 320 closures and 320 tables
  -- for a frame in which usually nothing had changed.
  local function copy(methodGet, methodSet)
    local getter, setter = from[methodGet], to[methodSet]
    if type(getter) ~= "function" or type(setter) ~= "function" then
      return
    end
    setter(to, getter(from))
  end

  -- getLinearAcceleration returns four values (xmin, ymin, xmax, ymax). Copying
  -- only two silently collapses the max bounds onto the min, which turns a
  -- spread of accelerations into a single one — invisible until you compare a
  -- variant against its source.
  local function copyQuad(methodGet, methodSet)
    local getter, setter = from[methodGet], to[methodSet]
    if type(getter) ~= "function" or type(setter) ~= "function" then
      return
    end
    local a, b, c, d = getter(from)
    setter(to, a, b, c, d)
  end

  -- Properties whose getter returns exactly two values.
  local function copyPair(methodGet, methodSet)
    local getter, setter = from[methodGet], to[methodSet]
    if type(getter) ~= "function" or type(setter) ~= "function" then
      return
    end
    local a, b = getter(from)
    setter(to, a, b)
  end

  -- getColors and getSizes are variadic, so these two do allocate. They are
  -- the exception, not the rule.
  do
    local values = { from:getColors() }
    if #values > 0 then to:setColors(unpack(values)) end
  end
  copy("getDirection", "setDirection")
  copy("getEmissionRate", "setEmissionRate")
  copy("getEmitterLifetime", "setEmitterLifetime")
  copy("getInsertMode", "setInsertMode")
  copyQuad("getLinearAcceleration", "setLinearAcceleration")
  copyPair("getLinearDamping", "setLinearDamping")
  copyPair("getOffset", "setOffset")
  copyPair("getParticleLifetime", "setParticleLifetime")
  copy("getRadialAcceleration", "setRadialAcceleration")
  copy("getRotation", "setRotation")
  do
    local values = { from:getSizes() }
    if #values > 0 then to:setSizes(unpack(values)) end
  end
  copy("getSizeVariation", "setSizeVariation")
  copyPair("getSpeed", "setSpeed")
  copyPair("getSpin", "setSpin")
  copy("getSpinVariation", "setSpinVariation")
  copy("getSpread", "setSpread")
  copy("getTangentialAcceleration", "setTangentialAcceleration")

  to:setRelativeRotation(from:hasRelativeRotation())

  local dist, dx, dy, angle, relativeArea = from:getEmissionArea()
  to:setEmissionArea(dist, dx, dy, angle, relativeArea)

  if not skipQuads and from.getQuads and to.setQuads then
    local okQuads, quads = pcall(function()
      return { from:getQuads() }
    end)
    if okQuads and #quads > 0 then
      pcall(to.setQuads, to, unpack(quads))
    end
  end
end

return Lifecycle
