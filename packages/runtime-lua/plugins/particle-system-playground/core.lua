--- Particle timeline semantics: the single definition.
--
-- Everything about what a keyframe *means* lives here, and only here: which
-- easings exist, how a value is interpolated between keyframes, when a clip
-- allows emission, and what range each resolved value is allowed to occupy.
--
-- Three hosts consume it, and before this module existed each had its own copy:
-- the in-game plugin, the love.js preview Studio shows, and the exported Lua
-- someone ships. They had already drifted — the plugin and the export clamped
-- four values, the preview clamped none, so a `sizeScale` lane authored with
-- `inElastic` drove sizes to -37% in the preview and 0 everywhere else. See
-- V4-PARTICLES.md §1 and §4.3.
--
-- **This module must never touch LÖVE.** It takes tables and numbers and
-- returns tables and numbers. That is what lets it be unit-tested without a
-- graphics context, and it is the boundary that keeps "what a keyframe means"
-- separate from "which setter gets called" (V4-PARTICLES.md §5).
--
-- @module particle-system-playground.core

local Core = {}

Core.EASINGS = {
  linear = true,
  hold = true,
  inSine = true,
  outSine = true,
  inOutSine = true,
  inQuad = true,
  outQuad = true,
  inOutQuad = true,
  inCubic = true,
  outCubic = true,
  inOutCubic = true,
  inQuart = true,
  outQuart = true,
  inOutQuart = true,
  inExpo = true,
  outExpo = true,
  inOutExpo = true,
  inBack = true,
  outBack = true,
  inOutBack = true,
  inElastic = true,
  outElastic = true,
  inOutElastic = true,
  inBounce = true,
  outBounce = true,
  inOutBounce = true,
}

Core.LANES = {
  "opacity",
  "emissionRate",
  "speedScale",
  "sizeScale",
  "direction",
  "spread",
  "offsetX",
  "offsetY",
}

Core.MIN_DURATION = 0.25
Core.MAX_DURATION = 60

--- Coerce to a usable number, rejecting nan and infinities.
function Core.safeNumber(value, fallback)
  local n = tonumber(value)
  if n ~= nil and n == n and n ~= math.huge and n ~= -math.huge then
    return n
  end
  return fallback
end

function Core.clamp(value, minValue, maxValue)
  if value < minValue then return minValue end
  if value > maxValue then return maxValue end
  return value
end

