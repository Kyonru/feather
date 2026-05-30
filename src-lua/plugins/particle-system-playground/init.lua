local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")
local base64 = require(FEATHER_PATH .. ".lib.base64")
local json = require(FEATHER_PATH .. ".lib.json")
local TimelineRuntimeBundle = require("plugins.particle-system-playground.timeline_runtime")

local ParticleSystemPlaygroundPlugin = Class({ __includes = Base })
local TimelineRuntime = TimelineRuntimeBundle.runtime
local TIMELINE_RUNTIME_SOURCE = TimelineRuntimeBundle.source

local DEFAULT_BUFFER_SIZE = 1000
local DEFAULT_X = 400
local DEFAULT_Y = 300
local TWO_PI = math.pi * 2
local PROJECT_TYPE = "feather.particle-system-playground"
local PROJECT_VERSION = 2
local DEFAULT_TIMELINE_DURATION = 3
local TIMELINE_LANES = {
  "opacity",
  "emissionRate",
  "speedScale",
  "sizeScale",
  "direction",
  "spread",
  "offsetX",
  "offsetY",
}

local B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local B64_LOOKUP = {}
for i = 1, #B64_CHARS do
  B64_LOOKUP[B64_CHARS:sub(i, i)] = i - 1
end

local function decodeBase64(data)
  data = tostring(data or ""):gsub("%s+", "")
  local out = {}
  local index = 1

  for i = 1, #data, 4 do
    local c1 = data:sub(i, i)
    local c2 = data:sub(i + 1, i + 1)
    local c3 = data:sub(i + 2, i + 2)
    local c4 = data:sub(i + 3, i + 3)
    local n1 = B64_LOOKUP[c1]
    local n2 = B64_LOOKUP[c2]
    local n3 = c3 ~= "=" and B64_LOOKUP[c3] or nil
    local n4 = c4 ~= "=" and B64_LOOKUP[c4] or nil

    if not n1 or not n2 then
      return nil
    end

    out[index] = string.char(n1 * 4 + math.floor(n2 / 16))
    index = index + 1
    if n3 then
      out[index] = string.char((n2 % 16) * 16 + math.floor(n3 / 4))
      index = index + 1
    end
    if n3 and n4 then
      out[index] = string.char((n3 % 4) * 64 + n4)
      index = index + 1
    end
  end

  return table.concat(out)
end

local function safeNumber(value, fallback)
  local n = tonumber(value)
  if n == nil then
    return fallback
  end
  return n
end

local function safeString(value, fallback)
  if value == nil then
    return fallback or ""
  end
  return tostring(value)
end

local function safeBoolean(value, fallback)
  if value == nil then
    return fallback == true
  end
  if value == true or value == "true" or value == "1" or value == 1 then
    return true
  end
  if value == false or value == "false" or value == "0" or value == 0 then
    return false
  end
  return fallback == true
end

