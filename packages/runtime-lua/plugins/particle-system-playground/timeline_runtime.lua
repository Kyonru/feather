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
local Apply = require("plugins.particle-system-playground.apply")

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

--- The text of `apply.lua`, for the exporter to embed alongside core.
function M.applySource()
  if not (love and love.filesystem and love.filesystem.read) then
    return nil
  end
  local ok, contents = pcall(love.filesystem.read, "plugins/particle-system-playground/apply.lua")
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
Runtime.compileTrack = Core.compileTrack
Runtime.trackIsStatic = Core.trackIsStatic

local function resolveOption(option, emitter)
  if type(option) == "function" then
    return option(emitter)
  end
  return option
end

--- Forget what was last sent to this emitter's particle system.
--
-- Whenever the system underneath is replaced, reset, or has its properties
-- written directly, the change detector's record of what it sent is no longer
-- true of the object. Not calling this leaves values silently unapplied.
function Runtime.invalidateEmitter(emitter)
  if type(emitter) == "table" and emitter._timelineApply then
    Apply.invalidate(emitter._timelineApply)
  end
end

--- Apply one track to an emitter, sending only what changed.
--
-- The track is compiled once and cached against its own identity: the plugin
-- hands the same table every frame and replaces it on edit, so a reference
-- check is exactly the right invalidation signal, and the expensive part
-- (baking every varying lane) happens on edit rather than per frame.
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

  local timeline = options.timeline
  local duration = Core.normalizeDuration(timeline and timeline.duration, 3)
  if emitter._timelineTrack ~= track or emitter._timelineDuration ~= duration then
    emitter._timelineCompiled = Core.compileTrack(track, duration)
    emitter._timelineTrack = track
    emitter._timelineDuration = duration
    Runtime.invalidateEmitter(emitter)
  end

  emitter._timelineApply = emitter._timelineApply or Apply.newState()

  emitter._timelineOptions = emitter._timelineOptions or {}
  local tickOptions = emitter._timelineOptions
  tickOptions.mode = options.mode or Core.timelineMode(timeline)
  tickOptions.allowEmission = allowEmission == true
  tickOptions.directionOffset = resolveOption(options.directionOffset, emitter)

  local resolved, calls = Apply.tick(
    emitter._timelineApply,
    ps,
    emitter._timelineCompiled,
    time,
    base,
    tickOptions
  )

  emitter[options.opacityField or "opacity"] = resolved.opacity

  -- The call count is not a diagnostic here. Callers with derived systems to
  -- keep in step (atlas variants) use it to skip that work entirely when
  -- nothing moved, which is the difference between 320 property copies per
  -- frame and none.
  return resolved, calls
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
