--- The only code that calls a setter on a particle system.
--
-- `core.lua` decides what the values are; this decides which of them are worth
-- sending. If nothing moved since last frame, nothing is sent — which is the
-- whole of packages/runtime-lua/plugins/particle-system-playground/README.md, Particles **P2**: Lua's job per frame is to notice what
-- changed, and if nothing did, its job that frame is nothing.
--
-- Measured before this existed: a six-emitter composite issued 3,600 setter
-- calls and allocated 1,660 KB over 600 frames *whether or not any lane was
-- keyframed*. The garbage and the calls were unconditional.
--
-- **No `love` reference and no `require` beyond core.** It calls methods on the
-- object it is handed, so a counting stub substitutes for a ParticleSystem and
-- the whole thing unit-tests without a graphics context.
--
-- @module particle-system-playground.apply

local Core = require("plugins.particle-system-playground.core")

local Apply = {}

-- Below this, a change is not observable in the render and is not worth a call.
-- Emission rate and sizes are in particles and pixels; angles are radians.
local EPSILON = 1e-4

local unpackList = table.unpack or unpack

--- Per-emitter state: what was last sent, and the buffers reused to avoid
--- allocating on the per-frame path.
function Apply.newState()
  return {
    sent = {},
    sizes = {},
    resolved = {},
    calls = 0,   -- cumulative setter calls, for tests and diagnostics
    frames = 0,
  }
end

local function changed(sent, key, value)
  local previous = sent[key]
  if previous ~= nil and math.abs(previous - value) <= EPSILON then
    return false
  end
  sent[key] = value
  return true
end

--- Send only what moved.
--
-- `ps` is anything with the ParticleSystem setter methods. Returns the number
-- of setter calls issued this frame, which is what the tests assert on.
function Apply.toParticleSystem(state, ps, resolved, base)
  local sent = state.sent
  local calls = 0

  state.frames = state.frames + 1

  if changed(sent, "emissionRate", resolved.emissionRate) then
    ps:setEmissionRate(resolved.emissionRate)
    calls = calls + 1
  end

  if changed(sent, "speedMin", resolved.speedMin) or changed(sent, "speedMax", resolved.speedMax) then
    -- Both are one call, so keep the pair in step: writing only one of the two
    -- keys above would leave the other stale on the next comparison.
    sent.speedMin, sent.speedMax = resolved.speedMin, resolved.speedMax
    ps:setSpeed(resolved.speedMin, resolved.speedMax)
    calls = calls + 1
  end

  if changed(sent, "sizeScale", resolved.sizeScale) then
    local sizes, count = Core.resolveSizes(base, resolved.sizeScale, state.sizes)
    if count > 0 then
      ps:setSizes(unpackList(sizes, 1, count))
      calls = calls + 1
    end
  end

  if changed(sent, "direction", resolved.direction) then
    ps:setDirection(resolved.direction)
    calls = calls + 1
  end

  if changed(sent, "spread", resolved.spread) then
    ps:setSpread(resolved.spread)
    calls = calls + 1
  end

  if changed(sent, "offsetX", resolved.offsetX) or changed(sent, "offsetY", resolved.offsetY) then
    sent.offsetX, sent.offsetY = resolved.offsetX, resolved.offsetY
    ps:setOffset(resolved.offsetX, resolved.offsetY)
    calls = calls + 1
  end

  state.calls = state.calls + calls
  return calls
end

--- Resolve a compiled track and apply it, in one call.
--
-- The common per-frame path. `state.resolved` is reused, so a frame that
-- changes nothing allocates nothing.
function Apply.tick(state, ps, compiled, time, base, options)
  state.resolved = Core.resolveCompiled(compiled, time, base, options, state.resolved)
  local calls = Apply.toParticleSystem(state, ps, state.resolved, base)
  return state.resolved, calls
end

--- Forget what was sent, so the next tick writes everything again.
--
-- Needed whenever the system underneath is replaced or reset: the values are
-- still on record here but no longer on the object.
function Apply.invalidate(state)
  for key in pairs(state.sent) do
    state.sent[key] = nil
  end
end

return Apply
