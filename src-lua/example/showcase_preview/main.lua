-- Standalone LÖVE preview target for the Feather showcase.
-- Polls window._featherPayload (set by the postMessage bridge in player.js)
-- via love.js.eval and renders live shader graph and particle system previews.

pcall(require, "normalize1")
pcall(require, "normalize2")

local _loveJs = type(love) == "table" and rawget(love, "js") or nil
local isLoveJs = type(_loveJs) == "table" and type(rawget(_loveJs, "eval")) == "function"
local _jsEval = isLoveJs and _loveJs.eval or nil

local PreviewRuntime = require("shader-graph.preview_runtime")

-- Minimal JSON parser

local function parseJson(src)
  local pos = 1
  local function skip()
    while pos <= #src and src:byte(pos) <= 32 do
      pos = pos + 1
    end
  end
  local parseValue
  local function parseStr()
    pos = pos + 1
    local buf = {}
    while pos <= #src do
      local c = src:sub(pos, pos)
      if c == '"' then
        pos = pos + 1
        break
      elseif c == "\\" then
        local e = src:sub(pos + 1, pos + 1)
        if e == "n" then
          buf[#buf + 1] = "\n"
        elseif e == "t" then
          buf[#buf + 1] = "\t"
        elseif e == "r" then
          buf[#buf + 1] = "\r"
        elseif e == '"' then
          buf[#buf + 1] = '"'
        elseif e == "\\" then
          buf[#buf + 1] = "\\"
        elseif e == "/" then
          buf[#buf + 1] = "/"
        else
          buf[#buf + 1] = e
        end
        pos = pos + 2
      else
        buf[#buf + 1] = c
        pos = pos + 1
      end
    end
    return table.concat(buf)
  end
  local function parseObj()
    pos = pos + 1
    skip()
    local obj = {}
    if src:sub(pos, pos) == "}" then
      pos = pos + 1
      return obj
    end
    while true do
      skip()
      local k = parseStr()
      skip()
      pos = pos + 1
      skip()
      obj[k] = parseValue()
      skip()
      if src:sub(pos, pos) == "}" then
        pos = pos + 1
        break
      end
      pos = pos + 1
    end
    return obj
  end
  local function parseArr()
    pos = pos + 1
    skip()
    local arr = {}
    if src:sub(pos, pos) == "]" then
      pos = pos + 1
      return arr
    end
    while true do
      skip()
      arr[#arr + 1] = parseValue()
      skip()
      if src:sub(pos, pos) == "]" then
        pos = pos + 1
        break
      end
      pos = pos + 1
    end
    return arr
  end
  parseValue = function()
    skip()
    local c = src:sub(pos, pos)
    if c == '"' then
      return parseStr()
    elseif c == "{" then
      return parseObj()
    elseif c == "[" then
      return parseArr()
    elseif src:sub(pos, pos + 3) == "true" then
      pos = pos + 4
      return true
    elseif src:sub(pos, pos + 4) == "false" then
      pos = pos + 5
      return false
    elseif src:sub(pos, pos + 3) == "null" then
      pos = pos + 4
      return nil
    else
      local num, np = src:match("^(-?%d+%.?%d*[eE]?[+-]?%d*)()", pos)
      if num then
        pos = np
        return tonumber(num)
      end
    end
  end
  local ok, v = pcall(parseValue)
  return ok and v or nil
end

local function parseCsvNumbers(s)
  local vals = {}
  for part in tostring(s or ""):gmatch("[^,]+") do
    local n = tonumber(part)
    if n then
      vals[#vals + 1] = n
    end
  end
  return vals
end

local function jsString(value)
  value = tostring(value or "")
  value = value:gsub("\\", "\\\\")
  value = value:gsub('"', '\\"')
  value = value:gsub("\n", "\\n")
  value = value:gsub("\r", "\\r")
  return '"' .. value .. '"'
end

local function hydrateUpload(upload)
  if type(upload) ~= "table" then
    return upload
  end
  if type(upload.dataBase64) == "string" and upload.dataBase64 ~= "" then
    return upload
  end
  if not _jsEval or type(upload.dataKey) ~= "string" then
    return upload
  end

  local length = tonumber(upload.dataLength) or 0
  if length <= 0 then
    return upload
  end

  local chunks = {}
  local chunkSize = 32768
  local offset = 0
  while offset < length do
    local remaining = math.min(chunkSize, length - offset)
    local expression = string.format(
      "window._featherUploadChunk && window._featherUploadChunk(%s,%d,%d) || ''",
      jsString(upload.dataKey),
      offset,
      remaining
    )
    local ok, chunk = pcall(_jsEval, expression)
    if not ok or type(chunk) ~= "string" or chunk == "" then
      return upload
    end
    chunks[#chunks + 1] = chunk
    offset = offset + remaining
  end

  local copy = {}
  for key, value in pairs(upload) do
    copy[key] = value
  end
  copy.dataBase64 = table.concat(chunks)
  return copy
end

local function hydrateUploadList(uploads)
  if type(uploads) ~= "table" then
    return uploads
  end
  local hydrated = {}
  for index, upload in ipairs(uploads) do
    hydrated[index] = hydrateUpload(upload)
  end
  return hydrated
end

-- Grid

local function drawGrid(w, h)
  love.graphics.setColor(0.58, 0.64, 0.72, 0.12)
  love.graphics.setLineWidth(1)
  for x = 0, w, 32 do
    love.graphics.line(x, 0, x, h)
  end
  for y = 0, h, 32 do
    love.graphics.line(0, y, w, y)
  end
end

-- Preset particle textures

local TWO_PI = math.pi * 2
local presetImageCache = {}

local function generatePresetImage(name)
  if presetImageCache[name] then
    return presetImageCache[name]
  end
  local size = 64
  local data = love.image.newImageData(size, size)
  local cx, cy = (size - 1) / 2, (size - 1) / 2
  local radius = size / 2 - 1
  data:mapPixel(function(x, y)
    local dx, dy = x - cx, y - cy
    local dist = math.sqrt(dx * dx + dy * dy)
    local angle = math.atan2(dy, dx)
    local alpha
    if name == "ring" then
      alpha = (dist > radius * 0.62 and dist < radius * 0.9) and 1 or 0
    elseif name == "light" then
      local t = math.min(1, dist / radius)
      alpha = (1 - t) * (1 - t)
    elseif name == "star" then
      local wave = (math.cos(angle * 5) + 1) / 2
      local edge = radius * (0.48 + wave * 0.42)
      alpha = dist <= edge and 1 or 0
    elseif name == "spiral" then
      local t = dist / radius
      local target = t * TWO_PI * 2.6
      local delta = math.abs(((angle - target + math.pi) % TWO_PI) - math.pi)
      alpha = (delta < 0.2 and t < 0.96) and 1 or 0
    else
      alpha = dist <= radius and 1 or 0
    end
    return 1, 1, 1, math.max(0, math.min(1, alpha or 0))
  end)
  local img = love.graphics.newImage(data)
  presetImageCache[name] = img
  return img
end

-- Shader preview

local shaderState = {
  shader = nil,
  drawable = nil,
  shape = "circle",
  name = "shader graph",
  zoom = 1,
}

local function normalizePreviewZoom(value)
  value = tonumber(value) or 1
  if value < 0.4 then
    return 0.4
  elseif value > 2.5 then
    return 2.5
  end
  return value
end

local function applyShaderPayload(payload)
  local pixel = tostring(payload.pixel or "")
  local vertex = tostring(payload.vertex or "")
  local shape = PreviewRuntime.normalizeShape(payload.previewShape)
  local color = PreviewRuntime.colorFromHex(payload.previewColor or "#ffffff")
  local name = tostring(payload.shaderName or "shader graph")
  local zoom = normalizePreviewZoom(payload.previewZoom)

  local shader = nil
  if pixel ~= "" then
    shader = PreviewRuntime.buildShader(pixel, vertex, true)
  end

  local drawable = nil
  local bt = hydrateUpload(payload.baseTexture)
  if type(bt) == "table" and type(bt.dataBase64) == "string" and bt.dataBase64 ~= "" then
    drawable = PreviewRuntime.imageFromUpload(bt, bt.filename or "preview-texture.png")
  end

  if not drawable then
    local ok, cv = pcall(PreviewRuntime.makePreviewImage, shape, 256, color)
    if ok then
      drawable = cv
    end
  end

  PreviewRuntime.sendTextureUniforms(shader, payload.textureUniforms, hydrateUploadList(payload.textures), {
    allowUploadListOnly = true,
    fallbackMissing = false,
    ignoreErrors = true,
  })
  PreviewRuntime.sendShaderParameters(shader, payload.parameters, { ignoreErrors = true })

  shaderState.shader = shader
  shaderState.drawable = drawable
  shaderState.shape = shape
  shaderState.name = name
  shaderState.zoom = zoom
end

local function drawShaderPreview(w, h)
  local drawable = shaderState.drawable
  local shader = shaderState.shader

  if not drawable then
    local r = math.min(w, h) * 0.22
    local x, y = w * 0.5, h * 0.5
    love.graphics.setColor(0.22, 0.74, 0.97, 1)
    love.graphics.circle("fill", x, y, r)
    love.graphics.setColor(0.49, 0.23, 0.93, 0.55)
    love.graphics.circle("fill", x + r * 0.18, y + r * 0.12, r * 0.7)
    love.graphics.setColor(1, 1, 1, 0.9)
    love.graphics.printf(shaderState.name, x - r, y + r + 18, r * 2, "center")
    return
  end

  local prevBlend, prevAlphaMode = love.graphics.getBlendMode()
  local prevShader = love.graphics.getShader()
  local pr, pg, pb, pa = love.graphics.getColor()
  local prevLW = love.graphics.getLineWidth()

  local dw = drawable:getWidth()
  local dh = drawable:getHeight()
  local previewSize = math.min(280, math.max(128, math.min(w, h) * 0.42)) * normalizePreviewZoom(shaderState.zoom)
  local aspect = (dw > 0 and dh > 0) and (dw / dh) or 1
  local drawW = aspect >= 1 and previewSize or previewSize * aspect
  local drawH = aspect >= 1 and previewSize / aspect or previewSize
  local scale = drawW / (dw > 0 and dw or 256)
  local x = (w - drawW) / 2
  local y = (h - drawH) / 2

  love.graphics.push()
  love.graphics.origin()
  love.graphics.setShader()
  love.graphics.setBlendMode("alpha")
  love.graphics.setColor(0.04, 0.05, 0.07, 0.74)
  love.graphics.rectangle("fill", x - 10, y - 10, drawW + 20, drawH + 42, 6, 6)
  love.graphics.setColor(1, 1, 1, 0.22)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle("line", x - 10, y - 10, drawW + 20, drawH + 42, 6, 6)

  if shader then
    if love.timer then
      pcall(shader.send, shader, "u_time", love.timer.getTime())
    end
    love.graphics.setShader(shader)
  end
  love.graphics.setColor(1, 1, 1, 1)
  love.graphics.draw(drawable, x, y, 0, scale, scale)

  love.graphics.setShader()
  love.graphics.setColor(1, 1, 1, 0.72)
  love.graphics.print("Shader Preview: " .. shaderState.shape, x - 4, y + drawH + 12)

  love.graphics.setBlendMode(prevBlend, prevAlphaMode)
  love.graphics.setShader(prevShader)
  love.graphics.setColor(pr, pg, pb, pa)
  love.graphics.setLineWidth(prevLW)
  love.graphics.pop()
end

-- Particle system preview

local particleState = {
  systems = {},
  timeline = nil,
  timelineState = { time = 0, playing = false },
  payloadSignature = "",
  lastScrubVersion = -1,
}

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

local function applySystemProperties(ps, props)
  pcall(ps.setEmissionRate, ps, tonumber(props.emissionRate) or 100)
  pcall(ps.setEmitterLifetime, ps, tonumber(props.emitterLifetime) or -1)
  pcall(
    ps.setParticleLifetime,
    ps,
    tonumber(props.particleLifetimeMin) or 0.35,
    tonumber(props.particleLifetimeMax) or 1.3
  )
  pcall(ps.setDirection, ps, tonumber(props.direction) or (-math.pi / 2))
  pcall(ps.setSpread, ps, tonumber(props.spread) or (math.pi / 3))
  pcall(ps.setSpeed, ps, tonumber(props.speedMin) or 40, tonumber(props.speedMax) or 140)
  pcall(
    ps.setLinearAcceleration,
    ps,
    tonumber(props.linearAccelXMin) or 0,
    tonumber(props.linearAccelYMin) or 0,
    tonumber(props.linearAccelXMax) or 0,
    tonumber(props.linearAccelYMax) or 0
  )
  pcall(ps.setRadialAcceleration, ps, tonumber(props.radialAccelMin) or 0, tonumber(props.radialAccelMax) or 0)
  pcall(
    ps.setTangentialAcceleration,
    ps,
    tonumber(props.tangentialAccelMin) or 0,
    tonumber(props.tangentialAccelMax) or 0
  )
  pcall(ps.setLinearDamping, ps, tonumber(props.linearDampingMin) or 0, tonumber(props.linearDampingMax) or 0)
  pcall(ps.setSizeVariation, ps, tonumber(props.sizeVariation) or 0)
  pcall(ps.setRotation, ps, tonumber(props.rotationMin) or 0, tonumber(props.rotationMax) or 0)
  pcall(ps.setRelativeRotation, ps, props.relativeRotation == true)
  pcall(ps.setSpin, ps, tonumber(props.spinMin) or 0, tonumber(props.spinMax) or 0)
  pcall(ps.setSpinVariation, ps, tonumber(props.spinVariation) or 0)
  pcall(ps.setOffset, ps, tonumber(props.offsetX) or 0, tonumber(props.offsetY) or 0)
  pcall(ps.setInsertMode, ps, tostring(props.insertMode or "top"))

  local sizes = parseCsvNumbers(props.sizes)
  if #sizes > 0 then
    pcall(ps.setSizes, ps, unpack(sizes))
  end

  local colors = parseCsvNumbers(props.colors)
  if #colors >= 4 then
    pcall(ps.setColors, ps, unpack(colors))
  end

  local emDist = tostring(props.emissionAreaDist or "none")
  if emDist ~= "none" and emDist ~= "" then
    pcall(
      ps.setEmissionArea,
      ps,
      emDist,
      tonumber(props.emissionAreaDx) or 0,
      tonumber(props.emissionAreaDy) or 0,
      tonumber(props.emissionAreaAngle) or 0,
      props.emissionAreaRelative == true
    )
  end
end

local function normalizeTimeline(timeline, systems)
  if type(timeline) ~= "table" then
    timeline = {}
  end
  local duration = math.max(0.25, tonumber(timeline.duration) or 3)
  local tracksByIndex = {}
  if type(timeline.tracks) == "table" then
    for _, track in ipairs(timeline.tracks) do
      if type(track) == "table" then
        tracksByIndex[tonumber(track.systemIndex) or 0] = track
      end
    end
  end
  local normalized = { duration = duration, loop = timeline.loop == true, tracks = {} }
  for index, sys in ipairs(systems or {}) do
    local source = tracksByIndex[index] or {}
    local track = { systemIndex = index, clips = {}, lanes = {} }
    if type(source.clips) == "table" then
      for _, clip in ipairs(source.clips) do
        if type(clip) == "table" then
          local startTime = math.max(0, math.min(duration, tonumber(clip.start) or 0))
          local endTime = math.max(startTime + 0.01, math.min(duration, tonumber(clip["end"]) or duration))
          track.clips[#track.clips + 1] = {
            start = startTime,
            ["end"] = endTime,
            emit = tonumber(clip.emit) or tonumber(sys.emitAtStart) or 0,
          }
        end
      end
    end
    if #track.clips == 0 then
      track.clips[1] = { start = 0, ["end"] = duration, emit = tonumber(sys.emitAtStart) or 0 }
    end
    if type(source.lanes) == "table" then
      for _, lane in ipairs(TIMELINE_LANES) do
        local points = source.lanes[lane]
        if type(points) == "table" then
          track.lanes[lane] = {}
          for _, point in ipairs(points) do
            if type(point) == "table" then
              track.lanes[lane][#track.lanes[lane] + 1] = {
                time = math.max(0, math.min(duration, tonumber(point.time) or 0)),
                value = tonumber(point.value) or 0,
                easing = normalizeTimelineEasing(point.easing),
              }
            end
          end
          table.sort(track.lanes[lane], function(a, b)
            return a.time < b.time
          end)
        end
      end
    end
    normalized.tracks[index] = track
  end
  return normalized
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

local function easeTimelineValue(easing, t)
  easing = normalizeTimelineEasing(easing)
  t = math.max(0, math.min(1, t))
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

local function evaluateKeyframes(points, time, fallback)
  if type(points) ~= "table" or #points == 0 then
    return fallback
  end
  if time <= (tonumber(points[1].time) or 0) then
    return tonumber(points[1].value) or fallback
  end
  for i = 1, #points - 1 do
    local a = points[i]
    local b = points[i + 1]
    local at = tonumber(a.time) or 0
    local bt = tonumber(b.time) or at
    if time >= at and time <= bt then
      local span = math.max(0.0001, bt - at)
      local t = math.max(0, math.min(1, (time - at) / span))
      local eased = easeTimelineValue(a.easing, t)
      local av = tonumber(a.value) or fallback
      local bv = tonumber(b.value) or fallback
      return av + (bv - av) * eased
    end
  end
  return tonumber(points[#points].value) or fallback
end

local function stableSignature(value)
  local valueType = type(value)
  if valueType == "table" then
    local keys = {}
    for key in pairs(value) do
      if key ~= "timelineState" then
        keys[#keys + 1] = key
      end
    end
    table.sort(keys, function(a, b)
      return tostring(a) < tostring(b)
    end)
    local parts = { "{" }
    for _, key in ipairs(keys) do
      parts[#parts + 1] = tostring(key)
      parts[#parts + 1] = ":"
      parts[#parts + 1] = stableSignature(value[key])
      parts[#parts + 1] = ";"
    end
    parts[#parts + 1] = "}"
    return table.concat(parts)
  elseif valueType == "number" then
    return string.format("%.6f", value)
  elseif valueType == "boolean" then
    return value and "true" or "false"
  end
  return tostring(value)
end

local function particlePayloadSignature(payload)
  local composite = type(payload) == "table" and payload.composite or nil
  if type(composite) ~= "table" then
    return ""
  end
  return stableSignature({
    activeComposite = payload.activeComposite,
    composite = composite,
  })
end

local function clipAllowsEmission(clip, time, emitterLifetime)
  local startTime = tonumber(clip and clip.start) or 0
  local endTime = tonumber(clip and clip["end"]) or 0
  if time < startTime or time > endTime then
    return false
  end
  local lifetime = tonumber(emitterLifetime) or -1
  if lifetime < 0 then
    return true
  end
  return time <= startTime + lifetime
end

local function trackAllowsEmission(track, time, emitterLifetime)
  for _, clip in ipairs(track and track.clips or {}) do
    if clipAllowsEmission(clip, time, emitterLifetime) then
      return true
    end
  end
  return false
end

local function applyTimelineAt(time, allowEmission)
  local timeline = particleState.timeline
  if type(timeline) ~= "table" then
    return
  end
  for index, track in ipairs(timeline.tracks or {}) do
    local entry = particleState.systems[index]
    if entry and entry.ps and entry.enabled then
      local base = entry.base or {}
      local lanes = track.lanes or {}
      local active = trackAllowsEmission(track, time, tonumber(base.emitterLifetime) or -1)
      local rate = evaluateKeyframes(lanes.emissionRate, time, tonumber(base.emissionRate) or 0)
      if not active or allowEmission ~= true then
        rate = 0
      end
      pcall(entry.ps.setEmissionRate, entry.ps, rate)
      local speedScale = evaluateKeyframes(lanes.speedScale, time, 1)
      pcall(entry.ps.setSpeed, entry.ps, (tonumber(base.speedMin) or 0) * speedScale, (tonumber(base.speedMax) or 0) * speedScale)
      local sizeScale = evaluateKeyframes(lanes.sizeScale, time, 1)
      if type(base.sizes) == "table" and #base.sizes > 0 then
        local sizes = {}
        for i, value in ipairs(base.sizes) do
          sizes[i] = value * sizeScale
        end
        pcall(entry.ps.setSizes, entry.ps, unpack(sizes))
      end
      pcall(entry.ps.setDirection, entry.ps, evaluateKeyframes(lanes.direction, time, tonumber(base.direction) or 0))
      pcall(entry.ps.setSpread, entry.ps, evaluateKeyframes(lanes.spread, time, tonumber(base.spread) or 0))
      pcall(
        entry.ps.setOffset,
        entry.ps,
        evaluateKeyframes(lanes.offsetX, time, tonumber(base.offsetX) or 0),
        evaluateKeyframes(lanes.offsetY, time, tonumber(base.offsetY) or 0)
      )
      entry.opacity = evaluateKeyframes(lanes.opacity, time, 1)
    end
  end
end

local function emitTimelineStarts(previousTime, nextTime)
  local timeline = particleState.timeline
  if type(timeline) ~= "table" then
    return
  end
  for index, track in ipairs(timeline.tracks or {}) do
    local entry = particleState.systems[index]
    if entry and entry.ps and entry.enabled then
      for _, clip in ipairs(track.clips or {}) do
        local startTime = tonumber(clip.start) or 0
        if previousTime <= startTime and nextTime >= startTime then
          local base = entry.base or {}
          local count = math.max(0, math.floor(tonumber(clip.emit) or tonumber(entry.emitAtStart) or 0))
          pcall(entry.ps.setEmitterLifetime, entry.ps, tonumber(base.emitterLifetime) or -1)
          pcall(entry.ps.start, entry.ps)
          if count > 0 then
            pcall(entry.ps.emit, entry.ps, count)
          end
        end
      end
    end
  end
end

local function emitTimelineStartsForAdvance(previousTime, elapsed, duration)
  local timeline = particleState.timeline
  if type(timeline) ~= "table" or elapsed <= 0 then
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
      emitTimelineStarts(cursor, nextCursor)
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

local function resetParticleSystems()
  for _, entry in ipairs(particleState.systems) do
    if entry.ps then
      pcall(entry.ps.reset, entry.ps)
      local base = entry.base or {}
      pcall(entry.ps.setEmitterLifetime, entry.ps, tonumber(base.emitterLifetime) or -1)
      pcall(entry.ps.start, entry.ps)
    end
  end
end

local function seekParticleTimeline(time, playing)
  local timeline = particleState.timeline
  if type(timeline) ~= "table" then
    return
  end
  local duration = tonumber(timeline.duration) or 3
  local target = math.max(0, math.min(duration, tonumber(time) or 0))
  resetParticleSystems()
  particleState.timelineState.time = target
  particleState.timelineState.playing = playing == true

  local current = 0
  local step = 1 / 60
  local steps = 0
  while current < target and steps < 600 do
    local nextTime = math.min(target, current + step)
    emitTimelineStarts(current, nextTime)
    applyTimelineAt(nextTime, true)
    for _, entry in ipairs(particleState.systems) do
      if entry.ps and entry.enabled then
        pcall(entry.ps.update, entry.ps, nextTime - current)
      end
    end
    current = nextTime
    steps = steps + 1
  end
  applyTimelineAt(target, playing == true)
end

local function syncParticleTimelineState(state)
  if type(state) ~= "table" or type(particleState.timeline) ~= "table" then
    return
  end

  local duration = tonumber(particleState.timeline.duration) or 3
  local currentTime = tonumber(particleState.timelineState.time) or 0
  local target = math.max(0, math.min(duration, tonumber(state.time) or currentTime))
  local incomingPlaying = state.playing == true
  local scrubVersion = tonumber(state.scrubVersion) or particleState.lastScrubVersion
  local wasPlaying = particleState.timelineState.playing == true
  local explicitSeek = scrubVersion ~= particleState.lastScrubVersion and not wasPlaying and not incomingPlaying

  if explicitSeek then
    seekParticleTimeline(target, incomingPlaying)
  else
    if incomingPlaying and wasPlaying then
      if target >= currentTime then
        emitTimelineStarts(currentTime, target)
      elseif particleState.timeline.loop then
        emitTimelineStarts(currentTime, duration)
        emitTimelineStarts(0, target)
      end
    end
    particleState.timelineState.time = target
    particleState.timelineState.playing = incomingPlaying
    applyTimelineAt(target, incomingPlaying)
  end

  particleState.lastScrubVersion = scrubVersion
end

local function applyParticlePayload(payload)
  for _, entry in ipairs(particleState.systems) do
    if entry.ps then
      pcall(entry.ps.release, entry.ps)
    end
  end
  particleState.systems = {}

  local composite = payload.composite
  if type(composite) ~= "table" then
    return
  end

  local systems = composite.systems
  if type(systems) ~= "table" then
    return
  end

  for _, sysData in ipairs(systems) do
    if type(sysData) == "table" then
      local preset = tostring(sysData.texturePreset or "circle")
      local ok0, img = pcall(generatePresetImage, preset)
      if not ok0 or not img then
        ok0, img = pcall(generatePresetImage, "circle")
      end
      if ok0 and img then
        local bufSize = math.max(
          100,
          math.min(
            5000,
            tonumber((type(sysData.properties) == "table" and sysData.properties.bufferSize) or 1000) or 1000
          )
        )
        local okPs, ps = pcall(love.graphics.newParticleSystem, img, bufSize)
        if okPs and ps then
          if type(sysData.properties) == "table" then
            pcall(applySystemProperties, ps, sysData.properties)
          end
          pcall(ps.start, ps)
          local props = type(sysData.properties) == "table" and sysData.properties or {}
          particleState.systems[#particleState.systems + 1] = {
            ps = ps,
            blendMode = tostring(sysData.blendMode or "alpha"),
            enabled = sysData.enabled ~= false,
            x = tonumber(sysData.x) or 0,
            y = tonumber(sysData.y) or 0,
            emitAtStart = tonumber(sysData.emitAtStart) or 0,
            opacity = 1,
            base = {
              emissionRate = tonumber(props.emissionRate) or 100,
              emitterLifetime = tonumber(props.emitterLifetime) or -1,
              speedMin = tonumber(props.speedMin) or 40,
              speedMax = tonumber(props.speedMax) or 140,
              sizes = parseCsvNumbers(props.sizes),
              direction = tonumber(props.direction) or (-math.pi / 2),
              spread = tonumber(props.spread) or (math.pi / 3),
              offsetX = tonumber(props.offsetX) or 0,
              offsetY = tonumber(props.offsetY) or 0,
            },
          }
        end
      end
    end
  end

  particleState.timeline = normalizeTimeline(composite.timeline, systems)
  local incomingState = type(composite.timelineState) == "table" and composite.timelineState or {}
  particleState.lastScrubVersion = tonumber(incomingState.scrubVersion) or -1
  seekParticleTimeline(tonumber(incomingState.time) or 0, incomingState.playing == true)
end

local function drawParticlePreview(w, h)
  local cx = w * 0.5
  local cy = h * 0.56

  if #particleState.systems == 0 then
    love.graphics.setColor(1, 0.45 + 0.35, 0.12, 0.6)
    local r = math.min(w, h) * 0.04
    for i = 1, 24 do
      local angle = i * 2.399
      local spread = 30 + r * 2
      local px = cx + math.cos(angle) * spread
      local py = cy - spread * 0.5 + math.sin(angle * 1.7) * spread * 0.18
      love.graphics.circle("fill", px, py, r)
    end
    return
  end

  local prevBlend, prevAlphaMode = love.graphics.getBlendMode()
  local pr, pg, pb, pa = love.graphics.getColor()

  for _, entry in ipairs(particleState.systems) do
    if entry.ps then
      if entry.blendMode == "add" then
        love.graphics.setBlendMode("add")
      else
        love.graphics.setBlendMode("alpha")
      end
      love.graphics.setColor(1, 1, 1, entry.opacity or 1)
      love.graphics.draw(entry.ps, cx + entry.x, cy + entry.y)
    end
  end

  love.graphics.setBlendMode(prevBlend, prevAlphaMode)
  love.graphics.setColor(pr, pg, pb, pa)
end

-- Payload polling

local pollState = {
  tool = "idle",
  time = 0,
  pollTimer = 0,
  lastPayloadJson = "",
}

local function pollPayload()
  if not _jsEval then
    return
  end
  local ok, json = pcall(_jsEval, "JSON.stringify(window._featherPayload || null)")
  if not ok or not json or json == "" or json == "null" then
    return
  end
  if json == pollState.lastPayloadJson then
    return
  end
  pollState.lastPayloadJson = json

  local payload = parseJson(json)
  if type(payload) ~= "table" then
    return
  end

  local tool = tostring(payload.tool or "idle")
  pollState.tool = tool
  if tool == "shader-graph" then
    particleState.payloadSignature = ""
    pcall(applyShaderPayload, payload)
  elseif tool == "particle-system-playground" then
    local signature = particlePayloadSignature(payload)
    if signature ~= particleState.payloadSignature then
      particleState.payloadSignature = signature
      pcall(applyParticlePayload, payload)
    else
      local composite = type(payload.composite) == "table" and payload.composite or nil
      pcall(syncParticleTimelineState, type(composite) == "table" and composite.timelineState or nil)
    end
  else
    particleState.payloadSignature = ""
  end
end

-- love callbacks

---@diagnostic disable-next-line: duplicate-set-field
function love.update(dt)
  pollState.time = pollState.time + dt
  pollState.pollTimer = pollState.pollTimer + dt
  if pollState.pollTimer >= 0.12 then
    pollState.pollTimer = 0
    pollPayload()
  end
  if pollState.tool == "particle-system-playground" then
    local timeline = particleState.timeline
    if type(timeline) == "table" and particleState.timelineState.playing then
      local duration = tonumber(timeline.duration) or 3
      local previous = particleState.timelineState.time or 0
      local nextTime = previous + dt
      if nextTime > duration then
        if timeline.loop then
          nextTime = emitTimelineStartsForAdvance(previous, dt, duration)
        else
          emitTimelineStarts(previous, duration)
          nextTime = duration
          particleState.timelineState.playing = false
        end
      else
        emitTimelineStarts(previous, nextTime)
      end
      particleState.timelineState.time = nextTime
    end
    applyTimelineAt(particleState.timelineState.time or 0, particleState.timelineState.playing == true)
    for _, entry in ipairs(particleState.systems) do
      if entry.ps then
        pcall(entry.ps.update, entry.ps, dt)
      end
    end
  end
end

---@diagnostic disable-next-line: duplicate-set-field
function love.draw()
  local w, h = love.graphics.getDimensions()
  love.graphics.clear(0.02, 0.03, 0.05, 1)
  drawGrid(w, h)

  if pollState.tool == "particle-system-playground" then
    drawParticlePreview(w, h)
  elseif pollState.tool == "shader-graph" then
    drawShaderPreview(w, h)
  else
    love.graphics.setColor(0.84, 0.87, 0.91, 0.35)
    local r = math.min(w, h) * 0.22
    love.graphics.setLineWidth(1)
    love.graphics.circle("line", w * 0.5, h * 0.5, r)
  end

  love.graphics.setColor(0.84, 0.87, 0.91, 0.72)
  love.graphics.print("Feather standalone preview target", 12, 12)
end