function Core.parseNumberList(value)
  if type(value) == "table" then
    local out = {}
    for _, item in ipairs(value) do
      out[#out + 1] = Core.safeNumber(item, 0)
    end
    return out
  end

  local out = {}
  for part in tostring(value or ""):gmatch("[^,%s]+") do
    local n = tonumber(part)
    if n ~= nil then
      out[#out + 1] = n
    end
  end
  return out
end

function Core.normalizeEasing(easing)
  easing = tostring(easing or "linear")
  return Core.EASINGS[easing] and easing or "linear"
end

function Core.normalizeMode(mode, loop)
  mode = tostring(mode or "")
  if mode == "one-shot" or mode == "loop" or mode == "ambient" then
    return mode
  end
  return loop == true and "loop" or "one-shot"
end

--- The allowed range for a timeline's length.
--
-- The plugin clamped this to [0.25, 60] and the preview only to a 0.25 floor,
-- so a 90-second timeline looped at a different point in each. One definition.
function Core.normalizeDuration(duration, fallback)
  return Core.clamp(
    Core.safeNumber(duration, fallback or 3),
    Core.MIN_DURATION,
    Core.MAX_DURATION
  )
end

function Core.timelineMode(timeline)
  if type(timeline) ~= "table" then
    return "one-shot"
  end
  return Core.normalizeMode(timeline.mode, timeline.loop)
end

local function easeOutBounce(t)
  local n1 = 7.5625
  local d1 = 2.75
  if t < 1 / d1 then
    return n1 * t * t
  elseif t < 2 / d1 then
    t = t - 1.5 / d1
    return n1 * t * t + 0.75
  elseif t < 2.5 / d1 then
    t = t - 2.25 / d1
    return n1 * t * t + 0.9375
  end
  t = t - 2.625 / d1
  return n1 * t * t + 0.984375
end

--- Ease `t` in [0,1].
--
-- The `back` and `elastic` families deliberately leave [0,1] — that overshoot
-- is the effect. Callers must not assume the result is bounded; `Core.resolve`
-- is where the range of each *resolved value* is decided.
function Core.ease(easing, t)
  easing = Core.normalizeEasing(easing)
  t = Core.clamp(Core.safeNumber(t, 0), 0, 1)
  local c1 = 1.70158
  local c2 = c1 * 1.525
  local c3 = c1 + 1
  local c4 = (2 * math.pi) / 3
  local c5 = (2 * math.pi) / 4.5
  if easing == "hold" then return 0 end
  if easing == "inSine" then return 1 - math.cos((t * math.pi) / 2) end
  if easing == "outSine" then return math.sin((t * math.pi) / 2) end
  if easing == "inOutSine" then return -(math.cos(math.pi * t) - 1) / 2 end
  if easing == "inQuad" then return t * t end
  if easing == "outQuad" then return 1 - (1 - t) * (1 - t) end
  if easing == "inOutQuad" then return t < 0.5 and 2 * t * t or 1 - ((-2 * t + 2) ^ 2) / 2 end
  if easing == "inCubic" then return t * t * t end
  if easing == "outCubic" then return 1 - ((1 - t) ^ 3) end
  if easing == "inOutCubic" then return t < 0.5 and 4 * t * t * t or 1 - ((-2 * t + 2) ^ 3) / 2 end
  if easing == "inQuart" then return t * t * t * t end
  if easing == "outQuart" then return 1 - ((1 - t) ^ 4) end
  if easing == "inOutQuart" then return t < 0.5 and 8 * t * t * t * t or 1 - ((-2 * t + 2) ^ 4) / 2 end
  if easing == "inExpo" then return t == 0 and 0 or 2 ^ (10 * t - 10) end
  if easing == "outExpo" then return t == 1 and 1 or 1 - 2 ^ (-10 * t) end
  if easing == "inOutExpo" then
    if t == 0 or t == 1 then return t end
    return t < 0.5 and (2 ^ (20 * t - 10)) / 2 or (2 - 2 ^ (-20 * t + 10)) / 2
  end
  if easing == "inBack" then return c3 * t * t * t - c1 * t * t end
  if easing == "outBack" then return 1 + c3 * ((t - 1) ^ 3) + c1 * ((t - 1) ^ 2) end
  if easing == "inOutBack" then
    return t < 0.5
      and (((2 * t) ^ 2) * ((c2 + 1) * 2 * t - c2)) / 2
      or (((2 * t - 2) ^ 2) * ((c2 + 1) * (2 * t - 2) + c2) + 2) / 2
  end
  if easing == "inElastic" then
    if t == 0 or t == 1 then return t end
    return -(2 ^ (10 * t - 10)) * math.sin((t * 10 - 10.75) * c4)
  end
  if easing == "outElastic" then
    if t == 0 or t == 1 then return t end
    return (2 ^ (-10 * t)) * math.sin((t * 10 - 0.75) * c4) + 1
  end
  if easing == "inOutElastic" then
    if t == 0 or t == 1 then return t end
    return t < 0.5
      and -((2 ^ (20 * t - 10)) * math.sin((20 * t - 11.125) * c5)) / 2
      or ((2 ^ (-20 * t + 10)) * math.sin((20 * t - 11.125) * c5)) / 2 + 1
  end
  if easing == "inBounce" then return 1 - easeOutBounce(1 - t) end
  if easing == "outBounce" then return easeOutBounce(t) end
  if easing == "inOutBounce" then
    return t < 0.5 and (1 - easeOutBounce(1 - 2 * t)) / 2 or (1 + easeOutBounce(2 * t - 1)) / 2
  end
  return t
end

--- The exact value of a lane at `time`.
function Core.evaluate(points, time, fallback)
  if type(points) ~= "table" or #points == 0 then
    return fallback
  end
  if time <= Core.safeNumber(points[1].time, 0) then
    return Core.safeNumber(points[1].value, fallback)
  end
  for i = 1, #points - 1 do
    local a = points[i]
    local b = points[i + 1]
    local at = Core.safeNumber(a.time, 0)
    local bt = Core.safeNumber(b.time, at)
    if time >= at and time <= bt then
      local span = math.max(0.0001, bt - at)
      local t = Core.clamp((time - at) / span, 0, 1)
      local eased = Core.ease(a.easing, t)
      local av = Core.safeNumber(a.value, fallback)
      local bv = Core.safeNumber(b.value, fallback)
      return av + (bv - av) * eased
    end
  end
  return Core.safeNumber(points[#points].value, fallback)
end

function Core.clipAllowsEmission(clip, time, emitterLifetime, mode)
  local startTime = Core.safeNumber(clip and clip.start, 0)
  local endTime = Core.safeNumber(clip and clip["end"], 0)
  if time < startTime then
    return false
  end
  local lifetime = Core.safeNumber(emitterLifetime, -1)
  if Core.normalizeMode(mode) == "ambient" and lifetime < 0 then
    return true
  end
  if time > endTime then
    return false
  end
  if lifetime < 0 then
    return true
  end
  return time <= startTime + lifetime
end

function Core.trackAllowsEmission(track, time, emitterLifetime, mode)
  for _, clip in ipairs(track and track.clips or {}) do
    if Core.clipAllowsEmission(clip, time, emitterLifetime, mode) then
      return true
    end
  end
  return false
end

--- Resolve every lane of one track at `time`.
--
-- Returns the values a host should apply — already clamped. **The clamps are
-- the point of this function.** The overshoot easings are supposed to leave
-- [0,1] (`inElastic` reaches -0.3731 for a 0 -> 1 lane), which is fine for the
-- *curve* and meaningless for the *value*: a negative emission rate, a negative
-- size or an opacity above 1 are not things to render, they are things to
-- clamp. Doing it here means every host clamps identically by construction.
--
-- `out` is optional and is filled in place when given, so a caller on the
-- per-frame path can avoid allocating (V4-PARTICLES.md §4.2 — the current code
-- allocates ~1.4 MB/s at 50 emitters).
function Core.resolve(track, time, base, options, out)
  base = type(base) == "table" and base or {}
  options = options or {}
  out = out or {}

  local lanes = (track and track.lanes) or {}

  out.active = Core.trackAllowsEmission(
    track,
    time,
    Core.safeNumber(base.emitterLifetime, -1),
    options.mode or "one-shot"
  )

  out.emissionRate = math.max(0, Core.evaluate(lanes.emissionRate, time, Core.safeNumber(base.emissionRate, 0)))
  if not out.active or options.allowEmission == false then
    out.emissionRate = 0
  end

  out.speedScale = math.max(0, Core.evaluate(lanes.speedScale, time, 1))
  out.speedMin = Core.safeNumber(base.speedMin, 0) * out.speedScale
  out.speedMax = Core.safeNumber(base.speedMax, 0) * out.speedScale

  out.sizeScale = math.max(0, Core.evaluate(lanes.sizeScale, time, 1))

  out.direction = Core.evaluate(lanes.direction, time, Core.safeNumber(base.direction, 0))
    + Core.safeNumber(options.directionOffset, 0)
  out.spread = Core.evaluate(lanes.spread, time, Core.safeNumber(base.spread, 0))
  out.offsetX = Core.evaluate(lanes.offsetX, time, Core.safeNumber(base.offsetX, 0))
  out.offsetY = Core.evaluate(lanes.offsetY, time, Core.safeNumber(base.offsetY, 0))

  out.opacity = Core.clamp(Core.evaluate(lanes.opacity, time, 1), 0, 1)

  return out
end

--- The sizes for this frame: base sizes scaled, written into `out`.
--
-- Separate from `resolve` because it is the one resolved value that is a list,
-- and because reusing `out` is how the per-frame path stops allocating a table
-- per emitter per frame.
function Core.resolveSizes(base, sizeScale, out)
  local sizes = Core.parseNumberList(base and base.sizes)
  out = out or {}
  for i = 1, #sizes do
    out[i] = math.max(0, sizes[i] * sizeScale)
  end
  for i = #sizes + 1, #out do
    out[i] = nil
  end
  return out, #sizes
end

return Core