local VALID_TIMELINE_EASINGS = {
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

local function normalizeTimelineEasing(value)
  value = tostring(value or "linear")
  return VALID_TIMELINE_EASINGS[value] and value or "linear"
end

local function isSystemEnabled(sys, meta)
  if meta and meta.enabled ~= nil then
    return safeBoolean(meta.enabled, true)
  end
  return safeBoolean(sys and sys.enabled, true)
end

local function compositePreviewEnabled(entry)
  if entry and entry.kind == "scratch" then
    return safeBoolean(entry.previewEnabled, true)
  end
  return true
end

local function scratchPreviewRuntimeActive(plugin, name, entry)
  if not plugin or not entry or entry.kind ~= "scratch" then
    return false
  end
  if not plugin.previewSessionActive then
    return false
  end
  local target = plugin.previewComposite
  if target and target ~= "" and target ~= name then
    return false
  end
  return compositePreviewEnabled(entry)
end

local function hasPlayingTimeline(plugin)
  for _, entry in pairs(plugin.composites or {}) do
    if entry.timelineState and safeBoolean(entry.timelineState.playing, false) then
      return true
    end
  end
  return false
end

local function pauseScratchTimeline(entry)
  if entry and entry.kind == "scratch" and entry.timelineState then
    entry.timelineState.playing = false
  end
end

local function pauseOtherScratchTimelines(plugin, keepName)
  for name, entry in pairs(plugin.composites or {}) do
    if name ~= keepName then
      pauseScratchTimeline(entry)
    end
  end
end

local function sanitizeFilename(name, fallback)
  name = tostring(name or fallback or "asset"):gsub("\\", "/"):match("([^/]+)$") or fallback or "asset"
  name = name:gsub("[^%w%._%-]", "_")
  if name == "" then
    name = fallback or "asset"
  end
  return name
end

local function archivePath(path, fallback)
  path = tostring(path or ""):gsub("\\", "/")
  path = path:gsub("^%a:/+", ""):gsub("^/+", "")
  local parts = {}
  for part in path:gmatch("[^/]+") do
    if part ~= "." and part ~= ".." and part ~= "" then
      parts[#parts + 1] = part:gsub("[^%w%._%-]", "_")
    end
  end
  if #parts == 0 then
    return sanitizeFilename(fallback, "asset")
  end
  return table.concat(parts, "/")
end

local function projectFilename(name)
  return sanitizeFilename(name or "particle-project", "particle-project") .. ".featherparticles"
end

local function quote(value)
  return string.format("%q", tostring(value or ""))
end

local function longQuote(value)
  local source = tostring(value or "")
  local level = 0
  while source:find("]" .. string.rep("=", level) .. "]", 1, true) do
    level = level + 1
  end
  local marker = string.rep("=", level)
  return "[" .. marker .. "[\n" .. source .. "\n]" .. marker .. "]"
end

local function fmt(n)
  n = tonumber(n) or 0
  if n == 0 then
    return "0"
  end
  local s = string.format("%.6f", n)
  s = s:gsub("(%..-)0+$", "%1"):gsub("%.$", "")
  return s
end

local function roundSnapshotNumber(value)
  if type(value) ~= "number" then
    return value
  end
  return tonumber(fmt(value)) or 0
end

local function getImageDataPng(imageData)
  if not imageData or not imageData.encode then
    return nil
  end
  local ok, fileData = pcall(imageData.encode, imageData, "png")
  if ok and fileData and fileData.getString then
    return fileData:getString()
  end
  return nil
end

local function generatePresetImage(name)
  if not love or not love.image or not love.graphics then
    return nil
  end

  local size = 64
  local data = love.image.newImageData(size, size)
  local cx = (size - 1) / 2
  local cy = (size - 1) / 2
  local radius = size / 2 - 1

  local function setPixel(x, y, alpha)
    if x >= 0 and x < size and y >= 0 and y < size then
      data:setPixel(x, y, 1, 1, 1, math.max(0, math.min(1, alpha)))
    end
  end

  data:mapPixel(function(x, y)
    local dx = x - cx
    local dy = y - cy
    local dist = math.sqrt(dx * dx + dy * dy)
    local angle = math.atan2 and math.atan2(dy, dx) or math.atan(dy, dx)
    local alpha

    if name == "ring" then
      alpha = dist > radius * 0.62 and dist < radius * 0.9 and 1 or 0
    elseif name == "light" then
      local t = math.min(1, dist / radius)
      alpha = (1 - t) * (1 - t)
    elseif name == "star" then
      local points = 5
      local wave = (math.cos(angle * points) + 1) / 2
      local edge = radius * (0.48 + wave * 0.42)
      alpha = dist <= edge and 1 or 0
    elseif name == "spiral" then
      local t = dist / radius
      local target = t * TWO_PI * 2.6
      local delta = math.abs(((angle - target + math.pi) % TWO_PI) - math.pi)
      alpha = delta < 0.2 and t < 0.96 and 1 or 0
    else
      local t = dist / radius
      alpha = t <= 1 and 1 or 0
    end

    return 1, 1, 1, alpha
  end)

  if name == "spiral" then
    for i = 0, 80 do
      local t = i / 80
      local angle = t * TWO_PI * 2.6
      local r = t * radius
      setPixel(math.floor(cx + math.cos(angle) * r), math.floor(cy + math.sin(angle) * r), 1)
    end
  end

  return love.graphics.newImage(data), getImageDataPng(data)
end

local function readFileBase64(path)
  if not path or path == "" or not love or not love.filesystem then
    return nil
  end
  local ok, data = pcall(love.filesystem.read, path)
  if ok and data then
    return base64.encode(data)
  end
  return nil
end

local function copyParticleProperties(from, to)
  if not from or not to then
    return
  end

  local function copy(methodGet, methodSet)
    local ok, values = pcall(function()
      return { from[methodGet](from) }
    end)
    if ok then
      pcall(to[methodSet], to, unpack(values))
    end
  end

  copy("getColors", "setColors")
  copy("getDirection", "setDirection")
  copy("getEmissionRate", "setEmissionRate")
  copy("getEmitterLifetime", "setEmitterLifetime")
  copy("getInsertMode", "setInsertMode")
  copy("getLinearAcceleration", "setLinearAcceleration")
  copy("getLinearDamping", "setLinearDamping")
  copy("getOffset", "setOffset")
  copy("getParticleLifetime", "setParticleLifetime")
  copy("getRadialAcceleration", "setRadialAcceleration")
  copy("getRotation", "setRotation")
  copy("getSizes", "setSizes")
  copy("getSizeVariation", "setSizeVariation")
  copy("getSpeed", "setSpeed")
  copy("getSpin", "setSpin")
  copy("getSpinVariation", "setSpinVariation")
  copy("getSpread", "setSpread")
  copy("getTangentialAcceleration", "setTangentialAcceleration")

  local okRelative, relative = pcall(from.hasRelativeRotation, from)
  if okRelative then
    pcall(to.setRelativeRotation, to, relative)
  end

  local okArea, dist, dx, dy, angle, relativeArea = pcall(from.getEmissionArea, from)
  if okArea then
    pcall(to.setEmissionArea, to, dist, dx, dy, angle, relativeArea)
  end

  if from.getQuads and to.setQuads then
    local okQuads, quads = pcall(function()
      return { from:getQuads() }
    end)
    if okQuads and #quads > 0 then
      pcall(to.setQuads, to, unpack(quads))
    end
  end
end

local PS_PROPERTIES = {
  {
    key = "emissionRate",
    get = function(ps)
      return ps:getEmissionRate()
    end,
    set = function(ps, v)
      ps:setEmissionRate(v)
    end,
    type = "number",
    min = 0,
    max = 10000,
  },
  {
    key = "emitterLifetime",
    get = function(ps)
      return ps:getEmitterLifetime()
    end,
    set = function(ps, v)
      ps:setEmitterLifetime(v)
    end,
    type = "number",
    min = -1,
    max = 600,
  },
  {
    key = "particleLifetimeMin",
    get = function(ps)
      local a = ps:getParticleLifetime()
      return a
    end,
    set = function(ps, v)
      local _, b = ps:getParticleLifetime()
      ps:setParticleLifetime(v, b)
    end,
    type = "number",
    min = 0,
  },
  {
    key = "particleLifetimeMax",
    get = function(ps)
      local _, b = ps:getParticleLifetime()
      return b
    end,
    set = function(ps, v)
      local a = ps:getParticleLifetime()
      ps:setParticleLifetime(a, v)
    end,
    type = "number",
    min = 0,
  },
  {
    key = "direction",
    get = function(ps)
      return ps:getDirection()
    end,
    set = function(ps, v)
      ps:setDirection(v)
    end,
    type = "number",
  },
  {
    key = "spread",
    get = function(ps)
      return ps:getSpread()
    end,
    set = function(ps, v)
      ps:setSpread(v)
    end,
    type = "number",
    min = 0,
  },
  {
    key = "speedMin",
    get = function(ps)
      local a = ps:getSpeed()
      return a
    end,
    set = function(ps, v)
      local _, b = ps:getSpeed()
      ps:setSpeed(v, b)
    end,
    type = "number",
  },
  {
    key = "speedMax",
    get = function(ps)
      local _, b = ps:getSpeed()
      return b
    end,
    set = function(ps, v)
      local a = ps:getSpeed()
      ps:setSpeed(a, v)
    end,
    type = "number",
  },
  {
    key = "linearAccelXMin",
    get = function(ps)
      local a = ps:getLinearAcceleration()
      return a
    end,
    set = function(ps, v)
      local _, b, c, d = ps:getLinearAcceleration()
      ps:setLinearAcceleration(v, b, c, d)
    end,
    type = "number",
  },
  {
    key = "linearAccelYMin",
    get = function(ps)
      local _, b = ps:getLinearAcceleration()
      return b
    end,
    set = function(ps, v)
      local a, _, c, d = ps:getLinearAcceleration()
      ps:setLinearAcceleration(a, v, c, d)
    end,
    type = "number",
  },
  {
    key = "linearAccelXMax",
    get = function(ps)
      local _, _, c = ps:getLinearAcceleration()
      return c
    end,
    set = function(ps, v)
      local a, b, _, d = ps:getLinearAcceleration()
      ps:setLinearAcceleration(a, b, v, d)
    end,
    type = "number",
  },
  {
    key = "linearAccelYMax",
    get = function(ps)
      local _, _, _, d = ps:getLinearAcceleration()
      return d
    end,
    set = function(ps, v)
      local a, b, c = ps:getLinearAcceleration()
      ps:setLinearAcceleration(a, b, c, v)
    end,
    type = "number",
  },
  {
    key = "radialAccelMin",
    get = function(ps)
      local a = ps:getRadialAcceleration()
      return a
    end,
    set = function(ps, v)
      local _, b = ps:getRadialAcceleration()
      ps:setRadialAcceleration(v, b)
    end,
    type = "number",
  },
  {
    key = "radialAccelMax",
    get = function(ps)
      local _, b = ps:getRadialAcceleration()
      return b
    end,
    set = function(ps, v)
      local a = ps:getRadialAcceleration()
      ps:setRadialAcceleration(a, v)
    end,
    type = "number",
  },
  {
    key = "tangentialAccelMin",
    get = function(ps)
      local a = ps:getTangentialAcceleration()
      return a
    end,
    set = function(ps, v)
      local _, b = ps:getTangentialAcceleration()
      ps:setTangentialAcceleration(v, b)
    end,
    type = "number",
  },
  {
    key = "tangentialAccelMax",
    get = function(ps)
      local _, b = ps:getTangentialAcceleration()
      return b
    end,
    set = function(ps, v)
      local a = ps:getTangentialAcceleration()
      ps:setTangentialAcceleration(a, v)
    end,
    type = "number",
  },
  {
    key = "linearDampingMin",
    get = function(ps)
      local a = ps:getLinearDamping()
      return a
    end,
    set = function(ps, v)
      local _, b = ps:getLinearDamping()
      ps:setLinearDamping(v, b)
    end,
    type = "number",
    min = 0,
  },
  {
    key = "linearDampingMax",
    get = function(ps)
      local _, b = ps:getLinearDamping()
      return b
    end,
    set = function(ps, v)
      local a = ps:getLinearDamping()
      ps:setLinearDamping(a, v)
    end,
    type = "number",
    min = 0,
  },
  {
    key = "sizes",
    get = function(ps)
      local parts = {}
      for _, v in ipairs({ ps:getSizes() }) do
        parts[#parts + 1] = fmt(v)
      end
      return table.concat(parts, ", ")
    end,
    set = function(ps, value)
      local sizes = {}
      for raw in tostring(value):gmatch("[^,]+") do
        local n = tonumber(raw)
        if n then
          sizes[#sizes + 1] = n
        end
      end
      if #sizes > 0 then
        ps:setSizes(unpack(sizes))
      end
    end,
    type = "string",
  },
  {
    key = "sizeVariation",
    get = function(ps)
      return ps:getSizeVariation()
    end,
    set = function(ps, v)
      ps:setSizeVariation(v)
    end,
    type = "number",
    min = 0,
    max = 1,
  },
  {
    key = "rotationMin",
    get = function(ps)
      local a = ps:getRotation()
      return a
    end,
    set = function(ps, v)
      local _, b = ps:getRotation()
      ps:setRotation(v, b)
    end,
    type = "number",
  },
  {
    key = "rotationMax",
    get = function(ps)
      local _, b = ps:getRotation()
      return b
    end,
    set = function(ps, v)
      local a = ps:getRotation()
      ps:setRotation(a, v)
    end,
    type = "number",
  },
  {
    key = "relativeRotation",
    get = function(ps)
      return ps:hasRelativeRotation()
    end,
    set = function(ps, v)
      ps:setRelativeRotation(v)
    end,
    type = "boolean",
  },
  {
    key = "spinMin",
    get = function(ps)
      local a = ps:getSpin()
      return a
    end,
    set = function(ps, v)
      local _, b = ps:getSpin()
      ps:setSpin(v, b)
    end,
    type = "number",
  },
  {
    key = "spinMax",
    get = function(ps)
      local _, b = ps:getSpin()
      return b
    end,
    set = function(ps, v)
      local a = ps:getSpin()
      ps:setSpin(a, v)
    end,
    type = "number",
  },
  {
    key = "spinVariation",
    get = function(ps)
      return ps:getSpinVariation()
    end,
    set = function(ps, v)
      ps:setSpinVariation(v)
    end,
    type = "number",
    min = 0,
    max = 1,
  },
  {
    key = "offsetX",
    get = function(ps)
      local a = ps:getOffset()
      return a
    end,
    set = function(ps, v)
      local _, b = ps:getOffset()
      ps:setOffset(v, b)
    end,
    type = "number",
  },
  {
    key = "offsetY",
    get = function(ps)
      local _, b = ps:getOffset()
      return b
    end,
    set = function(ps, v)
      local a = ps:getOffset()
      ps:setOffset(a, v)
    end,
    type = "number",
  },
  {
    key = "insertMode",
    get = function(ps)
      return ps:getInsertMode()
    end,
    set = function(ps, v)
      ps:setInsertMode(v)
    end,
    type = "string",
  },
  {
    key = "colors",
    get = function(ps)
      local parts = {}
      for _, c in ipairs({ ps:getColors() }) do
        if type(c) == "table" then
          for _, v in ipairs(c) do
            parts[#parts + 1] = fmt(v)
          end
        else
          parts[#parts + 1] = fmt(c)
        end
      end
      return table.concat(parts, ", ")
    end,
    set = function(ps, value)
      local colors = {}
      for raw in tostring(value):gmatch("[^,]+") do
        local n = tonumber(raw)
        if n then
          colors[#colors + 1] = n
        end
      end
      if #colors >= 4 then
        ps:setColors(unpack(colors))
      end
    end,
    type = "string",
  },
  {
    key = "emissionAreaDist",
    get = function(ps)
      local a = ps:getEmissionArea()
      return a
    end,
    set = function(ps, v)
      local _, b, c, d, e = ps:getEmissionArea()
      ps:setEmissionArea(v, b, c, d, e)
    end,
    type = "string",
  },
  {
    key = "emissionAreaDx",
    get = function(ps)
      local _, b = ps:getEmissionArea()
      return b
    end,
    set = function(ps, v)
      local a, _, c, d, e = ps:getEmissionArea()
      ps:setEmissionArea(a, v, c, d, e)
    end,
    type = "number",
    min = 0,
  },
  {
    key = "emissionAreaDy",
    get = function(ps)
      local _, _, c = ps:getEmissionArea()
      return c
    end,
    set = function(ps, v)
      local a, b, _, d, e = ps:getEmissionArea()
      ps:setEmissionArea(a, b, v, d, e)
    end,
    type = "number",
    min = 0,
  },
  {
    key = "emissionAreaAngle",
    get = function(ps)
      local _, _, _, d = ps:getEmissionArea()
      return d
    end,
    set = function(ps, v)
      local a, b, c, _, e = ps:getEmissionArea()
      ps:setEmissionArea(a, b, c, v, e)
    end,
    type = "number",
  },
  {
    key = "emissionAreaRelative",
    get = function(ps)
      local _, _, _, _, e = ps:getEmissionArea()
      return e
    end,
    set = function(ps, v)
      local a, b, c, d = ps:getEmissionArea()
      ps:setEmissionArea(a, b, c, d, v)
    end,
    type = "boolean",
  },
}

local PS_PROP_MAP = {}
for _, prop in ipairs(PS_PROPERTIES) do
  PS_PROP_MAP[prop.key] = prop
end

local function setProp(ps, key, raw)
  local prop = PS_PROP_MAP[key]
  if not prop or not ps then
    return false
  end

  local value
  if prop.type == "number" then
    value = tonumber(raw)
    if value == nil then
      return false
    end
    if prop.min and value < prop.min then
      value = prop.min
    end
    if prop.max and value > prop.max then
      value = prop.max
    end
  elseif prop.type == "boolean" then
    value = raw == true or raw == "true" or raw == "1"
  else
    value = tostring(raw)
  end

  local ok = pcall(prop.set, ps, value)
  if ok then
    if prop.type == "number" then
      value = roundSnapshotNumber(value)
    end
    return true, prop.key, value
  end
  return false
end

local function snapshotPS(ps)
  local snapshot = {}
  if not ps then
    return snapshot
  end
  for _, prop in ipairs(PS_PROPERTIES) do
    local ok, value = pcall(prop.get, ps)
    if ok then
      if prop.type == "number" then
        value = roundSnapshotNumber(value)
      end
      snapshot[prop.key] = value
    end
  end
  local okCount, count = pcall(ps.getCount, ps)
  if okCount then
    snapshot.count = count
  end
  local okBuffer, buffer = pcall(ps.getBufferSize, ps)
  if okBuffer then
    snapshot.bufferSize = buffer
  end
  return snapshot
end

local function snapshotSystemProperties(sys)
  local snapshot = snapshotPS(sys and sys.system)
  if type(sys and sys._timelineBase) == "table" then
    for key, value in pairs(sys._timelineBase) do
      if key ~= "count" then
        snapshot[key] = value
      end
    end
  end
  return snapshot
end

local function parseNumberList(value)
  local values = {}
  for raw in tostring(value or ""):gmatch("[^,]+") do
    local n = tonumber(raw)
    if n then
      values[#values + 1] = n
    end
  end
  return values
end

local function cloneTimeline(timeline)
  if type(timeline) ~= "table" then
    return nil
  end
  local copy = {
    duration = safeNumber(timeline.duration, DEFAULT_TIMELINE_DURATION),
    loop = safeBoolean(timeline.loop, false),
    tracks = {},
  }
  for _, track in ipairs(timeline.tracks or {}) do
    if type(track) == "table" then
      local nextTrack = {
        systemIndex = math.max(1, math.floor(safeNumber(track.systemIndex, 1))),
        clips = {},
        lanes = {},
      }
      for _, clip in ipairs(track.clips or {}) do
        if type(clip) == "table" then
          nextTrack.clips[#nextTrack.clips + 1] = {
            id = safeString(clip.id, "clip"),
            start = safeNumber(clip.start, 0),
            ["end"] = safeNumber(clip["end"], DEFAULT_TIMELINE_DURATION),
            emit = clip.emit ~= nil and math.max(0, math.floor(safeNumber(clip.emit, 0))) or nil,
          }
        end
      end
      if type(track.lanes) == "table" then
        for _, lane in ipairs(TIMELINE_LANES) do
          local points = track.lanes[lane]
          if type(points) == "table" then
            nextTrack.lanes[lane] = {}
            for _, point in ipairs(points) do
              if type(point) == "table" then
                nextTrack.lanes[lane][#nextTrack.lanes[lane] + 1] = {
                  id = safeString(point.id, lane),
                  time = safeNumber(point.time, 0),
                  value = safeNumber(point.value, 0),
                  easing = normalizeTimelineEasing(point.easing),
                }
              end
            end
            table.sort(nextTrack.lanes[lane], function(a, b)
              return a.time < b.time
            end)
          end
        end
      end
      copy.tracks[#copy.tracks + 1] = nextTrack
    end
  end
  return copy
end

local function timelineClip(systemIndex, startTime, endTime, emit)
  return {
    id = "clip-" .. tostring(systemIndex) .. "-" .. tostring(math.floor(startTime * 1000)),
    start = startTime,
    ["end"] = endTime,
    emit = emit,
  }
end

local function timelineKey(lane, systemIndex, time, value)
  return {
    id = lane .. "-" .. tostring(systemIndex) .. "-" .. tostring(math.floor(time * 1000)),
    time = time,
    value = value,
  }
end

local function authoredTrack(sys, startTime, endTime, lanes, emit)
  local index = safeNumber(sys and sys.index, 1)
  local track = {
    systemIndex = index,
    clips = { timelineClip(index, startTime, endTime, emit or safeNumber(sys and sys.emitAtStart, 0)) },
    lanes = {},
  }
  for lane, points in pairs(lanes or {}) do
    track.lanes[lane] = {}
    for _, point in ipairs(points) do
      track.lanes[lane][#track.lanes[lane] + 1] = timelineKey(lane, index, point[1], point[2])
    end
  end
  return track
end

local function defaultTimelineForSystems(systems, template)
  local duration = DEFAULT_TIMELINE_DURATION
  local loop = template == "fire" or template == "smoke" or template == "sparkles"
  local tracks = {}

  if template == "explosion" and systems[3] then
    tracks[1] = authoredTrack(systems[1], 0, 0.42, {
      opacity = { { 0, 1 }, { 0.32, 0.78 }, { 0.42, 0 } },
      emissionRate = { { 0, 950 }, { 0.18, 280 }, { 0.42, 0 } },
      sizeScale = { { 0, 0.7 }, { 0.2, 1.45 }, { 0.42, 0.55 } },
    }, 220)
    tracks[2] = authoredTrack(systems[2], 0.08, 2.8, {
      opacity = { { 0.08, 0 }, { 0.32, 0.72 }, { 2.8, 0 } },
      speedScale = { { 0.08, 1.2 }, { 1.1, 0.45 }, { 2.8, 0.15 } },
      sizeScale = { { 0.08, 0.5 }, { 1.2, 1.8 }, { 2.8, 2.4 } },
      offsetY = { { 0.08, 0 }, { 2.8, -34 } },
    }, 90)
    tracks[3] = authoredTrack(systems[3], 0.02, 1.25, {
      opacity = { { 0.02, 1 }, { 0.8, 0.65 }, { 1.25, 0 } },
      emissionRate = { { 0.02, 360 }, { 0.25, 80 }, { 1.25, 0 } },
      speedScale = { { 0.02, 1.35 }, { 1.25, 0.35 } },
    }, 140)
    return { duration = duration, loop = false, tracks = tracks }
  end

  if template == "muzzle-flash" and systems[2] then
    tracks[1] = authoredTrack(systems[1], 0, 0.28, {
      opacity = { { 0, 1 }, { 0.12, 0.85 }, { 0.28, 0 } },
      emissionRate = { { 0, 1000 }, { 0.1, 280 }, { 0.28, 0 } },
      spread = { { 0, 0.3 }, { 0.28, 0.72 } },
    }, 90)
    tracks[2] = authoredTrack(systems[2], 0.03, 0.75, {
      opacity = { { 0.03, 1 }, { 0.45, 0.65 }, { 0.75, 0 } },
      speedScale = { { 0.03, 1.25 }, { 0.75, 0.25 } },
    }, 80)
    return { duration = duration, loop = false, tracks = tracks }
  end

  if template == "magic-burst" and systems[3] then
    tracks[1] = authoredTrack(systems[1], 0, 0.65, {
      opacity = { { 0, 1 }, { 0.45, 0.65 }, { 0.65, 0 } },
      sizeScale = { { 0, 0.4 }, { 0.35, 1.6 }, { 0.65, 0.2 } },
    }, 120)
    tracks[2] = authoredTrack(systems[2], 0.05, 2.2, {
      opacity = { { 0.05, 0.8 }, { 1.5, 0.5 }, { 2.2, 0 } },
      direction = { { 0.05, -1.57 }, { 2.2, -2.3 } },
      spread = { { 0.05, 6.28 }, { 2.2, 3.3 } },
    }, 80)
    tracks[3] = authoredTrack(systems[3], 0.12, 2.6, {
      opacity = { { 0.12, 1 }, { 1.7, 0.75 }, { 2.6, 0 } },
      offsetY = { { 0.12, 0 }, { 2.6, -28 } },
    }, 110)
    return { duration = duration, loop = false, tracks = tracks }
  end

  if template == "dust-puff" and systems[1] then
    tracks[1] = authoredTrack(systems[1], 0, 2.25, {
      opacity = { { 0, 0.65 }, { 0.45, 0.75 }, { 2.25, 0 } },
      speedScale = { { 0, 0.9 }, { 1.2, 0.32 }, { 2.25, 0.12 } },
      sizeScale = { { 0, 0.45 }, { 1.1, 1.75 }, { 2.25, 2.4 } },
      offsetY = { { 0, 0 }, { 2.25, -18 } },
    }, 120)
    return { duration = duration, loop = false, tracks = tracks }
  end

  if template == "complex-composite" and systems[5] then
    tracks[1] = authoredTrack(systems[1], 0, 0.72, {
      opacity = { { 0, 1 }, { 0.45, 0.82 }, { 0.72, 0 } },
      emissionRate = { { 0, 720 }, { 0.18, 260 }, { 0.72, 0 } },
      sizeScale = { { 0, 0.35 }, { 0.34, 1.8 }, { 0.72, 0.3 } },
    }, 140)
    tracks[2] = authoredTrack(systems[2], 0.04, 0.58, {
      opacity = { { 0.04, 0.95 }, { 0.32, 0.68 }, { 0.58, 0 } },
      speedScale = { { 0.04, 1.5 }, { 0.58, 0.45 } },
      sizeScale = { { 0.04, 0.45 }, { 0.58, 2.2 } },
      spread = { { 0.04, 6.28 }, { 0.58, 6.28 } },
    }, 90)
    tracks[3] = authoredTrack(systems[3], 0.16, 3, {
      opacity = { { 0.16, 0 }, { 0.5, 0.72 }, { 2.75, 0 } },
      speedScale = { { 0.16, 1.1 }, { 1.4, 0.42 }, { 3, 0.18 } },
      sizeScale = { { 0.16, 0.45 }, { 1.35, 1.8 }, { 3, 2.5 } },
      offsetY = { { 0.16, 0 }, { 3, -42 } },
    }, 110)
    tracks[4] = authoredTrack(systems[4], 0.1, 1.45, {
      opacity = { { 0.1, 1 }, { 0.75, 0.8 }, { 1.45, 0 } },
      emissionRate = { { 0.1, 520 }, { 0.42, 120 }, { 1.45, 0 } },
      speedScale = { { 0.1, 1.35 }, { 1.45, 0.34 } },
      direction = { { 0.1, -0.9 }, { 1.45, -2.25 } },
      spread = { { 0.1, 4.6 }, { 1.45, 2.2 } },
    }, 180)
    tracks[5] = authoredTrack(systems[5], 0.28, 2.7, {
      opacity = { { 0.28, 0 }, { 0.62, 0.5 }, { 2.7, 0 } },
      speedScale = { { 0.28, 0.8 }, { 1.4, 0.28 }, { 2.7, 0.12 } },
      sizeScale = { { 0.28, 0.4 }, { 1.2, 1.35 }, { 2.7, 2 } },
      offsetY = { { 0.28, 10 }, { 2.7, 30 } },
    }, 100)
    return { duration = duration, loop = false, tracks = tracks }
  end

  for index, sys in ipairs(systems or {}) do
    tracks[index] = {
      systemIndex = index,
      clips = { timelineClip(index, 0, duration, safeNumber(sys.emitAtStart, 0)) },
      lanes = {},
    }
  end
  return { duration = duration, loop = loop, tracks = tracks }
end

local function normalizeTimeline(timeline, systems, template)
  local fallback = defaultTimelineForSystems(systems or {}, template)
  local raw = cloneTimeline(timeline) or fallback
  local duration = math.max(0.25, math.min(60, safeNumber(raw.duration, DEFAULT_TIMELINE_DURATION)))
  local tracksByIndex = {}
  for _, track in ipairs(raw.tracks or {}) do
    tracksByIndex[math.max(1, math.floor(safeNumber(track.systemIndex, 1)))] = track
  end

  local tracks = {}
  for index, sys in ipairs(systems or {}) do
    local source = tracksByIndex[index] or (fallback.tracks and fallback.tracks[index])
    local nextTrack = {
      systemIndex = index,
      clips = {},
      lanes = {},
    }
    for _, item in ipairs((source and source.clips) or {}) do
      local startTime = math.max(0, math.min(duration, safeNumber(item.start, 0)))
      local endTime = math.max(startTime + 0.01, math.min(duration, safeNumber(item["end"], duration)))
      nextTrack.clips[#nextTrack.clips + 1] = {
        id = safeString(item.id, "clip-" .. tostring(index)),
        start = startTime,
        ["end"] = endTime,
        emit = item.emit ~= nil and math.max(0, math.floor(safeNumber(item.emit, 0))) or nil,
      }
    end
    if #nextTrack.clips == 0 then
      nextTrack.clips[1] = timelineClip(index, 0, duration, safeNumber(sys.emitAtStart, 0))
    end
    for _, lane in ipairs(TIMELINE_LANES) do
      local points = source and source.lanes and source.lanes[lane]
      if type(points) == "table" then
        nextTrack.lanes[lane] = {}
        for _, point in ipairs(points) do
          if type(point) == "table" then
            nextTrack.lanes[lane][#nextTrack.lanes[lane] + 1] = {
              id = safeString(point.id, lane),
              time = math.max(0, math.min(duration, safeNumber(point.time, 0))),
              value = safeNumber(point.value, 0),
              easing = normalizeTimelineEasing(point.easing),
            }
          end
        end
        table.sort(nextTrack.lanes[lane], function(a, b)
          return a.time < b.time
        end)
      end
    end
    tracks[index] = nextTrack
  end

  return {
    duration = duration,
    loop = raw.loop == true,
    tracks = tracks,
  }
end

local function reindexTimelineTracks(timeline)
  local normalized = cloneTimeline(timeline)
  if not normalized then
    return timeline
  end
  for index, track in ipairs(normalized.tracks or {}) do
    track.systemIndex = index
  end
  return normalized
end

local function removeTimelineTrack(timeline, systems, systemIndex)
  local normalized = normalizeTimeline(timeline, systems)
  table.remove(normalized.tracks, systemIndex)
  return reindexTimelineTracks(normalized)
end

local function reorderTimelineTrack(timeline, systems, fromIndex, toIndex)
  local normalized = normalizeTimeline(timeline, systems)
  local moved = table.remove(normalized.tracks, fromIndex)
  if moved then
    table.insert(normalized.tracks, toIndex, moved)
  end
  return reindexTimelineTracks(normalized)
end

local function remapSystemIndexAfterRemove(activeIndex, removedIndex, count)
  if activeIndex == removedIndex then
    return math.max(1, math.min(removedIndex, count))
  end
  if activeIndex > removedIndex then
    return math.max(1, activeIndex - 1)
  end
  return math.max(1, math.min(activeIndex, count))
end

local function remapSystemIndexAfterReorder(activeIndex, fromIndex, toIndex)
  if activeIndex == fromIndex then
    return toIndex
  end
  if fromIndex < toIndex and activeIndex > fromIndex and activeIndex <= toIndex then
    return activeIndex - 1
  end
  if fromIndex > toIndex and activeIndex >= toIndex and activeIndex < fromIndex then
    return activeIndex + 1
  end
  return activeIndex
end

local function captureTimelineBase(sys)
  if sys and sys.system then
    sys._timelineBase = snapshotPS(sys.system)
  end
end

local function applyTimelineToSystem(sys, track, time, allowEmission)
  if not sys or not sys.system then
    return
  end
  if not sys._timelineBase then
    captureTimelineBase(sys)
  end
  local base = sys._timelineBase or {}
  TimelineRuntime.applyTimelineToEmitter(sys, track, time, allowEmission == true, {
    base = base,
    opacityField = "_timelineOpacity",
  })
end

local function resetTimelineSystems(plugin, name)
  for i = 1, plugin:_systemCount(name) do
    local sys = plugin:_getSystemEntry(name, i)
    if sys and sys.system and isSystemEnabled(sys, plugin:_meta(name, i)) then
      if not sys._timelineBase then
        captureTimelineBase(sys)
      end
      local base = sys._timelineBase or {}
      pcall(sys.system.reset, sys.system)
      pcall(sys.system.setEmitterLifetime, sys.system, safeNumber(base.emitterLifetime, -1))
      pcall(sys.system.start, sys.system)
    end
  end
end

local function emitTimelineStarts(plugin, name, previousTime, nextTime, timeline)
  if not timeline then
    return
  end
  for index, track in ipairs(timeline.tracks or {}) do
    local sys = plugin:_getSystemEntry(name, index)
    if sys and sys.system and isSystemEnabled(sys, plugin:_meta(name, index)) then
      for _, item in ipairs(track.clips or {}) do
        local startTime = safeNumber(item.start, 0)
        if previousTime <= startTime and nextTime >= startTime then
          if not sys._timelineBase then
            captureTimelineBase(sys)
          end
          local base = sys._timelineBase or {}
          local count = math.max(0, math.floor(safeNumber(item.emit, safeNumber(sys.emitAtStart, 0))))
          pcall(sys.system.setEmitterLifetime, sys.system, safeNumber(base.emitterLifetime, -1))
          pcall(sys.system.start, sys.system)
          if count > 0 then
            pcall(sys.system.emit, sys.system, count)
          end
        end
      end
    end
  end
end

local function emitTimelineStartsForAdvance(plugin, name, previousTime, elapsed, timeline, duration)
  if not timeline or elapsed <= 0 then
    return previousTime
  end

  local cursor = previousTime
  local remaining = elapsed
  local guard = 0
  while remaining > 0 and guard < 128 do
    if cursor >= duration then
      cursor = 0
    end
    local room = math.max(0, duration - cursor)
    if room <= 0 then
      cursor = 0
      room = duration
    end
    local segment = math.min(remaining, room)
    local nextCursor = cursor + segment
    if segment > 0 then
      emitTimelineStarts(plugin, name, cursor, nextCursor, timeline)
    end
    remaining = remaining - segment
    cursor = nextCursor
    if remaining > 0 and cursor >= duration then
      cursor = 0
    end
    guard = guard + 1
  end

  return cursor >= duration and 0 or cursor
end

local function ensureTimelineState(entry)
  entry.timelineState = entry.timelineState or { time = 0, playing = false, scrubVersion = 0 }
  entry.timelineState.time = safeNumber(entry.timelineState.time, 0)
  entry.timelineState.playing = safeBoolean(entry.timelineState.playing, false)
  entry.timelineState.scrubVersion = safeNumber(entry.timelineState.scrubVersion, 0)
  return entry.timelineState
end

local function applyTimelineAt(plugin, name, time, allowEmission)
  local entry = plugin.composites[name]
  if not entry or not entry.timeline then
    return
  end
  for index, track in ipairs(entry.timeline.tracks or {}) do
    local sys = plugin:_getSystemEntry(name, index)
    if sys and sys.system and isSystemEnabled(sys, plugin:_meta(name, index)) then
      applyTimelineToSystem(sys, track, time, allowEmission == true)
    end
  end
end

local function timelineSystemsForPlugin(plugin, name)
  local systems = {}
  for i = 1, plugin:_systemCount(name) do
    local sys = plugin:_getSystemEntry(name, i) or {}
    systems[i] = {
      index = i,
      emitAtStart = safeNumber(sys.emitAtStart, 0),
    }
  end
  return systems
end

local function advanceTimeline(plugin, name, dt)
  local entry = plugin.composites[name]
  if not entry or not entry.timeline then
    return
  end
  local state = ensureTimelineState(entry)
  if not state.playing then
    return
  end
  local duration = math.max(0.25, safeNumber(entry.timeline.duration, DEFAULT_TIMELINE_DURATION))
  local previous = math.max(0, math.min(duration, state.time or 0))
  local elapsed = math.max(0, dt or 0)
  local nextTime = previous + elapsed
  if nextTime > duration then
    if entry.timeline.loop then
      nextTime = emitTimelineStartsForAdvance(plugin, name, previous, elapsed, entry.timeline, duration)
    else
      emitTimelineStarts(plugin, name, previous, duration, entry.timeline)
      nextTime = duration
      state.playing = false
    end
  else
    emitTimelineStarts(plugin, name, previous, nextTime, entry.timeline)
  end
  state.time = nextTime

  applyTimelineAt(plugin, name, nextTime, state.playing)
end

local function seekTimeline(plugin, name, time)
  local entry = plugin.composites[name]
  if not entry or not entry.timeline then
    return
  end
  local state = ensureTimelineState(entry)
  local duration = math.max(0.25, safeNumber(entry.timeline.duration, DEFAULT_TIMELINE_DURATION))
  local target = math.max(0, math.min(duration, safeNumber(time, 0)))
  resetTimelineSystems(plugin, name)
  state.time = target
  state.playing = false
  state.scrubVersion = safeNumber(state.scrubVersion, 0) + 1

  local step = 1 / 60
  local current = 0
  local steps = 0
  while current < target and steps < 600 do
    local nextTime = math.min(target, current + step)
    emitTimelineStarts(plugin, name, current, nextTime, entry.timeline)
    applyTimelineAt(plugin, name, nextTime, true)
    for i = 1, plugin:_systemCount(name) do
      local sys = plugin:_getSystemEntry(name, i)
      if sys and sys.system and isSystemEnabled(sys, plugin:_meta(name, i)) then
        pcall(sys.system.update, sys.system, nextTime - current)
      end
    end
    current = nextTime
    steps = steps + 1
  end
  applyTimelineAt(plugin, name, target, false)
end

local function createDefaultSystem(index, template)
  template = template or "fire"
  local texturePreset = "circle"
  if template == "smoke" then
    texturePreset = "light"
  end
  if template == "dust-puff" then
    texturePreset = "light"
  end
  if template == "sparkles" then
    texturePreset = "star"
  end
  if template == "magic-burst" then
    texturePreset = "star"
  end
  if template == "explosion-smoke" then
    texturePreset = "light"
  end

  local image, png = generatePresetImage(texturePreset)
  local ps = love.graphics.newParticleSystem(image, DEFAULT_BUFFER_SIZE)
  ps:setEmitterLifetime(-1)
  ps:setEmissionRate(100)
  ps:setParticleLifetime(0.35, 1.3)
  ps:setSpeed(40, 140)
  ps:setDirection(-math.pi / 2)
  ps:setSpread(math.pi / 3)
  ps:setColors(1, 0.5, 0.1, 1, 1, 0.1, 0, 0)
  ps:setSizes(1, 0)

  if template == "smoke" then
    ps:setEmissionRate(45)
    ps:setParticleLifetime(1.2, 3.2)
    ps:setSpeed(12, 45)
    ps:setDirection(-math.pi / 2)
    ps:setSpread(math.pi / 5)
    ps:setLinearAcceleration(-8, -18, 8, -55)
    ps:setLinearDamping(0.4, 1.2)
    ps:setColors(0.35, 0.35, 0.38, 0.45, 0.15, 0.15, 0.17, 0)
    ps:setSizes(0.35, 1.2, 2.2)
    ps:setSizeVariation(0.6)
  elseif template == "sparkles" then
    ps:setEmissionRate(70)
    ps:setParticleLifetime(0.35, 0.9)
    ps:setSpeed(80, 220)
    ps:setDirection(-math.pi / 2)
    ps:setSpread(math.pi * 2)
    ps:setLinearDamping(1.5, 3)
    ps:setColors(1, 0.95, 0.55, 1, 0.35, 0.75, 1, 0)
    ps:setSizes(0.45, 0.1)
    ps:setSizeVariation(0.8)
  elseif template == "explosion-core" then
    ps:setEmitterLifetime(0.12)
    ps:setEmissionRate(900)
    ps:setParticleLifetime(0.25, 0.75)
    ps:setSpeed(90, 330)
    ps:setDirection(0)
    ps:setSpread(math.pi * 2)
    ps:setLinearDamping(2, 5)
    ps:setColors(1, 0.95, 0.35, 1, 1, 0.25, 0.05, 0.65, 0.08, 0.02, 0.01, 0)
    ps:setSizes(0.25, 1.25, 0)
    ps:setSizeVariation(0.75)
  elseif template == "explosion-smoke" then
    ps:setEmitterLifetime(0.2)
    ps:setEmissionRate(180)
    ps:setParticleLifetime(0.8, 2.2)
    ps:setSpeed(30, 120)
    ps:setDirection(-math.pi / 2)
    ps:setSpread(math.pi * 2)
    ps:setLinearAcceleration(-15, -25, 15, -70)
    ps:setLinearDamping(0.8, 1.8)
    ps:setColors(0.28, 0.26, 0.24, 0.55, 0.12, 0.11, 0.1, 0)
    ps:setSizes(0.4, 1.8, 2.6)
    ps:setSizeVariation(0.7)
  elseif template == "muzzle-flash" then
    ps:setEmitterLifetime(0.12)
    ps:setEmissionRate(900)
    ps:setParticleLifetime(0.08, 0.22)
    ps:setSpeed(260, 680)
    ps:setDirection(0)
    ps:setSpread(math.pi / 8)
    ps:setLinearDamping(1.5, 4)
    ps:setColors(1, 0.96, 0.45, 1, 1, 0.35, 0.05, 0)
    ps:setSizes(0.6, 1.15, 0)
    ps:setSizeVariation(0.4)
  elseif template == "magic-burst" then
    ps:setEmissionRate(100)
    ps:setParticleLifetime(0.35, 1.3)
    ps:setSpeed(50, 170)
    ps:setDirection(-math.pi / 2)
    ps:setSpread(math.pi * 2)
    ps:setLinearDamping(0.7, 1.6)
    ps:setColors(0.75, 0.35, 1, 1, 0.2, 0.85, 1, 0)
    ps:setSizes(0.45, 0.1)
    ps:setSizeVariation(0.8)
  elseif template == "dust-puff" then
    ps:setEmissionRate(80)
    ps:setParticleLifetime(1.2, 3.2)
    ps:setSpeed(12, 45)
    ps:setDirection(-math.pi / 2)
    ps:setSpread(math.pi * 2)
    ps:setLinearAcceleration(-8, -18, 8, -55)
    ps:setLinearDamping(0.4, 1.2)
    ps:setColors(0.7, 0.62, 0.48, 0.55, 0.45, 0.38, 0.28, 0)
    ps:setSizes(0.35, 1.2, 2.2)
    ps:setSizeVariation(0.6)
  end

  ps:start()

  return {
    index = index,
    system = ps,
    title = "Emitter " .. tostring(index),
    blendMode = "alpha",
    shader = nil,
    shaderTextures = {},
    shaderPath = "",
    shaderFilename = "",
    shaderSource = "",
    enabled = true,
    texturePath = "",
    texturePreset = texturePreset,
    textureFilename = texturePreset .. ".png",
    textureAssetBase64 = png and base64.encode(png) or nil,
    x = 0,
    y = 0,
    kickStartSteps = 0,
    kickStartDt = 1 / 60,
    emitAtStart = 0,
    _ownedImage = image,
  }
end

local function createDefaultSystems(template)
  if template == "explosion" then
    local core = createDefaultSystem(1, "explosion-core")
    core.title = "Core Blast"
    core.blendMode = "add"
    core.emitAtStart = 220

    local smoke = createDefaultSystem(2, "explosion-smoke")
    smoke.title = "Smoke Bloom"
    smoke.blendMode = "alpha"
    smoke.emitAtStart = 90

    local sparks = createDefaultSystem(3, "sparkles")
    sparks.title = "Sparks"
    sparks.blendMode = "add"
    sparks.emitAtStart = 140
    return { core, smoke, sparks }
  end

  if template == "smoke" then
    local smoke = createDefaultSystem(1, "smoke")
    smoke.title = "Smoke"
    return { smoke }
  end

  if template == "sparkles" then
    local sparks = createDefaultSystem(1, "sparkles")
    sparks.title = "Sparkles"
    sparks.blendMode = "add"
    return { sparks }
  end

  if template == "muzzle-flash" then
    local flash = createDefaultSystem(1, "muzzle-flash")
    flash.title = "Flash Cone"
    flash.blendMode = "add"
    flash.emitAtStart = 90

    local sparks = createDefaultSystem(2, "sparkles")
    sparks.title = "Barrel Sparks"
    sparks.blendMode = "add"
    sparks.emitAtStart = 80
    return { flash, sparks }
  end

  if template == "magic-burst" then
    local core = createDefaultSystem(1, "magic-burst")
    core.title = "Core Pulse"
    core.blendMode = "add"
    core.emitAtStart = 120

    local swirl = createDefaultSystem(2, "sparkles")
    swirl.title = "Swirl"
    swirl.blendMode = "add"
    swirl.emitAtStart = 80

    local glitter = createDefaultSystem(3, "sparkles")
    glitter.title = "Glitter Trail"
    glitter.blendMode = "add"
    glitter.emitAtStart = 110
    return { core, swirl, glitter }
  end

  if template == "complex-composite" then
    local core = createDefaultSystem(1, "magic-burst")
    core.title = "Core Pulse"
    core.blendMode = "add"
    core.emitAtStart = 140
    core.system:setEmissionRate(720)
    core.system:setSizes(0.35, 1.8, 0.3)

    local ring = createDefaultSystem(2, "sparkles")
    ring.title = "Shock Ring"
    ring.blendMode = "add"
    ring.emitAtStart = 90
    ring.system:setSpeed(160, 360)
    ring.system:setSpread(math.pi * 2)
    ring.system:setSizes(0.18, 1.4, 0)

    local smoke = createDefaultSystem(3, "smoke")
    smoke.title = "Smoke Bloom"
    smoke.blendMode = "alpha"
    smoke.emitAtStart = 110
    smoke.y = -8
    smoke.system:setEmissionRate(95)
    smoke.system:setSpeed(18, 90)
    smoke.system:setSizes(0.45, 1.8, 2.6)

    local sparks = createDefaultSystem(4, "sparkles")
    sparks.title = "Spark Trails"
    sparks.blendMode = "add"
    sparks.emitAtStart = 180
    sparks.y = -10
    sparks.system:setEmissionRate(520)
    sparks.system:setSpeed(120, 300)
    sparks.system:setDirection(-0.9)
    sparks.system:setSpread(4.6)

    local dust = createDefaultSystem(5, "dust-puff")
    dust.title = "Dust Wake"
    dust.blendMode = "alpha"
    dust.emitAtStart = 100
    dust.y = 18
    dust.system:setEmissionRate(70)
    dust.system:setSpeed(20, 70)
    dust.system:setSizes(0.3, 1.2, 2)

    return { core, ring, smoke, sparks, dust }
  end

  if template == "dust-puff" then
    local dust = createDefaultSystem(1, "dust-puff")
    dust.title = "Dust Puff"
    dust.emitAtStart = 120
    return { dust }
  end

  local fire = createDefaultSystem(1, "fire")
  fire.title = "Flame"
  return { fire }
end

local function computeMovementOffset(movement, dt)
  if type(movement) ~= "table" or movement.pattern == nil or movement.pattern == "none" then
    return 0, 0
  end
  movement.t = (movement.t or 0) + dt
  local t = movement.t * (movement.speed or 1)

  if movement.pattern == "circle" then
    local radius = movement.radius or 50
    return math.cos(t) * radius, math.sin(t) * radius
  end

  if movement.pattern == "figure-eight" then
    local rx = movement.radiusX or 80
    local ry = movement.radiusY or 40
    return math.sin(t) * rx, math.sin(t * 2) * ry * 0.5
  end

  if movement.pattern == "irregular" then
    local scale = movement.scale or 50
    return (math.sin(t * 0.7 + 1.2) * 0.55 + math.sin(t * 1.9) * 0.3 + math.sin(t * 3.1) * 0.15) * scale,
      (math.sin(t * 0.9 + 2.4) * 0.55 + math.sin(t * 1.7 + 0.3) * 0.3 + math.sin(t * 2.9) * 0.15) * scale
  end

  return 0, 0
end

function ParticleSystemPlaygroundPlugin:init(config)
  Base.init(self, config)
  self.composites = {}
  self.compositeOrder = {}
  self.activeComposite = nil
  self.activeSystem = 1
  self.previewSessionActive = false
  self.previewComposite = nil
  self.timelineRuntimeActive = false
end

function ParticleSystemPlaygroundPlugin:_setRuntimePreviewActive(active, composite)
  if not active then
    self.previewSessionActive = false
    self.previewComposite = nil
    self.timelineRuntimeActive = false
    for _, entry in pairs(self.composites) do
      if entry.timelineState then
        entry.timelineState.playing = false
      end
    end
    return true
  end

  local target = composite and self.composites[composite] and composite or self.activeComposite
  self.previewSessionActive = true
  self.previewComposite = target
  pauseOtherScratchTimelines(self, target)
  local entry = target and self.composites[target]
  if entry and entry.timeline then
    local state = ensureTimelineState(entry)
    applyTimelineAt(self, target, state.time or 0)
  end
  self.timelineRuntimeActive = hasPlayingTimeline(self)
  return true
end

function ParticleSystemPlaygroundPlugin:addComposite(name, getter)
  if type(name) ~= "string" or name == "" or type(getter) ~= "function" then
    return false
  end
  if self.composites[name] then
    return false
  end
  self.composites[name] = {
    kind = "game",
    name = name,
    getter = getter,
    meta = {},
  }
  self.compositeOrder[#self.compositeOrder + 1] = name
  if not self.activeComposite then
    self.activeComposite = name
  end
  return true
end

function ParticleSystemPlaygroundPlugin:removeComposite(name)
  local entry = self.composites[name]
  if not entry then
    return false
  end
  self.composites[name] = nil
  for i, item in ipairs(self.compositeOrder) do
    if item == name then
      table.remove(self.compositeOrder, i)
      break
    end
  end
  if self.activeComposite == name then
    self.activeComposite = self.compositeOrder[1]
    self.activeSystem = 1
  end
  if self.previewComposite == name then
    self.previewComposite = self.activeComposite
    if not self.previewComposite then
      self.previewSessionActive = false
    end
  end
  self.timelineRuntimeActive = hasPlayingTimeline(self)
  return true
end

function ParticleSystemPlaygroundPlugin:_newComposite(name, template)
  local base = safeString(name, "")
  if base == "" then
    base = "Effect " .. tostring(#self.compositeOrder + 1)
  end
  local final = base
  local suffix = 2
  while self.composites[final] do
    final = base .. " " .. tostring(suffix)
    suffix = suffix + 1
  end

  local systems = createDefaultSystems(template)
  for _, system in ipairs(systems) do
    captureTimelineBase(system)
  end
  self.composites[final] = {
    kind = "scratch",
    name = final,
    x = DEFAULT_X,
    y = DEFAULT_Y,
    previewEnabled = true,
    movement = { pattern = "none", radius = 50, radiusX = 80, radiusY = 40, speed = 1, scale = 50 },
    offsetX = 0,
    offsetY = 0,
    systems = systems,
    timeline = normalizeTimeline(nil, systems, template),
    timelineState = { time = 0, playing = false, scrubVersion = 0 },
  }
  self.compositeOrder[#self.compositeOrder + 1] = final
  pauseOtherScratchTimelines(self, final)
  self.activeComposite = final
  self.activeSystem = 1
  if self.previewSessionActive then
    self.previewComposite = final
  end
  applyTimelineAt(self, final, 0)
  self.timelineRuntimeActive = hasPlayingTimeline(self)
  return final
end

function ParticleSystemPlaygroundPlugin:_uniqueCompositeName(name)
  local base = safeString(name, "")
  if base == "" then
    base = "Effect " .. tostring(#self.compositeOrder + 1)
  end
  local final = base
  local suffix = 2
  while self.composites[final] do
    final = base .. " " .. tostring(suffix)
    suffix = suffix + 1
  end
  return final
end

function ParticleSystemPlaygroundPlugin:_getCompositeTable(name)
  local entry = self.composites[name or self.activeComposite]
  if not entry then
    return nil
  end
  if entry.kind == "game" then
    local ok, composite = pcall(entry.getter)
    if ok and type(composite) == "table" then
      return composite
    end
    return nil
  end
  return entry
end

function ParticleSystemPlaygroundPlugin:_getSystemEntry(name, index)
  local entry = self.composites[name or self.activeComposite]
  if not entry then
    return nil
  end
  if entry.kind == "scratch" then
    return entry.systems and entry.systems[index]
  end
  local composite = self:_getCompositeTable(name)
  return composite and composite[index] or nil
end

function ParticleSystemPlaygroundPlugin:_systemCount(name)
  local entry = self.composites[name or self.activeComposite]
  if not entry then
    return 0
  end
  if entry.kind == "scratch" then
    return entry.systems and #entry.systems or 0
  end
  local composite = self:_getCompositeTable(name)
  if not composite then
    return 0
  end
  local count = 0
  while composite[count + 1] do
    count = count + 1
  end
  return count
end

function ParticleSystemPlaygroundPlugin:_meta(name, index)
  local entry = self.composites[name or self.activeComposite]
  if not entry then
    return {}
  end
  if entry.kind == "scratch" then
    return entry.systems and entry.systems[index] or {}
  end
  entry.meta[index] = entry.meta[index] or {}
  return entry.meta[index]
end

function ParticleSystemPlaygroundPlugin:update(dt)
  if not self.previewSessionActive and not self.timelineRuntimeActive then
    return
  end
  local timelineRuntimeActive = false
  for _, name in ipairs(self.compositeOrder) do
    local entry = self.composites[name]
    local timelineWasPlaying = entry and entry.timelineState and safeBoolean(entry.timelineState.playing, false)
    local previewActive = scratchPreviewRuntimeActive(self, name, entry)
    local scratchUpdated = false
    if entry and entry.kind == "scratch" and (previewActive or timelineWasPlaying) then
      local offsetX = safeNumber(entry.offsetX, 0)
      local offsetY = safeNumber(entry.offsetY, 0)
      if previewActive then
        offsetX, offsetY = computeMovementOffset(entry.movement, dt)
        entry.offsetX, entry.offsetY = offsetX, offsetY
      end
      local x = (entry.x or DEFAULT_X) + offsetX
      local y = (entry.y or DEFAULT_Y) + offsetY
      for index, system in ipairs(entry.systems or {}) do
        if system.system and isSystemEnabled(system, self:_meta(name, index)) then
          pcall(system.system.setPosition, system.system, x + (system.x or 0), y + (system.y or 0))
        end
      end
      scratchUpdated = true
    end
    if entry and entry.timeline and (timelineWasPlaying or previewActive) then
      advanceTimeline(self, name, dt)
      if entry.timelineState and safeBoolean(entry.timelineState.playing, false) then
        timelineRuntimeActive = true
      end
    end
    local timelineStillPlaying = entry and entry.timelineState and safeBoolean(entry.timelineState.playing, false)
    if entry and entry.kind == "scratch" and (scratchUpdated or timelineStillPlaying) then
      local offsetX = safeNumber(entry.offsetX, 0)
      local offsetY = safeNumber(entry.offsetY, 0)
      local x = (entry.x or DEFAULT_X) + offsetX
      local y = (entry.y or DEFAULT_Y) + offsetY
      for index, system in ipairs(entry.systems or {}) do
        if system.system and isSystemEnabled(system, self:_meta(name, index)) then
          pcall(system.system.setPosition, system.system, x + (system.x or 0), y + (system.y or 0))
          pcall(system.system.update, system.system, dt)
        end
      end
    end
  end
  self.timelineRuntimeActive = timelineRuntimeActive
end

function ParticleSystemPlaygroundPlugin:onDraw()
  if not love or not love.graphics then
    return
  end
  local name = self.previewComposite
  local entry = name and self.composites[name]
  if not scratchPreviewRuntimeActive(self, name, entry) then
    return
  end

  local previousBlend, previousAlphaMode = love.graphics.getBlendMode()
  local previousShader = love.graphics.getShader()
  local r, g, b, a = love.graphics.getColor()

  for index, system in ipairs(entry.systems or {}) do
    if system.system and isSystemEnabled(system, self:_meta(name, index)) then
      pcall(love.graphics.setBlendMode, system.blendMode or "alpha")
      if system.shader and system.shader.send and love.timer then
        pcall(system.shader.send, system.shader, "u_time", love.timer.getTime())
        if type(system.shaderTextures) == "table" then
          for uniform, image in pairs(system.shaderTextures) do
            pcall(system.shader.send, system.shader, uniform, image)
          end
        end
      end
      love.graphics.setShader(system.shader)
      love.graphics.setColor(1, 1, 1, safeNumber(system._timelineOpacity, 1))
      love.graphics.draw(system.system, 0, 0)
    end
  end

  love.graphics.setBlendMode(previousBlend, previousAlphaMode)
  love.graphics.setShader(previousShader)
  love.graphics.setColor(r, g, b, a)
end

function ParticleSystemPlaygroundPlugin:handleRequest()
  local names = {}
  for _, name in ipairs(self.compositeOrder) do
    names[#names + 1] = name
  end

  local active = self.activeComposite
  local data = nil
  local entry = active and self.composites[active]
  if entry then
    local composite = self:_getCompositeTable(active)
    local systems = {}
    for i = 1, self:_systemCount(active) do
      local sys = self:_getSystemEntry(active, i) or {}
      local meta = self:_meta(active, i)
      systems[#systems + 1] = {
        index = i,
        title = safeString(meta.title or sys.title, "Emitter " .. tostring(i)),
        blendMode = safeString(sys.blendMode, "alpha"),
        enabled = isSystemEnabled(sys, meta),
        x = safeNumber(sys.x, 0),
        y = safeNumber(sys.y, 0),
        kickStartSteps = safeNumber(sys.kickStartSteps, 0),
        kickStartDt = safeNumber(sys.kickStartDt, 1 / 60),
        emitAtStart = safeNumber(sys.emitAtStart, 0),
        texturePath = safeString(meta.texturePath or sys.texturePath, ""),
        texturePreset = safeString(meta.texturePreset or sys.texturePreset, ""),
        textureFilename = safeString(meta.textureFilename or sys.textureFilename, ""),
        shaderPath = safeString(meta.shaderPath or sys.shaderPath, ""),
        shaderFilename = safeString(meta.shaderFilename or sys.shaderFilename, ""),
        shaderSource = safeString(meta.shaderSource or sys.shaderSource, ""),
        exportReady = (
          meta.texturePath
          or sys.texturePath
          or meta.textureAssetBase64
          or sys.textureAssetBase64
          or meta.texturePreset
          or sys.texturePreset
        )
            and true
          or false,
        properties = snapshotSystemProperties(sys),
      }
    end
    data = {
      compositeType = entry.kind,
      x = entry.kind == "scratch" and safeNumber(entry.x, DEFAULT_X) or safeNumber(composite and composite.x, 0),
      y = entry.kind == "scratch" and safeNumber(entry.y, DEFAULT_Y) or safeNumber(composite and composite.y, 0),
      previewEnabled = compositePreviewEnabled(entry),
      movement = entry.kind == "scratch" and entry.movement or { pattern = "none" },
      systems = systems,
      timeline = normalizeTimeline(entry.timeline, systems),
      timelineState = ensureTimelineState(entry),
    }
  end

  return {
    type = "particle-system-playground",
    loading = false,
    composites = names,
    activeComposite = active,
    activeSystem = self.activeSystem,
    data = data,
  }
end

function ParticleSystemPlaygroundPlugin:handleParamsUpdate(request)
  local params = request.params or {}
  if params.composite and self.composites[params.composite] then
    if params.composite ~= self.activeComposite then
      pauseOtherScratchTimelines(self, params.composite)
    end
    self.activeComposite = params.composite
    self.timelineRuntimeActive = hasPlayingTimeline(self)
  end
  if params.systemIndex then
    self.activeSystem = math.max(1, safeNumber(params.systemIndex, self.activeSystem))
  end

  local name = params.composite or self.activeComposite
  local entry = self.composites[name]
  if not entry then
    return
  end

  if entry.kind == "scratch" then
    if params.compositeX ~= nil then
      entry.x = safeNumber(params.compositeX, entry.x)
    end
    if params.compositeY ~= nil then
      entry.y = safeNumber(params.compositeY, entry.y)
    end
    if params.previewEnabled ~= nil then
      entry.previewEnabled = safeBoolean(params.previewEnabled, true)
      if not entry.previewEnabled and self.previewComposite == name and entry.timelineState then
        entry.timelineState.playing = false
        self.timelineRuntimeActive = hasPlayingTimeline(self)
      end
    end
    entry.movement = entry.movement or { pattern = "none" }
    if params["movement.pattern"] ~= nil then
      entry.movement.pattern = tostring(params["movement.pattern"])
    end
    for _, key in ipairs({ "radius", "radiusX", "radiusY", "speed", "scale" }) do
      local paramKey = "movement." .. key
      if params[paramKey] ~= nil then
        entry.movement[key] = safeNumber(params[paramKey], entry.movement[key])
      end
    end
  end

  local index = math.max(1, safeNumber(params.systemIndex, self.activeSystem))
  local sys = self:_getSystemEntry(name, index)
  if not sys then
    return
  end
  local meta = self:_meta(name, index)

  if params.title ~= nil then
    meta.title = tostring(params.title)
    sys.title = tostring(params.title)
  end
  if params.blendMode ~= nil then
    sys.blendMode = tostring(params.blendMode)
  end
  if params.enabled ~= nil then
    local enabled = safeBoolean(params.enabled, true)
    meta.enabled = enabled
    sys.enabled = enabled
  end
  if params.emitterOffsetX ~= nil then
    sys.x = safeNumber(params.emitterOffsetX, sys.x)
  end
  if params.emitterOffsetY ~= nil then
    sys.y = safeNumber(params.emitterOffsetY, sys.y)
  end
  if params.kickStartSteps ~= nil then
    sys.kickStartSteps = safeNumber(params.kickStartSteps, sys.kickStartSteps)
  end
  if params.kickStartDt ~= nil then
    sys.kickStartDt = safeNumber(params.kickStartDt, sys.kickStartDt)
  end
  if params.emitAtStart ~= nil then
    sys.emitAtStart = safeNumber(params.emitAtStart, sys.emitAtStart)
  end

  for key, value in pairs(params) do
    local changed, propKey, normalizedValue = setProp(sys.system, key, value)
    if changed then
      if sys._timelineBase and propKey then
        sys._timelineBase[propKey] = normalizedValue
      end
    end
  end
end

function ParticleSystemPlaygroundPlugin:_replaceTexture(sys, image)
  if not sys or not image then
    return
  end
  local old = sys.system
  if old and old.setTexture then
    local ok = pcall(old.setTexture, old, image)
    if ok then
      sys._ownedImage = image
      return
    end
  end

  local new = love.graphics.newParticleSystem(image, old and old:getBufferSize() or DEFAULT_BUFFER_SIZE)
  copyParticleProperties(old, new)
  sys.system = new
  sys._ownedImage = image
  new:start()
end

function ParticleSystemPlaygroundPlugin:_applyTexture(name, index, params)
  local sys = self:_getSystemEntry(name, index)
  if not sys then
    return nil, "System not found"
  end
  local meta = self:_meta(name, index)

  if params.dataBase64 then
    local raw = decodeBase64(params.dataBase64)
    if not raw then
      return nil, "Texture data is not valid base64"
    end
    local filename = sanitizeFilename(params.filename, "texture.png")
    local okData, fileData = pcall(love.filesystem.newFileData, raw, filename)
    if not okData or not fileData then
      return nil, "Could not create texture file data"
    end
    local okImage, image = pcall(love.graphics.newImage, fileData)
    if not okImage or not image then
      return nil, "Could not create image from uploaded texture"
    end
    self:_replaceTexture(sys, image)
    sys.texturePath = ""
    sys.texturePreset = ""
    sys.textureFilename = filename
    sys.textureAssetBase64 = params.dataBase64
    meta.texturePath = ""
    meta.texturePreset = ""
    meta.textureFilename = filename
    meta.textureAssetBase64 = params.dataBase64
    return true
  end

  if params.texturePath and params.texturePath ~= "" then
    local ok, image = pcall(love.graphics.newImage, params.texturePath)
    if not ok or not image then
      return nil, "Could not load texture: " .. tostring(params.texturePath)
    end
    self:_replaceTexture(sys, image)
    sys.texturePath = tostring(params.texturePath)
    sys.texturePreset = ""
    sys.textureFilename = sanitizeFilename(params.texturePath, "texture.png")
    sys.textureAssetBase64 = nil
    meta.texturePath = sys.texturePath
    meta.texturePreset = ""
    meta.textureFilename = sys.textureFilename
    meta.textureAssetBase64 = nil
    return true
  end

  local preset = safeString(params.preset, "")
  if preset ~= "" then
    local image, png = generatePresetImage(preset)
    if not image then
      return nil, "Could not generate texture preset"
    end
    self:_replaceTexture(sys, image)
    sys.texturePath = ""
    sys.texturePreset = preset
    sys.textureFilename = preset .. ".png"
    sys.textureAssetBase64 = png and base64.encode(png) or nil
    meta.texturePath = ""
    meta.texturePreset = preset
    meta.textureFilename = sys.textureFilename
    meta.textureAssetBase64 = sys.textureAssetBase64
    return true
  end

  return nil, "No texture supplied"
end

function ParticleSystemPlaygroundPlugin:_applyShader(name, index, params)
  local sys = self:_getSystemEntry(name, index)
  if not sys then
    return nil, "System not found"
  end
  local meta = self:_meta(name, index)

  if params.clearShader then
    sys.shader = nil
    sys.shaderPath = ""
    sys.shaderFilename = ""
    sys.shaderSource = ""
    meta.shaderPath = ""
    meta.shaderFilename = ""
    meta.shaderSource = ""
    return true
  end

  local source = params.shaderSource
  local filename = sanitizeFilename(params.filename, "shader.glsl")
  local path = safeString(params.shaderPath, "")
  if path ~= "" then
    local okRead, readSource = pcall(love.filesystem.read, path)
    if not okRead or not readSource then
      return nil, "Could not read shader: " .. path
    end
    source = readSource
    filename = sanitizeFilename(path, "shader.glsl")
  end

  if not source or source == "" then
    return nil, "No shader source supplied"
  end

  local okShader, shader = pcall(love.graphics.newShader, source)
  if not okShader then
    return nil, tostring(shader)
  end

  local shaderTextures = {}
  if type(params.textures) == "table" then
    for _, texture in ipairs(params.textures) do
      if type(texture) == "table" then
        local uniform = safeString(texture.uniform, "")
        local dataBase64 = safeString(texture.dataBase64, "")
        if uniform ~= "" and dataBase64 ~= "" then
          local raw = decodeBase64(dataBase64)
          if not raw then
            return nil, "Shader texture data is not valid base64"
          end
          local texFilename = sanitizeFilename(texture.filename, uniform .. ".png")
          local okData, fileData = pcall(love.filesystem.newFileData, raw, texFilename)
          if not okData or not fileData then
            return nil, "Could not create shader texture file data"
          end
          local okImage, image = pcall(love.graphics.newImage, fileData)
          if not okImage or not image then
            return nil, "Could not create shader texture image"
          end
          pcall(image.setFilter, image, "nearest", "nearest")
          shaderTextures[uniform] = image
          pcall(shader.send, shader, uniform, image)
        end
      end
    end
  end

  if type(params.parameters) == "table" then
    for _, parameter in ipairs(params.parameters) do
      if type(parameter) == "table" then
        local uniform = safeString(parameter.uniform, "")
        local parameterType = safeString(parameter.type, "")
        local value = parameter.defaultValue
        if uniform ~= "" and parameterType ~= "texture" then
          if parameterType == "boolean" then
            value = value and tonumber(value) ~= 0 and 1 or 0
          elseif parameterType == "float" then
            value = tonumber(value) or 0
          elseif parameterType == "vec2" then
            value = type(value) == "table" and value or {}
            value = { tonumber(value[1]) or 0, tonumber(value[2]) or 0 }
          elseif parameterType == "vec3" then
            value = type(value) == "table" and value or {}
            value = { tonumber(value[1]) or 0, tonumber(value[2]) or 0, tonumber(value[3]) or 0 }
          elseif parameterType == "vec4" or parameterType == "color" then
            value = type(value) == "table" and value or {}
            value = { tonumber(value[1]) or 0, tonumber(value[2]) or 0, tonumber(value[3]) or 0, tonumber(value[4]) or 1 }
          end
          pcall(shader.send, shader, uniform, value)
        end
      end
    end
  end

  sys.shader = shader
  sys.shaderTextures = shaderTextures
  sys.shaderPath = path
  sys.shaderFilename = filename
  sys.shaderSource = source
  meta.shaderPath = path
  meta.shaderFilename = filename
  meta.shaderSource = source
  return true
end

function ParticleSystemPlaygroundPlugin:handleActionRequest(request)
  local params = request.params or {}
  local action = params.action
  local name = params.composite or self.activeComposite
  local index = math.max(1, safeNumber(params.systemIndex, self.activeSystem))

  if action == "new-composite" then
    return { composite = self:_newComposite(params.name, params.template) }
  end

  if action == "select-composite" then
    if params.composite and self.composites[params.composite] then
      if params.composite ~= self.activeComposite then
        pauseOtherScratchTimelines(self, params.composite)
      end
      self.activeComposite = params.composite
      self.activeSystem = 1
      if self.previewSessionActive then
        self.previewComposite = params.composite
      end
      self.timelineRuntimeActive = hasPlayingTimeline(self)
    end
    return true
  end

  if action == "select-system" then
    self.activeSystem = index
    return true
  end

  if action == "runtime-preview" then
    return self:_setRuntimePreviewActive(safeBoolean(params.active, false), params.composite)
  end

  if action == "import-project" then
    local imported, err = self:_importProject(params.project or params.projectRaw)
    if not imported then
      return nil, err
    end
    return { composite = imported }
  end

  local entry = name and self.composites[name]
  if not entry then
    return nil, "Composite not found"
  end

  if action == "delete-composite" then
    if entry.kind ~= "scratch" then
      return nil, "Only scratch composites can be deleted"
    end
    self:removeComposite(name)
    return true
  end

  if action == "add-system" then
    if entry.kind ~= "scratch" then
      return nil, "Only scratch composites can add emitters"
    end
    local newIndex = #entry.systems + 1
    entry.systems[newIndex] = createDefaultSystem(newIndex, params.template)
    captureTimelineBase(entry.systems[newIndex])
    entry.timeline = normalizeTimeline(entry.timeline, entry.systems)
    self.activeSystem = newIndex
    return { systemIndex = newIndex }
  end

  if action == "remove-system" then
    if entry.kind ~= "scratch" then
      return nil, "Only scratch composites can remove emitters"
    end
    if #entry.systems <= 1 then
      return nil, "A composite needs at least one emitter"
    end
    local sys = entry.systems[index]
    if sys and sys.system and sys.system.release then
      pcall(sys.system.release, sys.system)
    end
    local nextTimeline = removeTimelineTrack(entry.timeline, entry.systems, index)
    table.remove(entry.systems, index)
    for i, item in ipairs(entry.systems) do
      item.index = i
    end
    entry.timeline = normalizeTimeline(nextTimeline, entry.systems)
    self.activeSystem = remapSystemIndexAfterRemove(self.activeSystem, index, #entry.systems)
    return true
  end

  if action == "reorder-system" then
    if entry.kind ~= "scratch" then
      return nil, "Only scratch composites can be reordered"
    end
    local fromIdx = math.max(1, safeNumber(params.fromIndex, 0))
    local toIdx   = math.max(1, safeNumber(params.toIndex,   0))
    if fromIdx == toIdx or fromIdx < 1 or toIdx < 1 or fromIdx > #entry.systems or toIdx > #entry.systems then
      return true
    end
    local nextTimeline = reorderTimelineTrack(entry.timeline, entry.systems, fromIdx, toIdx)
    local moved = table.remove(entry.systems, fromIdx)
    table.insert(entry.systems, toIdx, moved)
    for i, item in ipairs(entry.systems) do
      item.index = i
    end
    entry.timeline = normalizeTimeline(nextTimeline, entry.systems)
    self.activeSystem = remapSystemIndexAfterReorder(self.activeSystem, fromIdx, toIdx)
    return true
  end

  if action == "set-timeline" then
    entry.timeline = normalizeTimeline(params.timeline, timelineSystemsForPlugin(self, name))
    entry.timelineState = entry.timelineState or { time = 0, playing = false, scrubVersion = 0 }
    entry.timelineState.time = math.min(safeNumber(entry.timelineState.time, 0), safeNumber(entry.timeline.duration, DEFAULT_TIMELINE_DURATION))
    applyTimelineAt(self, name, entry.timelineState.time)
    return true
  end

  if action == "timeline-control" then
    entry.timeline = normalizeTimeline(entry.timeline, timelineSystemsForPlugin(self, name))
    local state = ensureTimelineState(entry)
    local command = safeString(params.command, "")
    if command == "play" then
      pauseOtherScratchTimelines(self, name)
      local duration = math.max(0.25, safeNumber(entry.timeline.duration, DEFAULT_TIMELINE_DURATION))
      if not entry.timeline.loop and safeNumber(state.time, 0) >= duration then
        state.time = 0
        resetTimelineSystems(self, name)
      end
      applyTimelineAt(self, name, state.time or 0)
      state.playing = true
      self.timelineRuntimeActive = true
    elseif command == "pause" then
      if params.time ~= nil then
        local duration = math.max(0.25, safeNumber(entry.timeline.duration, DEFAULT_TIMELINE_DURATION))
        state.time = math.max(0, math.min(duration, safeNumber(params.time, state.time or 0)))
        applyTimelineAt(self, name, state.time, false)
      end
      state.playing = false
      self.timelineRuntimeActive = hasPlayingTimeline(self)
    elseif command == "stop" then
      seekTimeline(self, name, 0)
      state = ensureTimelineState(entry)
      state.playing = false
      self.timelineRuntimeActive = hasPlayingTimeline(self)
    elseif command == "seek" then
      seekTimeline(self, name, safeNumber(params.time, 0))
      self.timelineRuntimeActive = hasPlayingTimeline(self)
    end
    return true
  end

  if action == "set-texture" then
    return self:_applyTexture(name, index, params)
  end

  if action == "set-shader" then
    return self:_applyShader(name, index, params)
  end

  if action == "export-project" then
    local project, err = self:_projectForComposite(name)
    if not project then
      return nil, err
    end
    return {
      filename = projectFilename(project.name),
      project = project,
      download = {
        filename = projectFilename(project.name),
        extension = "featherparticles",
        content = json.encode(project),
      },
    }
  end

  local sys = self:_getSystemEntry(name, index)
  if not sys or not sys.system then
    return nil, "System not found"
  end

  if action == "emit" or action == "emit-all" then
    local count = math.max(1, safeNumber(params.count, 100))
    local composite = self:_getCompositeTable(name)
    local baseX = entry.kind == "scratch" and safeNumber(entry.x, DEFAULT_X) or safeNumber(composite and composite.x, 0)
    local baseY = entry.kind == "scratch" and safeNumber(entry.y, DEFAULT_Y) or safeNumber(composite and composite.y, 0)
    local offsetX = entry.kind == "scratch" and safeNumber(entry.offsetX, 0) or 0
    local offsetY = entry.kind == "scratch" and safeNumber(entry.offsetY, 0) or 0
    for i = 1, self:_systemCount(name) do
      local item = self:_getSystemEntry(name, i)
      if item and item.system and isSystemEnabled(item, self:_meta(name, i)) then
        item.system:reset()
        item.system:start()
        pcall(item.system.setPosition, item.system, baseX + offsetX + safeNumber(item.x, 0), baseY + offsetY + safeNumber(item.y, 0))
        item.system:emit(count)
      end
    end
    return true
  end

  if action == "reset" or action == "reset-all" then
    for i = 1, self:_systemCount(name) do
      local item = self:_getSystemEntry(name, i)
      if item and item.system and isSystemEnabled(item, self:_meta(name, i)) then
        item.system:reset()
        item.system:start()
      end
    end
    return true
  end

  if action == "kick-start" then
    if isSystemEnabled(sys, self:_meta(name, index)) then
      local steps = math.max(0, safeNumber(sys.kickStartSteps, 0))
      local dt = safeNumber(sys.kickStartDt, 1 / 60)
      for _ = 1, steps do
        sys.system:update(dt)
      end
    end
    return true
  end

  if action == "export-code" then
    return { clipboard = self:_generateCode(name), exportCode = self:_generateCode(name) }
  end

  if action == "export-zip" then
    return { zipAssets = self:_buildZip(name) }
  end

  return true
end

function ParticleSystemPlaygroundPlugin:_assetInfo(name, index, sys)
  local meta = self:_meta(name, index)
  local texturePath = safeString(meta.texturePath or sys.texturePath, "")
  local texturePreset = safeString(meta.texturePreset or sys.texturePreset, "")
  local textureFilename = sanitizeFilename(
    meta.textureFilename or sys.textureFilename or texturePath or texturePreset .. ".png",
    "texture.png"
  )
  local textureAssetBase64 = meta.textureAssetBase64 or sys.textureAssetBase64

  if textureAssetBase64 == nil and texturePath ~= "" then
    textureAssetBase64 = readFileBase64(texturePath)
  end

  if textureAssetBase64 == nil and texturePreset ~= "" then
    local _, png = generatePresetImage(texturePreset)
    textureAssetBase64 = png and base64.encode(png) or nil
    textureFilename = sanitizeFilename(texturePreset .. ".png", "texture.png")
  end

  local shaderPath = safeString(meta.shaderPath or sys.shaderPath, "")
  local shaderSource = safeString(meta.shaderSource or sys.shaderSource, "")
  local shaderFilename = sanitizeFilename(
    meta.shaderFilename or sys.shaderFilename or shaderPath or ("shader_" .. tostring(index) .. ".glsl"),
    "shader.glsl"
  )
  if shaderSource == "" and shaderPath ~= "" then
    local ok, source = pcall(love.filesystem.read, shaderPath)
    if ok and source then
      shaderSource = source
    end
  end

  return {
    texturePath = texturePath,
    texturePreset = texturePreset,
    textureFilename = textureFilename,
    textureAssetBase64 = textureAssetBase64,
    shaderPath = shaderPath,
    shaderSource = shaderSource,
    shaderFilename = shaderFilename,
  }
end

function ParticleSystemPlaygroundPlugin:_textureLoadPath(asset)
  if asset.texturePath ~= "" then
    return asset.texturePath
  end
  if asset.texturePreset ~= "" then
    return "particles/" .. sanitizeFilename(asset.textureFilename, "texture.png")
  end
  return sanitizeFilename(asset.textureFilename, "texture.png")
end

local function luaTimelineTable(timeline)
  local lines = { "{" }
  lines[#lines + 1] = "  duration = " .. fmt(timeline.duration) .. ","
  lines[#lines + 1] = "  loop = " .. tostring(timeline.loop == true) .. ","
  lines[#lines + 1] = "  tracks = {"
  for _, track in ipairs(timeline.tracks or {}) do
    lines[#lines + 1] = "    {"
    lines[#lines + 1] = "      systemIndex = " .. tostring(math.max(1, math.floor(safeNumber(track.systemIndex, 1)))) .. ","
    lines[#lines + 1] = "      clips = {"
    for _, clip in ipairs(track.clips or {}) do
      local parts = {
        "start = " .. fmt(clip.start),
        "[\"end\"] = " .. fmt(clip["end"]),
      }
      if clip.emit ~= nil then
        parts[#parts + 1] = "emit = " .. tostring(math.floor(safeNumber(clip.emit, 0)))
      end
      lines[#lines + 1] = "        { " .. table.concat(parts, ", ") .. " },"
    end
    lines[#lines + 1] = "      },"
    lines[#lines + 1] = "      lanes = {"
    for _, lane in ipairs(TIMELINE_LANES) do
      local points = track.lanes and track.lanes[lane]
      if type(points) == "table" and #points > 0 then
        lines[#lines + 1] = "        " .. lane .. " = {"
        for _, point in ipairs(points) do
          lines[#lines + 1] = "          { time = "
            .. fmt(point.time)
            .. ", value = "
            .. fmt(point.value)
            .. ", easing = "
            .. quote(normalizeTimelineEasing(point.easing))
            .. " },"
        end
        lines[#lines + 1] = "        },"
      end
    end
    lines[#lines + 1] = "      },"
    lines[#lines + 1] = "    },"
  end
  lines[#lines + 1] = "  },"
  lines[#lines + 1] = "}"
  return table.concat(lines, "\n")
end

local function appendIndentedSource(lines, source, indent)
  indent = indent or ""
  source = tostring(source or "")
  if source:sub(-1) ~= "\n" then
    source = source .. "\n"
  end
  for line in source:gmatch("([^\n]*)\n") do
    lines[#lines + 1] = indent .. line
  end
end

function ParticleSystemPlaygroundPlugin:_projectForComposite(name)
  local entry = self.composites[name]
  if not entry then
    return nil, "Composite not found"
  end

  local composite = self:_getCompositeTable(name)
  local systems = {}
  for i = 1, self:_systemCount(name) do
    local sys = self:_getSystemEntry(name, i) or {}
    local meta = self:_meta(name, i)
    local asset = self:_assetInfo(name, i, sys)
    systems[#systems + 1] = {
      index = i,
      title = safeString(meta.title or sys.title, "Emitter " .. tostring(i)),
      blendMode = safeString(sys.blendMode, "alpha"),
      enabled = isSystemEnabled(sys, meta),
      x = safeNumber(sys.x, 0),
      y = safeNumber(sys.y, 0),
      kickStartSteps = safeNumber(sys.kickStartSteps, 0),
      kickStartDt = safeNumber(sys.kickStartDt, 1 / 60),
      emitAtStart = safeNumber(sys.emitAtStart, 0),
      texturePath = asset.texturePath,
      texturePreset = asset.texturePreset,
      textureFilename = asset.textureFilename,
      textureAssetBase64 = asset.textureAssetBase64,
      shaderPath = asset.shaderPath,
      shaderFilename = asset.shaderSource ~= "" and asset.shaderFilename or "",
      shaderSource = asset.shaderSource,
      properties = snapshotSystemProperties(sys),
    }
  end

  return {
    type = PROJECT_TYPE,
    version = PROJECT_VERSION,
    exportedAt = os.date("!%Y-%m-%dT%H:%M:%SZ"),
    name = name,
    composite = {
      x = entry.kind == "scratch" and safeNumber(entry.x, DEFAULT_X) or safeNumber(composite and composite.x, 0),
      y = entry.kind == "scratch" and safeNumber(entry.y, DEFAULT_Y) or safeNumber(composite and composite.y, 0),
      previewEnabled = compositePreviewEnabled(entry),
      movement = entry.kind == "scratch" and entry.movement or { pattern = "none" },
      systems = systems,
      timeline = normalizeTimeline(entry.timeline, systems),
    },
  }
end

function ParticleSystemPlaygroundPlugin:_imageFromProjectSystem(systemData)
  local textureAssetBase64 = safeString(systemData.textureAssetBase64, "")
  if textureAssetBase64 ~= "" then
    local raw = decodeBase64(textureAssetBase64)
    if raw then
      local filename = sanitizeFilename(systemData.textureFilename, "texture.png")
      local okData, fileData = pcall(love.filesystem.newFileData, raw, filename)
      if okData and fileData then
        local okImage, image = pcall(love.graphics.newImage, fileData)
        if okImage and image then
          pcall(image.setFilter, image, "linear", "linear")
          return image, textureAssetBase64
        end
      end
    end
  end

  local texturePath = safeString(systemData.texturePath, "")
  if texturePath ~= "" then
    local okImage, image = pcall(love.graphics.newImage, texturePath)
    if okImage and image then
      pcall(image.setFilter, image, "linear", "linear")
      return image, nil
    end
  end

  local texturePreset = safeString(systemData.texturePreset, "")
  if texturePreset ~= "" then
    local image, png = generatePresetImage(texturePreset)
    if image then
      pcall(image.setFilter, image, "linear", "linear")
      return image, png and base64.encode(png) or nil
    end
  end

  local image, png = generatePresetImage("circle")
  if image then
    pcall(image.setFilter, image, "linear", "linear")
    return image, png and base64.encode(png) or nil
  end

  return nil, nil
end

function ParticleSystemPlaygroundPlugin:_systemFromProject(index, systemData)
  if type(systemData) ~= "table" then
    return nil, "Project emitter is invalid"
  end
  local image, recoveredBase64 = self:_imageFromProjectSystem(systemData)
  if not image then
    return nil, "Could not create particle texture"
  end

  local properties = type(systemData.properties) == "table" and systemData.properties or {}
  local bufferSize = math.max(1, math.floor(safeNumber(properties.bufferSize or properties.count, DEFAULT_BUFFER_SIZE)))
  local ps = love.graphics.newParticleSystem(image, bufferSize)

  local sys = {
    index = index,
    system = ps,
    _ownedImage = image,
    title = safeString(systemData.title, "Emitter " .. tostring(index)),
    blendMode = safeString(systemData.blendMode, "alpha"),
    enabled = safeBoolean(systemData.enabled, true),
    x = safeNumber(systemData.x, 0),
    y = safeNumber(systemData.y, 0),
    kickStartSteps = safeNumber(systemData.kickStartSteps, 0),
    kickStartDt = safeNumber(systemData.kickStartDt, 1 / 60),
    emitAtStart = safeNumber(systemData.emitAtStart, 0),
    texturePath = safeString(systemData.texturePath, ""),
    texturePreset = safeString(systemData.texturePreset, ""),
    textureFilename = sanitizeFilename(systemData.textureFilename, "texture.png"),
    textureAssetBase64 = safeString(systemData.textureAssetBase64, "") ~= "" and safeString(systemData.textureAssetBase64, "") or recoveredBase64,
    shaderPath = safeString(systemData.shaderPath, ""),
    shaderFilename = safeString(systemData.shaderFilename, ""),
    shaderSource = safeString(systemData.shaderSource, ""),
  }

  for key, value in pairs(properties) do
    setProp(ps, key, value)
  end

  if sys.shaderSource ~= "" then
    local okShader, shader = pcall(love.graphics.newShader, sys.shaderSource)
    if okShader and shader then
      sys.shader = shader
    end
  end

  captureTimelineBase(sys)
  ps:start()
  return sys
end

function ParticleSystemPlaygroundPlugin:_importProject(project)
  if type(project) == "string" then
    local ok, decoded = pcall(json.decode, project)
    if not ok then
      return nil, "Particle project JSON is invalid"
    end
    project = decoded
  end

  if
    type(project) ~= "table"
    or project.type ~= PROJECT_TYPE
    or (project.version ~= 1 and project.version ~= PROJECT_VERSION)
  then
    return nil, "Unsupported particle project file"
  end
  local composite = project.composite
  if type(composite) ~= "table" or type(composite.systems) ~= "table" or #composite.systems == 0 then
    return nil, "Particle project is missing emitters"
  end

  local name = self:_uniqueCompositeName(project.name)
  local systems = {}
  for i, systemData in ipairs(composite.systems) do
    local sys, err = self:_systemFromProject(i, systemData)
    if not sys then
      for _, existing in ipairs(systems) do
        if existing.system and existing.system.release then
          pcall(existing.system.release, existing.system)
        end
      end
      return nil, err
    end
    systems[i] = sys
  end

  self.composites[name] = {
    kind = "scratch",
    name = name,
    x = safeNumber(composite.x, DEFAULT_X),
    y = safeNumber(composite.y, DEFAULT_Y),
    previewEnabled = safeBoolean(composite.previewEnabled, true),
    movement = type(composite.movement) == "table"
        and composite.movement
      or { pattern = "none", radius = 50, radiusX = 80, radiusY = 40, speed = 1, scale = 50 },
    offsetX = 0,
    offsetY = 0,
    systems = systems,
    timeline = normalizeTimeline(project.version == 1 and nil or composite.timeline, systems),
    timelineState = { time = 0, playing = false, scrubVersion = 0 },
  }
  self.compositeOrder[#self.compositeOrder + 1] = name
  pauseOtherScratchTimelines(self, name)
  self.activeComposite = name
  self.activeSystem = 1
  if self.previewSessionActive then
    self.previewComposite = name
  end
  applyTimelineAt(self, name, 0)
  self.timelineRuntimeActive = hasPlayingTimeline(self)

  return name
end

function ParticleSystemPlaygroundPlugin:_generateCode(name)
  local count = self:_systemCount(name)
  local entry = self.composites[name]
  if not entry or count == 0 then
    return "-- No Particles Playground composite selected"
  end

  local imageVars = {}
  local shaderVars = {}
  local imageCount = 0
  local shaderCount = 0
  local hasShaders = false
  local timeline = normalizeTimeline(entry.timeline, timelineSystemsForPlugin(self, name))
  local lines = {
    "-- Generated by Feather Particles Playground",
    "-- " .. os.date("%Y-%m-%d %H:%M:%S"),
    "local LG = love.graphics",
    "",
    "---@class ParticlePayload",
    "---@field x? number",
    "---@field y? number",
    "---@field r? number",
    "---@field loop? boolean",
    "---@field systemIndex? integer",
    "",
    "local systems = {}",
    "local particles = { x = " .. fmt(entry.x or 0) .. ", y = " .. fmt(entry.y or 0) .. ", systems = systems }",
    "local timeline = " .. luaTimelineTable(timeline),
    "local timelineState = { time = 0, playing = false, loop = nil, directionOffset = 0 }",
    "local release",
    "",
  }

  for i = 1, count do
    local sys = self:_getSystemEntry(name, i)
    if sys then
      local asset = self:_assetInfo(name, i, sys)
      local imageKey = self:_textureLoadPath(asset)
      if not imageVars[imageKey] then
        imageCount = imageCount + 1
        local var = "image" .. tostring(imageCount)
        imageVars[imageKey] = var
        local loadPath = self:_textureLoadPath(asset)
        lines[#lines + 1] = "local " .. var .. " = LG.newImage(" .. quote(loadPath) .. ")"
        lines[#lines + 1] = var .. ':setFilter("linear", "linear")'
      end

      if asset.shaderSource ~= "" then
        hasShaders = true
        local shaderKey = asset.shaderSource
        if not shaderVars[shaderKey] then
          shaderCount = shaderCount + 1
          local var = "shader" .. tostring(shaderCount)
          shaderVars[shaderKey] = var
          lines[#lines + 1] = "local " .. var .. "Raw = " .. longQuote(asset.shaderSource)
          lines[#lines + 1] = "local " .. var .. " = compileShader(" .. quote(asset.shaderFilename) .. ", " .. var .. "Raw)"
        end
      end
    end
  end

  if hasShaders then
    table.insert(lines, 16, "local function compileShader(name, source)")
    table.insert(lines, 17, "  local ok, shader = pcall(LG.newShader, source)")
    table.insert(lines, 18, "  if ok then")
    table.insert(lines, 19, "    return shader")
    table.insert(lines, 20, "  end")
    table.insert(lines, 21, "  print(\"[Particles] Could not compile shader \" .. tostring(name) .. \": \" .. tostring(shader))")
    table.insert(lines, 22, "  return nil")
    table.insert(lines, 23, "end")
    table.insert(lines, 24, "")
  end

  lines[#lines + 1] = ""
  lines[#lines + 1] = "---@return table"
  lines[#lines + 1] = "local function init()"
  lines[#lines + 1] = "  release()"

  for i = 1, count do
    local sys = self:_getSystemEntry(name, i)
    if sys and sys.system then
      local ps = sys.system
      local properties = snapshotSystemProperties(sys)
      local asset = self:_assetInfo(name, i, sys)
      local imageKey = self:_textureLoadPath(asset)
      local imageVar = imageVars[imageKey]
      local psVar = "ps" .. tostring(i)
      lines[#lines + 1] = "  local "
        .. psVar
        .. " = LG.newParticleSystem("
        .. imageVar
        .. ", "
        .. tostring(math.max(1, math.floor(safeNumber(properties.bufferSize, ps:getBufferSize()))))
        .. ")"

      local colors = parseNumberList(properties.colors)
      if #colors == 0 then
        colors = { ps:getColors() }
      end
      if #colors > 0 then
        local parts = {}
        for _, value in ipairs(colors) do
          if type(value) == "table" then
            for _, item in ipairs(value) do
              parts[#parts + 1] = fmt(item)
            end
          else
            parts[#parts + 1] = fmt(value)
          end
        end
        lines[#lines + 1] = "  " .. psVar .. ":setColors(" .. table.concat(parts, ", ") .. ")"
      end

      local dist, dx, dy, angle, rel = ps:getEmissionArea()
      local xmin, ymin, xmax, ymax = ps:getLinearAcceleration()
      local dampMin, dampMax = ps:getLinearDamping()
      local lifeMin, lifeMax = ps:getParticleLifetime()
      local radialMin, radialMax = ps:getRadialAcceleration()
      local rotMin, rotMax = ps:getRotation()
      local speedMin, speedMax = ps:getSpeed()
      local spinMin, spinMax = ps:getSpin()
      local tangentMin, tangentMax = ps:getTangentialAcceleration()
      local offsetX, offsetY = ps:getOffset()
      dist = safeString(properties.emissionAreaDist, dist)
      dx = safeNumber(properties.emissionAreaDx, dx)
      dy = safeNumber(properties.emissionAreaDy, dy)
      angle = safeNumber(properties.emissionAreaAngle, angle)
      rel = safeBoolean(properties.emissionAreaRelative, rel)
      xmin = safeNumber(properties.linearAccelXMin, xmin)
      ymin = safeNumber(properties.linearAccelYMin, ymin)
      xmax = safeNumber(properties.linearAccelXMax, xmax)
      ymax = safeNumber(properties.linearAccelYMax, ymax)
      dampMin = safeNumber(properties.linearDampingMin, dampMin)
      dampMax = safeNumber(properties.linearDampingMax, dampMax)
      lifeMin = safeNumber(properties.particleLifetimeMin, lifeMin)
      lifeMax = safeNumber(properties.particleLifetimeMax, lifeMax)
      radialMin = safeNumber(properties.radialAccelMin, radialMin)
      radialMax = safeNumber(properties.radialAccelMax, radialMax)
      rotMin = safeNumber(properties.rotationMin, rotMin)
      rotMax = safeNumber(properties.rotationMax, rotMax)
      speedMin = safeNumber(properties.speedMin, speedMin)
      speedMax = safeNumber(properties.speedMax, speedMax)
      spinMin = safeNumber(properties.spinMin, spinMin)
      spinMax = safeNumber(properties.spinMax, spinMax)
      tangentMin = safeNumber(properties.tangentialAccelMin, tangentMin)
      tangentMax = safeNumber(properties.tangentialAccelMax, tangentMax)
      offsetX = safeNumber(properties.offsetX, offsetX)
      offsetY = safeNumber(properties.offsetY, offsetY)
      local sizes = parseNumberList(properties.sizes)
      if #sizes == 0 then
        sizes = { ps:getSizes() }
      end
      local sizeParts = {}
      for _, value in ipairs(sizes) do
        sizeParts[#sizeParts + 1] = fmt(value)
      end

      lines[#lines + 1] = "  " .. psVar .. ":setDirection(" .. fmt(safeNumber(properties.direction, ps:getDirection())) .. ")"
      lines[#lines + 1] = "  " .. psVar
        .. ":setEmissionArea("
        .. quote(dist)
        .. ", "
        .. fmt(dx)
        .. ", "
        .. fmt(dy)
        .. ", "
        .. fmt(angle)
        .. ", "
        .. tostring(rel)
        .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setEmissionRate(" .. fmt(safeNumber(properties.emissionRate, ps:getEmissionRate())) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setEmitterLifetime(" .. fmt(safeNumber(properties.emitterLifetime, ps:getEmitterLifetime())) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setInsertMode(" .. quote(safeString(properties.insertMode, ps:getInsertMode())) .. ")"
      lines[#lines + 1] = "  " .. psVar
        .. ":setLinearAcceleration("
        .. table.concat({ fmt(xmin), fmt(ymin), fmt(xmax), fmt(ymax) }, ", ")
        .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setLinearDamping(" .. fmt(dampMin) .. ", " .. fmt(dampMax) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setOffset(" .. fmt(offsetX) .. ", " .. fmt(offsetY) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setParticleLifetime(" .. fmt(lifeMin) .. ", " .. fmt(lifeMax) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setRadialAcceleration(" .. fmt(radialMin) .. ", " .. fmt(radialMax) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setRelativeRotation(" .. tostring(safeBoolean(properties.relativeRotation, ps:hasRelativeRotation())) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setRotation(" .. fmt(rotMin) .. ", " .. fmt(rotMax) .. ")"
      if #sizeParts > 0 then
        lines[#lines + 1] = "  " .. psVar .. ":setSizes(" .. table.concat(sizeParts, ", ") .. ")"
      end
      lines[#lines + 1] = "  " .. psVar .. ":setSizeVariation(" .. fmt(safeNumber(properties.sizeVariation, ps:getSizeVariation())) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setSpeed(" .. fmt(speedMin) .. ", " .. fmt(speedMax) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setSpin(" .. fmt(spinMin) .. ", " .. fmt(spinMax) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setSpinVariation(" .. fmt(safeNumber(properties.spinVariation, ps:getSpinVariation())) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setSpread(" .. fmt(safeNumber(properties.spread, ps:getSpread())) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setTangentialAcceleration(" .. fmt(tangentMin) .. ", " .. fmt(tangentMax) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setPosition(particles.x + " .. fmt(sys.x or 0) .. ", particles.y + " .. fmt(sys.y or 0) .. ")"

      local shaderKey = asset.shaderSource
      local shaderValue = shaderVars[shaderKey] or "nil"
      local enabledValue = isSystemEnabled(sys, self:_meta(name, i))
      lines[#lines + 1] = "  systems["
        .. tostring(i)
        .. "] = { system = "
        .. psVar
        .. ", enabled = "
        .. tostring(enabledValue)
        .. ", kickStartSteps = "
        .. tostring(math.floor(safeNumber(sys.kickStartSteps, 0)))
        .. ", kickStartDt = "
        .. fmt(sys.kickStartDt or (1 / 60))
        .. ", emitAtStart = "
        .. tostring(math.floor(safeNumber(sys.emitAtStart, 0)))
        .. ", blendMode = "
        .. quote(sys.blendMode or "alpha")
        .. ", shader = "
        .. shaderValue
        .. ", texturePreset = "
        .. quote(asset.texturePreset)
        .. ", texturePath = "
        .. quote(asset.texturePath)
        .. ", shaderPath = "
        .. quote(asset.shaderPath)
        .. ", shaderFilename = "
        .. quote(asset.shaderSource ~= "" and asset.shaderFilename or "")
        .. ", x = "
        .. fmt(sys.x or 0)
        .. ", y = "
        .. fmt(sys.y or 0)
        .. ", opacity = 1, base = { emissionRate = "
        .. fmt(safeNumber(properties.emissionRate, ps:getEmissionRate()))
        .. ", emitterLifetime = "
        .. fmt(safeNumber(properties.emitterLifetime, ps:getEmitterLifetime()))
        .. ", speedMin = "
        .. fmt(speedMin)
        .. ", speedMax = "
        .. fmt(speedMax)
        .. ", sizes = { "
        .. table.concat(sizeParts, ", ")
        .. " }, direction = "
        .. fmt(safeNumber(properties.direction, ps:getDirection()))
        .. ", spread = "
        .. fmt(safeNumber(properties.spread, ps:getSpread()))
        .. ", offsetX = "
        .. fmt(offsetX)
        .. ", offsetY = "
        .. fmt(offsetY)
        .. " }"
        .. " }"
      lines[#lines + 1] = "  for _ = 1, systems[" .. tostring(i) .. "].enabled and systems[" .. tostring(i) .. "].kickStartSteps or 0 do"
      lines[#lines + 1] = "    " .. psVar .. ":update(systems[" .. tostring(i) .. "].kickStartDt)"
      lines[#lines + 1] = "  end"
      lines[#lines + 1] = "  if systems[" .. tostring(i) .. "].enabled and systems[" .. tostring(i) .. "].emitAtStart > 0 then"
      lines[#lines + 1] = "    " .. psVar .. ":emit(systems[" .. tostring(i) .. "].emitAtStart)"
      lines[#lines + 1] = "  end"
    end
  end

  lines[#lines + 1] = ""
  lines[#lines + 1] = "  return particles"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local TimelineRuntime = (function()"
  appendIndentedSource(lines, TIMELINE_RUNTIME_SOURCE, "  ")
  lines[#lines + 1] = "end)()"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local function applyTimeline(time, allowEmission)"
  lines[#lines + 1] = "  for index, track in ipairs(timeline.tracks or {}) do"
  lines[#lines + 1] = "    local emitter = systems[index]"
  lines[#lines + 1] = "    if emitter and emitter.enabled and emitter.system then"
  lines[#lines + 1] = "      TimelineRuntime.applyTimelineToEmitter(emitter, track, time, allowEmission == true, {"
  lines[#lines + 1] = "        base = emitter.base or {},"
  lines[#lines + 1] = "        directionOffset = timelineState.directionOffset or 0,"
  lines[#lines + 1] = "        opacityField = \"opacity\","
  lines[#lines + 1] = "      })"
  lines[#lines + 1] = "    end"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local function clipBurstCount(clip, emitter)"
  lines[#lines + 1] = "  local base = tonumber(clip.emit)"
  lines[#lines + 1] = "  if base == nil then base = tonumber(emitter.emitAtStart) end"
  lines[#lines + 1] = "  return math.max(0, math.floor(base or 0))"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local function emitTimelineStarts(previousTime, nextTime)"
  lines[#lines + 1] = "  for index, track in ipairs(timeline.tracks or {}) do"
  lines[#lines + 1] = "    local emitter = systems[index]"
  lines[#lines + 1] = "    if emitter and emitter.enabled and emitter.system then"
  lines[#lines + 1] = "      for _, clip in ipairs(track.clips or {}) do"
  lines[#lines + 1] = "        local start = tonumber(clip.start) or 0"
  lines[#lines + 1] = "        if previousTime <= start and nextTime >= start then"
  lines[#lines + 1] = "          local count = clipBurstCount(clip, emitter)"
  lines[#lines + 1] = "          emitter.system:setEmitterLifetime((emitter.base and emitter.base.emitterLifetime) or -1)"
  lines[#lines + 1] = "          emitter.system:start()"
  lines[#lines + 1] = "          if count > 0 then emitter.system:emit(count) end"
  lines[#lines + 1] = "        end"
  lines[#lines + 1] = "      end"
  lines[#lines + 1] = "    end"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local function emitTimelineStartsForAdvance(previousTime, elapsed)"
  lines[#lines + 1] = "  if elapsed <= 0 then return previousTime end"
  lines[#lines + 1] = "  local cursor = previousTime"
  lines[#lines + 1] = "  local remaining = elapsed"
  lines[#lines + 1] = "  local guard = 0"
  lines[#lines + 1] = "  while remaining > 0 and guard < 128 do"
  lines[#lines + 1] = "    if cursor >= timeline.duration then cursor = 0 end"
  lines[#lines + 1] = "    local room = math.max(0, timeline.duration - cursor)"
  lines[#lines + 1] = "    if room <= 0 then cursor = 0; room = timeline.duration end"
  lines[#lines + 1] = "    local segment = math.min(remaining, room)"
  lines[#lines + 1] = "    local nextCursor = cursor + segment"
  lines[#lines + 1] = "    if segment > 0 then emitTimelineStarts(cursor, nextCursor) end"
  lines[#lines + 1] = "    remaining = remaining - segment"
  lines[#lines + 1] = "    cursor = nextCursor"
  lines[#lines + 1] = "    if remaining > 0 and cursor >= timeline.duration then cursor = 0 end"
  lines[#lines + 1] = "    guard = guard + 1"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = "  return cursor >= timeline.duration and 0 or cursor"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local function timelineShouldLoop()"
  lines[#lines + 1] = "  if timelineState.loop ~= nil then return timelineState.loop == true end"
  lines[#lines + 1] = "  return timeline.loop == true"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local function setLoop(loop)"
  lines[#lines + 1] = "  if type(loop) == \"boolean\" then"
  lines[#lines + 1] = "    timelineState.loop = loop"
  lines[#lines + 1] = "  else"
  lines[#lines + 1] = "    timelineState.loop = nil"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = "  return timelineShouldLoop()"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local function resetTimeline()"
  lines[#lines + 1] = "  for _, emitter in ipairs(systems) do"
  lines[#lines + 1] = "    if emitter.enabled and emitter.system then"
  lines[#lines + 1] = "      emitter.system:reset()"
  lines[#lines + 1] = "      emitter.system:setEmitterLifetime((emitter.base and emitter.base.emitterLifetime) or -1)"
  lines[#lines + 1] = "      emitter.system:start()"
  lines[#lines + 1] = "    end"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local function update(dt)"
  lines[#lines + 1] = "  if timelineState.playing then"
  lines[#lines + 1] = "    local previous = timelineState.time"
  lines[#lines + 1] = "    local nextTime = previous + dt"
  lines[#lines + 1] = "    if nextTime > timeline.duration then"
  lines[#lines + 1] = "      if timelineShouldLoop() then"
  lines[#lines + 1] = "        nextTime = emitTimelineStartsForAdvance(previous, dt)"
  lines[#lines + 1] = "      else"
  lines[#lines + 1] = "        emitTimelineStarts(previous, timeline.duration)"
  lines[#lines + 1] = "        nextTime = timeline.duration"
  lines[#lines + 1] = "        timelineState.playing = false"
  lines[#lines + 1] = "      end"
  lines[#lines + 1] = "    else"
  lines[#lines + 1] = "      emitTimelineStarts(previous, nextTime)"
  lines[#lines + 1] = "    end"
  lines[#lines + 1] = "    timelineState.time = nextTime"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = "  applyTimeline(timelineState.time, timelineState.playing)"
  lines[#lines + 1] = "  for _, emitter in ipairs(systems) do"
  lines[#lines + 1] = "    if emitter.enabled and emitter.system then"
  lines[#lines + 1] = "      emitter.system:update(dt)"
  lines[#lines + 1] = "    end"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local function draw()"
  lines[#lines + 1] = "  local previousBlend, previousAlphaMode = LG.getBlendMode()"
  lines[#lines + 1] = "  local previousShader = LG.getShader()"
  lines[#lines + 1] = "  local r, g, b, a = LG.getColor()"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "  for _, emitter in ipairs(systems) do"
  lines[#lines + 1] = "    if emitter.enabled and emitter.system then"
  lines[#lines + 1] = "      LG.setBlendMode(emitter.blendMode or \"alpha\")"
  lines[#lines + 1] = "      if emitter.shader and emitter.shader.send and love.timer then"
  lines[#lines + 1] = "        pcall(emitter.shader.send, emitter.shader, \"u_time\", love.timer.getTime())"
  lines[#lines + 1] = "      end"
  lines[#lines + 1] = "      LG.setShader(emitter.shader)"
  lines[#lines + 1] = "      LG.setColor(1, 1, 1, emitter.opacity or 1)"
  lines[#lines + 1] = "      LG.draw(emitter.system, 0, 0)"
  lines[#lines + 1] = "    end"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "  LG.setBlendMode(previousBlend, previousAlphaMode)"
  lines[#lines + 1] = "  LG.setShader(previousShader)"
  lines[#lines + 1] = "  LG.setColor(r, g, b, a)"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "---Play the authored particle timeline."
  lines[#lines + 1] = "---@param payload ParticlePayload"
  lines[#lines + 1] = "local function play(payload)"
  lines[#lines + 1] = "  if type(payload) ~= \"table\" then"
  lines[#lines + 1] = "    payload = {}"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "  local x = tonumber(payload.x) or particles.x"
  lines[#lines + 1] = "  local y = tonumber(payload.y) or particles.y"
  lines[#lines + 1] = "  local r = tonumber(payload.r) or 0"
  lines[#lines + 1] = "  local index = tonumber(payload.systemIndex)"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "  for i, emitter in ipairs(systems) do"
  lines[#lines + 1] = "    if emitter.enabled and emitter.system and (not index or index == i) then"
  lines[#lines + 1] = "      emitter.system:reset()"
  lines[#lines + 1] = "      emitter.system:setEmitterLifetime((emitter.base and emitter.base.emitterLifetime) or -1)"
  lines[#lines + 1] = "      emitter.system:start()"
  lines[#lines + 1] = "      emitter.system:setPosition(x + (emitter.x or 0), y + (emitter.y or 0))"
  lines[#lines + 1] = "    end"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = "  timelineState.time = 0"
  lines[#lines + 1] = "  timelineState.playing = true"
  lines[#lines + 1] = "  timelineState.directionOffset = r"
  lines[#lines + 1] = "  setLoop(payload.loop)"
  lines[#lines + 1] = "  applyTimeline(0, true)"
  lines[#lines + 1] = "  emitTimelineStarts(0, 0)"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "  return true"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local function pause()"
  lines[#lines + 1] = "  timelineState.playing = false"
  lines[#lines + 1] = "  applyTimeline(timelineState.time, false)"
  lines[#lines + 1] = "  return true"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local function stop(resetParticles)"
  lines[#lines + 1] = "  timelineState.time = 0"
  lines[#lines + 1] = "  timelineState.playing = false"
  lines[#lines + 1] = "  timelineState.loop = nil"
  lines[#lines + 1] = "  timelineState.directionOffset = 0"
  lines[#lines + 1] = "  if resetParticles ~= false then resetTimeline() end"
  lines[#lines + 1] = "  applyTimeline(0, false)"
  lines[#lines + 1] = "  return true"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local function emit(payload)"
  lines[#lines + 1] = "  return play(payload)"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "release = function()"
  lines[#lines + 1] = "  for i, emitter in ipairs(systems) do"
  lines[#lines + 1] = "    if emitter.system then"
  lines[#lines + 1] = "      emitter.system:release()"
  lines[#lines + 1] = "    end"
  lines[#lines + 1] = "    systems[i] = nil"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = "  return true"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "return {"
  lines[#lines + 1] = "  init = init,"
  lines[#lines + 1] = "  draw = draw,"
  lines[#lines + 1] = "  update = update,"
  lines[#lines + 1] = "  play = play,"
  lines[#lines + 1] = "  pause = pause,"
  lines[#lines + 1] = "  stop = stop,"
  lines[#lines + 1] = "  setLoop = setLoop,"
  lines[#lines + 1] = "  isLooping = timelineShouldLoop,"
  lines[#lines + 1] = "  emit = emit,"
  lines[#lines + 1] = "  release = release,"
  lines[#lines + 1] = "}"
  return table.concat(lines, "\n")
end

function ParticleSystemPlaygroundPlugin:_buildZip(name)
  local files = {
    { name = "init.lua", data = self:_generateCode(name), encoding = "text" },
  }
  local seen = { ["init.lua"] = true }

  for i = 1, self:_systemCount(name) do
    local sys = self:_getSystemEntry(name, i)
    if sys then
      local asset = self:_assetInfo(name, i, sys)
      if asset.textureAssetBase64 then
        local filename = self:_textureLoadPath(asset)
        if asset.texturePath ~= "" then
          filename = archivePath(asset.texturePath, asset.textureFilename)
        end
        if not seen[filename] then
          seen[filename] = true
          files[#files + 1] = { name = filename, data = asset.textureAssetBase64, encoding = "base64" }
        end
      end
    end
  end

  return {
    filename = sanitizeFilename(name or "particle-system-playground", "particle-system-playground") .. ".zip",
    files = files,
  }
end

function ParticleSystemPlaygroundPlugin:getConfig()
  return {
    type = "particle-system-playground",
    icon = "sparkles",
  }
end

return ParticleSystemPlaygroundPlugin
