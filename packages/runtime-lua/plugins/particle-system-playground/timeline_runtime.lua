local M = {}

M.source = [=[
local Runtime = {}

local VALID_EASINGS = {
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

function Runtime.safeNumber(value, fallback)
  local n = tonumber(value)
  if n ~= nil and n == n and n ~= math.huge and n ~= -math.huge then
    return n
  end
  return fallback
end

local function clamp(value, minValue, maxValue)
  if value < minValue then return minValue end
  if value > maxValue then return maxValue end
  return value
end

function Runtime.parseNumberList(value)
  if type(value) == "table" then
    local out = {}
    for _, item in ipairs(value) do
      out[#out + 1] = Runtime.safeNumber(item, 0)
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

function Runtime.normalizeTimelineEasing(easing)
  easing = tostring(easing or "linear")
  return VALID_EASINGS[easing] and easing or "linear"
end

function Runtime.normalizeTimelineMode(mode, loop)
  mode = tostring(mode or "")
  if mode == "one-shot" or mode == "loop" or mode == "ambient" then
    return mode
  end
  return loop == true and "loop" or "one-shot"
end

function Runtime.timelineMode(timeline)
  if type(timeline) ~= "table" then
    return "one-shot"
  end
  return Runtime.normalizeTimelineMode(timeline.mode, timeline.loop)
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

function Runtime.easeTimelineValue(easing, t)
  easing = Runtime.normalizeTimelineEasing(easing)
  t = clamp(Runtime.safeNumber(t, 0), 0, 1)
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

function Runtime.evaluateKeyframes(points, time, fallback)
  if type(points) ~= "table" or #points == 0 then
    return fallback
  end
  if time <= Runtime.safeNumber(points[1].time, 0) then
    return Runtime.safeNumber(points[1].value, fallback)
  end
  for i = 1, #points - 1 do
    local a = points[i]
    local b = points[i + 1]
    local at = Runtime.safeNumber(a.time, 0)
    local bt = Runtime.safeNumber(b.time, at)
    if time >= at and time <= bt then
      local span = math.max(0.0001, bt - at)
      local t = clamp((time - at) / span, 0, 1)
      local eased = Runtime.easeTimelineValue(a.easing, t)
      local av = Runtime.safeNumber(a.value, fallback)
      local bv = Runtime.safeNumber(b.value, fallback)
      return av + (bv - av) * eased
    end
  end
  return Runtime.safeNumber(points[#points].value, fallback)
end

function Runtime.clipAllowsEmission(clip, time, emitterLifetime, mode)
  local startTime = Runtime.safeNumber(clip and clip.start, 0)
  local endTime = Runtime.safeNumber(clip and clip["end"], 0)
  if time < startTime then
    return false
  end
  local lifetime = Runtime.safeNumber(emitterLifetime, -1)
  if Runtime.normalizeTimelineMode(mode) == "ambient" and lifetime < 0 then
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

function Runtime.trackAllowsEmission(track, time, emitterLifetime, mode)
  for _, clip in ipairs(track and track.clips or {}) do
    if Runtime.clipAllowsEmission(clip, time, emitterLifetime, mode) then
      return true
    end
  end
  return false
end

local function callParticle(ps, method, ...)
  local fn = ps and ps[method]
  if type(fn) ~= "function" then
    return false
  end
  return pcall(fn, ps, ...)
end

local function resolveOption(option, emitter)
  if type(option) == "function" then
    return option(emitter)
  end
  return option
end

function Runtime.applyTimelineToEmitter(emitter, track, time, allowEmission, options)
  options = options or {}
  if type(emitter) ~= "table" then
    return nil
  end
  local ps = resolveOption(options.system, emitter) or emitter.system or emitter.ps
  if not ps then
    return nil
  end
  local base = resolveOption(options.base, emitter)
  if type(base) ~= "table" then
    base = emitter.base or emitter._timelineBase or {}
  end
  local lanes = track and track.lanes or {}
  local active = Runtime.trackAllowsEmission(
    track,
    time,
    Runtime.safeNumber(base.emitterLifetime, -1),
    options.mode or Runtime.timelineMode(options.timeline)
  )

  local emissionRate = math.max(0, Runtime.evaluateKeyframes(lanes.emissionRate, time, Runtime.safeNumber(base.emissionRate, 0)))
  if not active or allowEmission ~= true then
    emissionRate = 0
  end
  callParticle(ps, "setEmissionRate", emissionRate)

  local speedScale = math.max(0, Runtime.evaluateKeyframes(lanes.speedScale, time, 1))
  callParticle(
    ps,
    "setSpeed",
    Runtime.safeNumber(base.speedMin, 0) * speedScale,
    Runtime.safeNumber(base.speedMax, 0) * speedScale
  )

  local sizeScale = math.max(0, Runtime.evaluateKeyframes(lanes.sizeScale, time, 1))
  local sizes = Runtime.parseNumberList(base.sizes)
  if #sizes > 0 then
    for i, value in ipairs(sizes) do
      sizes[i] = math.max(0, value * sizeScale)
    end
    callParticle(ps, "setSizes", unpack(sizes))
  end

  local directionOffset = Runtime.safeNumber(resolveOption(options.directionOffset, emitter), 0)
  callParticle(ps, "setDirection", Runtime.evaluateKeyframes(lanes.direction, time, Runtime.safeNumber(base.direction, 0)) + directionOffset)
  callParticle(ps, "setSpread", Runtime.evaluateKeyframes(lanes.spread, time, Runtime.safeNumber(base.spread, 0)))
  callParticle(
    ps,
    "setOffset",
    Runtime.evaluateKeyframes(lanes.offsetX, time, Runtime.safeNumber(base.offsetX, 0)),
    Runtime.evaluateKeyframes(lanes.offsetY, time, Runtime.safeNumber(base.offsetY, 0))
  )

  local opacity = clamp(Runtime.evaluateKeyframes(lanes.opacity, time, 1), 0, 1)
  emitter[options.opacityField or "opacity"] = opacity

  return {
    active = active,
    emissionRate = emissionRate,
    speedScale = speedScale,
    sizeScale = sizeScale,
    opacity = opacity,
  }
end

return Runtime
]=]

local chunk, err = load(M.source, "particle-system-playground.timeline_runtime")
if not chunk then
  error(err)
end

M.runtime = chunk()

return M
