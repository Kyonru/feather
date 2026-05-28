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
  local bt = payload.baseTexture
  if type(bt) == "table" and type(bt.dataBase64) == "string" and bt.dataBase64 ~= "" then
    drawable = PreviewRuntime.imageFromUpload(bt, "preview-texture.png")
  end

  if not drawable then
    local ok, cv = pcall(PreviewRuntime.makePreviewImage, shape, 256, color)
    if ok then
      drawable = cv
    end
  end

  PreviewRuntime.sendTextureUniforms(shader, payload.textureUniforms, payload.textures, {
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

  local previewSize = math.min(280, math.max(128, math.min(w, h) * 0.42)) * normalizePreviewZoom(shaderState.zoom)
  local dw = drawable:getWidth()
  local scale = previewSize / (dw > 0 and dw or 256)
  local x = (w - previewSize) / 2
  local y = (h - previewSize) / 2

  love.graphics.push()
  love.graphics.origin()
  love.graphics.setShader()
  love.graphics.setBlendMode("alpha")
  love.graphics.setColor(0.04, 0.05, 0.07, 0.74)
  love.graphics.rectangle("fill", x - 10, y - 10, previewSize + 20, previewSize + 42, 6, 6)
  love.graphics.setColor(1, 1, 1, 0.22)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle("line", x - 10, y - 10, previewSize + 20, previewSize + 42, 6, 6)

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
  love.graphics.print("Shader Preview: " .. shaderState.shape, x - 4, y + previewSize + 12)

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
      local av = tonumber(a.value) or fallback
      local bv = tonumber(b.value) or fallback
      return av + (bv - av) * t
    end
  end
  return tonumber(points[#points].value) or fallback
end

local function trackActive(track, time)
  for _, clip in ipairs(track and track.clips or {}) do
    if time >= (tonumber(clip.start) or 0) and time <= (tonumber(clip["end"]) or 0) then
      return true
    end
  end
  return false
end

local function applyTimelineAt(time)
  local timeline = particleState.timeline
  if type(timeline) ~= "table" then
    return
  end
  for index, track in ipairs(timeline.tracks or {}) do
    local entry = particleState.systems[index]
    if entry and entry.ps and entry.enabled then
      local base = entry.base or {}
      local lanes = track.lanes or {}
      local rate = evaluateKeyframes(lanes.emissionRate, time, tonumber(base.emissionRate) or 0)
      if not trackActive(track, time) then
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
          local count = math.max(0, math.floor(tonumber(clip.emit) or tonumber(entry.emitAtStart) or 0))
          if count > 0 then
            pcall(entry.ps.emit, entry.ps, count)
          end
        end
      end
    end
  end
end

local function resetParticleSystems()
  for _, entry in ipairs(particleState.systems) do
    if entry.ps then
      pcall(entry.ps.reset, entry.ps)
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
    applyTimelineAt(nextTime)
    for _, entry in ipairs(particleState.systems) do
      if entry.ps and entry.enabled then
        pcall(entry.ps.update, entry.ps, nextTime - current)
      end
    end
    current = nextTime
    steps = steps + 1
  end
  applyTimelineAt(target)
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
    pcall(applyShaderPayload, payload)
  elseif tool == "particle-system-playground" then
    pcall(applyParticlePayload, payload)
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
  local timeline = particleState.timeline
  if type(timeline) == "table" and particleState.timelineState.playing then
    local duration = tonumber(timeline.duration) or 3
    local previous = particleState.timelineState.time or 0
    local nextTime = previous + dt
    if nextTime > duration then
      if timeline.loop then
        resetParticleSystems()
        nextTime = nextTime % duration
        emitTimelineStarts(0, nextTime)
      else
        nextTime = duration
        particleState.timelineState.playing = false
      end
    else
      emitTimelineStarts(previous, nextTime)
    end
    particleState.timelineState.time = nextTime
  end
  applyTimelineAt(particleState.timelineState.time or 0)
  for _, entry in ipairs(particleState.systems) do
    if entry.ps then
      pcall(entry.ps.update, entry.ps, dt)
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
