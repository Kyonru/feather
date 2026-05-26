local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")
local base64 = require(FEATHER_PATH .. ".lib.base64")

local ParticleSystemPlaygroundPlugin = Class({ __includes = Base })

local DEFAULT_BUFFER_SIZE = 1000
local DEFAULT_X = 400
local DEFAULT_Y = 300
local TWO_PI = math.pi * 2

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

  return pcall(prop.set, ps, value)
end

local function snapshotPS(ps)
  local snapshot = {}
  if not ps then
    return snapshot
  end
  for _, prop in ipairs(PS_PROPERTIES) do
    local ok, value = pcall(prop.get, ps)
    if ok then
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

local function createDefaultSystem(index, template)
  template = template or "fire"
  local texturePreset = "circle"
  if template == "smoke" then
    texturePreset = "light"
  end
  if template == "sparkles" then
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
  end

  ps:start()

  return {
    system = ps,
    title = "Emitter " .. tostring(index),
    blendMode = "alpha",
    shader = nil,
    shaderTextures = {},
    shaderPath = "",
    shaderFilename = "",
    shaderSource = "",
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

  self.composites[final] = {
    kind = "scratch",
    name = final,
    x = DEFAULT_X,
    y = DEFAULT_Y,
    movement = { pattern = "none", radius = 50, radiusX = 80, radiusY = 40, speed = 1, scale = 50 },
    offsetX = 0,
    offsetY = 0,
    systems = createDefaultSystems(template),
  }
  self.compositeOrder[#self.compositeOrder + 1] = final
  self.activeComposite = final
  self.activeSystem = 1
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
  for _, name in ipairs(self.compositeOrder) do
    local entry = self.composites[name]
    if entry and entry.kind == "scratch" then
      local offsetX, offsetY = computeMovementOffset(entry.movement, dt)
      entry.offsetX, entry.offsetY = offsetX, offsetY
      local x = (entry.x or DEFAULT_X) + offsetX
      local y = (entry.y or DEFAULT_Y) + offsetY
      for _, system in ipairs(entry.systems or {}) do
        if system.system then
          pcall(system.system.setPosition, system.system, x + (system.x or 0), y + (system.y or 0))
          pcall(system.system.update, system.system, dt)
        end
      end
    end
  end
end

function ParticleSystemPlaygroundPlugin:onDraw()
  if not love or not love.graphics then
    return
  end

  local previousBlend, previousAlphaMode = love.graphics.getBlendMode()
  local previousShader = love.graphics.getShader()
  local r, g, b, a = love.graphics.getColor()

  for _, name in ipairs(self.compositeOrder) do
    local entry = self.composites[name]
    if entry and entry.kind == "scratch" then
      for _, system in ipairs(entry.systems or {}) do
        if system.system then
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
          love.graphics.setColor(1, 1, 1, 1)
          love.graphics.draw(system.system, 0, 0)
        end
      end
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
      local ps = sys.system
      systems[#systems + 1] = {
        index = i,
        title = safeString(meta.title or sys.title, "Emitter " .. tostring(i)),
        blendMode = safeString(sys.blendMode, "alpha"),
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
        properties = snapshotPS(ps),
      }
    end
    data = {
      compositeType = entry.kind,
      x = entry.kind == "scratch" and safeNumber(entry.x, DEFAULT_X) or safeNumber(composite and composite.x, 0),
      y = entry.kind == "scratch" and safeNumber(entry.y, DEFAULT_Y) or safeNumber(composite and composite.y, 0),
      movement = entry.kind == "scratch" and entry.movement or { pattern = "none" },
      systems = systems,
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
    self.activeComposite = params.composite
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
    setProp(sys.system, key, value)
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
      self.activeComposite = params.composite
      self.activeSystem = 1
    end
    return true
  end

  if action == "select-system" then
    self.activeSystem = index
    return true
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
    table.remove(entry.systems, index)
    self.activeSystem = math.min(self.activeSystem, #entry.systems)
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
    local moved = table.remove(entry.systems, fromIdx)
    table.insert(entry.systems, toIdx, moved)
    return true
  end

  if action == "set-texture" then
    return self:_applyTexture(name, index, params)
  end

  if action == "set-shader" then
    return self:_applyShader(name, index, params)
  end

  local sys = self:_getSystemEntry(name, index)
  if not sys or not sys.system then
    return nil, "System not found"
  end

  if action == "emit" then
    sys.system:emit(math.max(1, safeNumber(params.count, 100)))
    return true
  end

  if action == "emit-all" then
    for i = 1, self:_systemCount(name) do
      local item = self:_getSystemEntry(name, i)
      if item and item.system then
        item.system:emit(math.max(1, safeNumber(params.count, 100)))
      end
    end
    return true
  end

  if action == "reset" then
    sys.system:reset()
    sys.system:start()
    return true
  end

  if action == "reset-all" then
    for i = 1, self:_systemCount(name) do
      local item = self:_getSystemEntry(name, i)
      if item and item.system then
        item.system:reset()
        item.system:start()
      end
    end
    return true
  end

  if action == "kick-start" then
    local steps = math.max(0, safeNumber(sys.kickStartSteps, 0))
    local dt = safeNumber(sys.kickStartDt, 1 / 60)
    for _ = 1, steps do
      sys.system:update(dt)
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
  local lines = {
    "-- Generated by Feather Particles Playground",
    "-- " .. os.date("%Y-%m-%d %H:%M:%S"),
    "local LG = love.graphics",
    "",
    "---@class ParticlePayload",
    "---@field x number",
    "---@field y number",
    "---@field r number",
    "---@field amount integer",
    "---@field systemIndex? integer",
    "",
    "local systems = {}",
    "local particles = { x = " .. fmt(entry.x or 0) .. ", y = " .. fmt(entry.y or 0) .. ", systems = systems }",
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
      local asset = self:_assetInfo(name, i, sys)
      local imageKey = self:_textureLoadPath(asset)
      local imageVar = imageVars[imageKey]
      local psVar = "ps" .. tostring(i)
      lines[#lines + 1] = "  local "
        .. psVar
        .. " = LG.newParticleSystem("
        .. imageVar
        .. ", "
        .. tostring(ps:getBufferSize())
        .. ")"

      local colors = { ps:getColors() }
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
      local sizes = {}
      for _, value in ipairs({ ps:getSizes() }) do
        sizes[#sizes + 1] = fmt(value)
      end

      lines[#lines + 1] = "  " .. psVar .. ":setDirection(" .. fmt(ps:getDirection()) .. ")"
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
      lines[#lines + 1] = "  " .. psVar .. ":setEmissionRate(" .. fmt(ps:getEmissionRate()) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setEmitterLifetime(" .. fmt(ps:getEmitterLifetime()) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setInsertMode(" .. quote(ps:getInsertMode()) .. ")"
      lines[#lines + 1] = "  " .. psVar
        .. ":setLinearAcceleration("
        .. table.concat({ fmt(xmin), fmt(ymin), fmt(xmax), fmt(ymax) }, ", ")
        .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setLinearDamping(" .. fmt(dampMin) .. ", " .. fmt(dampMax) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setOffset(" .. fmt(offsetX) .. ", " .. fmt(offsetY) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setParticleLifetime(" .. fmt(lifeMin) .. ", " .. fmt(lifeMax) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setRadialAcceleration(" .. fmt(radialMin) .. ", " .. fmt(radialMax) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setRelativeRotation(" .. tostring(ps:hasRelativeRotation()) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setRotation(" .. fmt(rotMin) .. ", " .. fmt(rotMax) .. ")"
      if #sizes > 0 then
        lines[#lines + 1] = "  " .. psVar .. ":setSizes(" .. table.concat(sizes, ", ") .. ")"
      end
      lines[#lines + 1] = "  " .. psVar .. ":setSizeVariation(" .. fmt(ps:getSizeVariation()) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setSpeed(" .. fmt(speedMin) .. ", " .. fmt(speedMax) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setSpin(" .. fmt(spinMin) .. ", " .. fmt(spinMax) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setSpinVariation(" .. fmt(ps:getSpinVariation()) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setSpread(" .. fmt(ps:getSpread()) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setTangentialAcceleration(" .. fmt(tangentMin) .. ", " .. fmt(tangentMax) .. ")"
      lines[#lines + 1] = "  " .. psVar .. ":setPosition(particles.x + " .. fmt(sys.x or 0) .. ", particles.y + " .. fmt(sys.y or 0) .. ")"

      local shaderKey = asset.shaderSource
      local shaderValue = shaderVars[shaderKey] or "nil"
      lines[#lines + 1] = "  systems["
        .. tostring(i)
        .. "] = { system = "
        .. psVar
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
        .. " }"
      lines[#lines + 1] = "  for _ = 1, systems[" .. tostring(i) .. "].kickStartSteps do"
      lines[#lines + 1] = "    " .. psVar .. ":update(systems[" .. tostring(i) .. "].kickStartDt)"
      lines[#lines + 1] = "  end"
      lines[#lines + 1] = "  if systems[" .. tostring(i) .. "].emitAtStart > 0 then"
      lines[#lines + 1] = "    " .. psVar .. ":emit(systems[" .. tostring(i) .. "].emitAtStart)"
      lines[#lines + 1] = "  end"
    end
  end

  lines[#lines + 1] = ""
  lines[#lines + 1] = "  return particles"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "local function update(dt)"
  lines[#lines + 1] = "  for _, emitter in ipairs(systems) do"
  lines[#lines + 1] = "    if emitter.system then"
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
  lines[#lines + 1] = "    if emitter.system then"
  lines[#lines + 1] = "      LG.setBlendMode(emitter.blendMode or \"alpha\")"
  lines[#lines + 1] = "      if emitter.shader and emitter.shader.send and love.timer then"
  lines[#lines + 1] = "        pcall(emitter.shader.send, emitter.shader, \"u_time\", love.timer.getTime())"
  lines[#lines + 1] = "      end"
  lines[#lines + 1] = "      LG.setShader(emitter.shader)"
  lines[#lines + 1] = "      LG.setColor(1, 1, 1, 1)"
  lines[#lines + 1] = "      LG.draw(emitter.system, 0, 0)"
  lines[#lines + 1] = "    end"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "  LG.setBlendMode(previousBlend, previousAlphaMode)"
  lines[#lines + 1] = "  LG.setShader(previousShader)"
  lines[#lines + 1] = "  LG.setColor(r, g, b, a)"
  lines[#lines + 1] = "end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "---Emit particles."
  lines[#lines + 1] = "---@param payload ParticlePayload"
  lines[#lines + 1] = "local function emit(payload)"
  lines[#lines + 1] = "  if type(payload) ~= \"table\" then"
  lines[#lines + 1] = "    return false"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "  local x = tonumber(payload.x) or particles.x"
  lines[#lines + 1] = "  local y = tonumber(payload.y) or particles.y"
  lines[#lines + 1] = "  local r = tonumber(payload.r) or 0"
  lines[#lines + 1] = "  local amount = math.max(1, math.floor(tonumber(payload.amount) or 1))"
  lines[#lines + 1] = "  local index = tonumber(payload.systemIndex)"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "  for i, emitter in ipairs(systems) do"
  lines[#lines + 1] = "    if emitter.system and (not index or index == i) then"
  lines[#lines + 1] = "      emitter.system:setPosition(x + (emitter.x or 0), y + (emitter.y or 0))"
  lines[#lines + 1] = "      emitter.system:setDirection(r)"
  lines[#lines + 1] = "      emitter.system:emit(amount)"
  lines[#lines + 1] = "    end"
  lines[#lines + 1] = "  end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "  return true"
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
