--- The setter half of the particle timeline, plus the source the export embeds.
--
-- Semantics live in `core.lua` and only there. This module is the thin layer
-- that turns a resolved value into a call on a LÖVE ParticleSystem, and the
-- place the exporter reads its embeddable source from.
--
-- It used to *be* the semantics — 260 lines of easing maths and keyframe
-- evaluation inside a `[=[ ]=]` string, which meant luacheck never saw them and
-- two other hosts kept their own copies. See V4-PARTICLES.md §1.
--
-- @module particle-system-playground.timeline_runtime

local Core = require("plugins.particle-system-playground.core")

local M = {}

--- The text of `core.lua`, for the exporter to embed.
--
-- Read from the file rather than kept as a second copy, because a second copy
-- is exactly the failure this module is being cleaned up for. Nil when the file
-- cannot be read; the exporter must then refuse rather than emit a stale one.
function M.coreSource()
  if not (love and love.filesystem and love.filesystem.read) then
    return nil
  end
  local ok, contents = pcall(love.filesystem.read, "plugins/particle-system-playground/core.lua")
  if ok and type(contents) == "string" and #contents > 0 then
    return contents
  end
  return nil
end

local Runtime = {}

-- Re-exported so existing callers keep working while P1..P5 land. Every one of
-- these is `core.lua`'s function; none of them is a second implementation.
Runtime.safeNumber = Core.safeNumber
Runtime.parseNumberList = Core.parseNumberList
Runtime.normalizeTimelineEasing = Core.normalizeEasing
Runtime.normalizeTimelineMode = Core.normalizeMode
Runtime.timelineMode = Core.timelineMode
Runtime.normalizeDuration = Core.normalizeDuration
Runtime.easeTimelineValue = Core.ease
Runtime.evaluateKeyframes = Core.evaluate
Runtime.clipAllowsEmission = Core.clipAllowsEmission
Runtime.trackAllowsEmission = Core.trackAllowsEmission
Runtime.resolve = Core.resolve
Runtime.resolveSizes = Core.resolveSizes

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

local unpackList = table.unpack or unpack

--- Apply one track's resolved values to an emitter's particle system.
--
-- The decisions all happen in `Core.resolve`; this function only issues the
-- setters. P2 replaces the unconditional setter calls here with change
-- detection, and the reused buffers it needs are already in place.
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

  local resolved = Core.resolve(track, time, base, {
    mode = options.mode or Core.timelineMode(options.timeline),
    allowEmission = allowEmission == true,
    directionOffset = resolveOption(options.directionOffset, emitter),
  }, emitter._timelineResolved)
  emitter._timelineResolved = resolved

  callParticle(ps, "setEmissionRate", resolved.emissionRate)
  callParticle(ps, "setSpeed", resolved.speedMin, resolved.speedMax)

  emitter._timelineSizes = emitter._timelineSizes or {}
  local sizes, count = Core.resolveSizes(base, resolved.sizeScale, emitter._timelineSizes)
  if count > 0 then
    callParticle(ps, "setSizes", unpackList(sizes, 1, count))
  end

  callParticle(ps, "setDirection", resolved.direction)
  callParticle(ps, "setSpread", resolved.spread)
  callParticle(ps, "setOffset", resolved.offsetX, resolved.offsetY)

  emitter[options.opacityField or "opacity"] = resolved.opacity

  return resolved
end

M.runtime = Runtime

-- `source` used to be the authoritative copy of the semantics. It is now just
-- core.lua's text, resolved lazily so requiring this module never depends on a
-- filesystem being present (unit tests, headless tools).
setmetatable(M, {
  __index = function(_, key)
    if key == "source" then
      return M.coreSource()
    end
    return nil
  end,
})

return M
