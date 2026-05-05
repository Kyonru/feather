local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".plugins.base")

--- Full list of ParticleSystem properties and how to read/write them.
--- Each entry: { key, label, getter, setter, type, props }
---   getter(ps) → returns current values
---   setter(ps, ...) → applies values
---   type: "number"|"minmax"|"vec4"|"variadic"|"boolean"|"select"|"area"
---   props: extra metadata for the desktop UI

---@class RegisteredSystem
---@field name string
---@field getter fun(): love.ParticleSystem
---@field imageRef string  Lua expression for image in code gen (e.g. 'love.graphics.newImage("fire.png")')

---@class ParticleEditorPlugin: FeatherPlugin
---@field systems RegisteredSystem[]
---@field systemMap table<string, RegisteredSystem>
---@field activeSystem string|nil
local ParticleEditorPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.systems = {}
    self.systemMap = {}
    self.activeSystem = nil
  end,
})

--- Register a ParticleSystem for editing.
---@param name string Display name
---@param getter fun(): love.ParticleSystem Function that returns the ParticleSystem instance
---@param imageRef? string Lua code string for the image in code export (default: 'image')
function ParticleEditorPlugin:addSystem(name, getter, imageRef)
  local entry = {
    name = name,
    getter = getter,
    imageRef = imageRef or "image",
  }
  self.systems[#self.systems + 1] = entry
  self.systemMap[name] = entry
  if not self.activeSystem then
    self.activeSystem = name
  end
end

--- Remove a registered ParticleSystem.
---@param name string
function ParticleEditorPlugin:removeSystem(name)
  self.systemMap[name] = nil
  for i, s in ipairs(self.systems) do
    if s.name == name then
      table.remove(self.systems, i)
      break
    end
  end
  if self.activeSystem == name then
    self.activeSystem = self.systems[1] and self.systems[1].name or nil
  end
end

--- Get the active ParticleSystem instance.
---@return love.ParticleSystem|nil
function ParticleEditorPlugin:_getActivePS()
  if not self.activeSystem then
    return nil
  end
  local entry = self.systemMap[self.activeSystem]
  if not entry then
    return nil
  end
  local ok, ps = pcall(entry.getter)
  if ok and ps then
    return ps
  end
  return nil
end

--- Property definitions — each defines how to read, write, and present a ParticleSystem property.
local PROPERTIES = {
  {
    key = "emissionRate",
    label = "Emission Rate",
    get = function(ps)
      return ps:getEmissionRate()
    end,
    set = function(ps, v)
      ps:setEmissionRate(v)
    end,
    type = "number",
    props = { type = "number", min = 0, max = 10000, step = 1 },
    group = "Emission",
  },
  {
    key = "emitterLifetime",
    label = "Emitter Lifetime",
    get = function(ps)
      return ps:getEmitterLifetime()
    end,
    set = function(ps, v)
      ps:setEmitterLifetime(v)
    end,
    type = "number",
    props = { type = "number", min = -1, max = 600, step = 0.1 },
    group = "Emission",
  },
  {
    key = "particleLifetimeMin",
    label = "Particle Lifetime Min",
    get = function(ps)
      local min, _ = ps:getParticleLifetime()
      return min
    end,
    set = function(ps, v)
      local _, max = ps:getParticleLifetime()
      ps:setParticleLifetime(v, max)
    end,
    type = "number",
    props = { type = "number", min = 0, max = 600, step = 0.01 },
    group = "Emission",
  },
  {
    key = "particleLifetimeMax",
    label = "Particle Lifetime Max",
    get = function(ps)
      local _, max = ps:getParticleLifetime()
      return max
    end,
    set = function(ps, v)
      local min, _ = ps:getParticleLifetime()
      ps:setParticleLifetime(min, v)
    end,
    type = "number",
    props = { type = "number", min = 0, max = 600, step = 0.01 },
    group = "Emission",
  },
  {
    key = "direction",
    label = "Direction (rad)",
    get = function(ps)
      return ps:getDirection()
    end,
    set = function(ps, v)
      ps:setDirection(v)
    end,
    type = "number",
    props = { type = "number", min = -6.2832, max = 6.2832, step = 0.01 },
    group = "Direction",
  },
  {
    key = "spread",
    label = "Spread (rad)",
    get = function(ps)
      return ps:getSpread()
    end,
    set = function(ps, v)
      ps:setSpread(v)
    end,
    type = "number",
    props = { type = "number", min = 0, max = 6.2832, step = 0.01 },
    group = "Direction",
  },
  {
    key = "speedMin",
    label = "Speed Min",
    get = function(ps)
      local min, _ = ps:getSpeed()
      return min
    end,
    set = function(ps, v)
      local _, max = ps:getSpeed()
      ps:setSpeed(v, max)
    end,
    type = "number",
    props = { type = "number", min = 0, max = 10000, step = 1 },
    group = "Speed",
  },
  {
    key = "speedMax",
    label = "Speed Max",
    get = function(ps)
      local _, max = ps:getSpeed()
      return max
    end,
    set = function(ps, v)
      local min, _ = ps:getSpeed()
      ps:setSpeed(min, v)
    end,
    type = "number",
    props = { type = "number", min = 0, max = 10000, step = 1 },
    group = "Speed",
  },
  {
    key = "linearAccelerationXMin",
    label = "Linear Accel X Min",
    get = function(ps)
      local xmin, _, _, _ = ps:getLinearAcceleration()
      return xmin
    end,
    set = function(ps, v)
      local _, ymin, xmax, ymax = ps:getLinearAcceleration()
      ps:setLinearAcceleration(v, ymin, xmax, ymax)
    end,
    type = "number",
    props = { type = "number", min = -10000, max = 10000, step = 1 },
    group = "Acceleration",
  },
  {
    key = "linearAccelerationYMin",
    label = "Linear Accel Y Min",
    get = function(ps)
      local _, ymin, _, _ = ps:getLinearAcceleration()
      return ymin
    end,
    set = function(ps, v)
      local xmin, _, xmax, ymax = ps:getLinearAcceleration()
      ps:setLinearAcceleration(xmin, v, xmax, ymax)
    end,
    type = "number",
    props = { type = "number", min = -10000, max = 10000, step = 1 },
    group = "Acceleration",
  },
  {
    key = "linearAccelerationXMax",
    label = "Linear Accel X Max",
    get = function(ps)
      local _, _, xmax, _ = ps:getLinearAcceleration()
      return xmax
    end,
    set = function(ps, v)
      local xmin, ymin, _, ymax = ps:getLinearAcceleration()
      ps:setLinearAcceleration(xmin, ymin, v, ymax)
    end,
    type = "number",
    props = { type = "number", min = -10000, max = 10000, step = 1 },
    group = "Acceleration",
  },
  {
    key = "linearAccelerationYMax",
    label = "Linear Accel Y Max",
    get = function(ps)
      local _, _, _, ymax = ps:getLinearAcceleration()
      return ymax
    end,
    set = function(ps, v)
      local xmin, ymin, xmax, _ = ps:getLinearAcceleration()
      ps:setLinearAcceleration(xmin, ymin, xmax, v)
    end,
    type = "number",
    props = { type = "number", min = -10000, max = 10000, step = 1 },
    group = "Acceleration",
  },
  {
    key = "radialAccelerationMin",
    label = "Radial Accel Min",
    get = function(ps)
      local min, _ = ps:getRadialAcceleration()
      return min
    end,
    set = function(ps, v)
      local _, max = ps:getRadialAcceleration()
      ps:setRadialAcceleration(v, max)
    end,
    type = "number",
    props = { type = "number", min = -10000, max = 10000, step = 1 },
    group = "Acceleration",
  },
  {
    key = "radialAccelerationMax",
    label = "Radial Accel Max",
    get = function(ps)
      local _, max = ps:getRadialAcceleration()
      return max
    end,
    set = function(ps, v)
      local min, _ = ps:getRadialAcceleration()
      ps:setRadialAcceleration(min, v)
    end,
    type = "number",
    props = { type = "number", min = -10000, max = 10000, step = 1 },
    group = "Acceleration",
  },
  {
    key = "tangentialAccelerationMin",
    label = "Tangential Accel Min",
    get = function(ps)
      local min, _ = ps:getTangentialAcceleration()
      return min
    end,
    set = function(ps, v)
      local _, max = ps:getTangentialAcceleration()
      ps:setTangentialAcceleration(v, max)
    end,
    type = "number",
    props = { type = "number", min = -10000, max = 10000, step = 1 },
    group = "Acceleration",
  },
  {
    key = "tangentialAccelerationMax",
    label = "Tangential Accel Max",
    get = function(ps)
      local _, max = ps:getTangentialAcceleration()
      return max
    end,
    set = function(ps, v)
      local min, _ = ps:getTangentialAcceleration()
      ps:setTangentialAcceleration(min, v)
    end,
    type = "number",
    props = { type = "number", min = -10000, max = 10000, step = 1 },
    group = "Acceleration",
  },
  {
    key = "linearDampingMin",
    label = "Linear Damping Min",
    get = function(ps)
      local min, _ = ps:getLinearDamping()
      return min
    end,
    set = function(ps, v)
      local _, max = ps:getLinearDamping()
      ps:setLinearDamping(v, max)
    end,
    type = "number",
    props = { type = "number", min = 0, max = 100, step = 0.01 },
    group = "Damping",
  },
  {
    key = "linearDampingMax",
    label = "Linear Damping Max",
    get = function(ps)
      local _, max = ps:getLinearDamping()
      return max
    end,
    set = function(ps, v)
      local min, _ = ps:getLinearDamping()
      ps:setLinearDamping(min, v)
    end,
    type = "number",
    props = { type = "number", min = 0, max = 100, step = 0.01 },
    group = "Damping",
  },
  {
    key = "sizes",
    label = "Sizes",
    get = function(ps)
      local sizes = { ps:getSizes() }
      local parts = {}
      for _, s in ipairs(sizes) do
        parts[#parts + 1] = tostring(s)
      end
      return table.concat(parts, ", ")
    end,
    set = function(ps, v)
      local nums = {}
      for n in tostring(v):gmatch("[^,]+") do
        local val = tonumber(n:match("^%s*(.-)%s*$"))
        if val then
          nums[#nums + 1] = val
        end
      end
      if #nums > 0 then
        ps:setSizes(unpack(nums))
      end
    end,
    type = "vector",
    props = { labels = { "Start", "Mid", "End" }, type = "number", min = 0, max = 10, step = 0.01 },
    group = "Size",
  },
  {
    key = "sizeVariation",
    label = "Size Variation",
    get = function(ps)
      return ps:getSizeVariation()
    end,
    set = function(ps, v)
      ps:setSizeVariation(v)
    end,
    type = "number",
    props = { type = "number", min = 0, max = 1, step = 0.01 },
    group = "Size",
  },
  {
    key = "rotationMin",
    label = "Rotation Min (rad)",
    get = function(ps)
      local min, _ = ps:getRotation()
      return min
    end,
    set = function(ps, v)
      local _, max = ps:getRotation()
      ps:setRotation(v, max)
    end,
    type = "number",
    props = { type = "number", min = -6.2832, max = 6.2832, step = 0.01 },
    group = "Rotation",
  },
  {
    key = "rotationMax",
    label = "Rotation Max (rad)",
    get = function(ps)
      local _, max = ps:getRotation()
      return max
    end,
    set = function(ps, v)
      local min, _ = ps:getRotation()
      ps:setRotation(min, v)
    end,
    type = "number",
    props = { type = "number", min = -6.2832, max = 6.2832, step = 0.01 },
    group = "Rotation",
  },
  {
    key = "spinMin",
    label = "Spin Min (rad/s)",
    get = function(ps)
      local min, _ = ps:getSpin()
      return min
    end,
    set = function(ps, v)
      local _, max = ps:getSpin()
      ps:setSpin(v, max)
    end,
    type = "number",
    props = { type = "number", min = -100, max = 100, step = 0.01 },
    group = "Spin",
  },
  {
    key = "spinMax",
    label = "Spin Max (rad/s)",
    get = function(ps)
      local _, max = ps:getSpin()
      return max
    end,
    set = function(ps, v)
      local min, _ = ps:getSpin()
      ps:setSpin(min, v)
    end,
    type = "number",
    props = { type = "number", min = -100, max = 100, step = 0.01 },
    group = "Spin",
  },
  {
    key = "spinVariation",
    label = "Spin Variation",
    get = function(ps)
      return ps:getSpinVariation()
    end,
    set = function(ps, v)
      ps:setSpinVariation(v)
    end,
    type = "number",
    props = { type = "number", min = 0, max = 1, step = 0.01 },
    group = "Spin",
  },
  {
    key = "offsetX",
    label = "Offset X",
    get = function(ps)
      local ox, _ = ps:getOffset()
      return ox
    end,
    set = function(ps, v)
      local _, oy = ps:getOffset()
      ps:setOffset(v, oy)
    end,
    type = "number",
    props = { type = "number", min = -1000, max = 1000, step = 1 },
    group = "Offset",
  },
  {
    key = "offsetY",
    label = "Offset Y",
    get = function(ps)
      local _, oy = ps:getOffset()
      return oy
    end,
    set = function(ps, v)
      local ox, _ = ps:getOffset()
      ps:setOffset(ox, v)
    end,
    type = "number",
    props = { type = "number", min = -1000, max = 1000, step = 1 },
    group = "Offset",
  },
  {
    key = "relativeRotation",
    label = "Relative Rotation",
    get = function(ps)
      return ps:hasRelativeRotation()
    end,
    set = function(ps, v)
      ps:setRelativeRotation(v)
    end,
    type = "boolean",
    group = "Rotation",
  },
  {
    key = "insertMode",
    label = "Insert Mode",
    get = function(ps)
      return ps:getInsertMode()
    end,
    set = function(ps, v)
      ps:setInsertMode(v)
    end,
    type = "select",
    props = { options = { "top", "bottom", "random" } },
    group = "Visual",
  },
  {
    key = "colors",
    label = "Colors",
    get = function(ps)
      local colors = { ps:getColors() }
      local parts = {}
      for _, c in ipairs(colors) do
        if type(c) == "table" then
          for _, v in ipairs(c) do
            parts[#parts + 1] = string.format("%.2f", v)
          end
        else
          parts[#parts + 1] = string.format("%.2f", c)
        end
      end
      return table.concat(parts, ", ")
    end,
    set = function(ps, v)
      local nums = {}
      for n in tostring(v):gmatch("[^,]+") do
        local val = tonumber(n:match("^%s*(.-)%s*$"))
        if val then
          nums[#nums + 1] = val
        end
      end
      if #nums >= 4 then
        ps:setColors(unpack(nums))
      end
    end,
    type = "vector",
    props = { labels = { "R", "G", "B", "A" }, type = "number", min = 0, max = 1, step = 0.01, repeating = true },
    group = "Visual",
  },
}

--- Handle param updates from the desktop (live editing).
function ParticleEditorPlugin:handleParamsUpdate(request, feather)
  local params = request.params or {}

  -- Handle system selection before resolving the active PS so property updates
  -- in the same message target the correct system.
  if params.system then
    if self.systemMap[params.system] and params.system ~= self.activeSystem then
      self.activeSystem = params.system
      -- Push fresh config so desktop inputs reflect the new system's values.
      feather:__sendHello()
    end
  end

  local ps = self:_getActivePS()
  if not ps then
    return
  end

  for _, prop in ipairs(PROPERTIES) do
    local raw = params[prop.key]
    if raw ~= nil then
      local value = self:_coerce(raw, prop)
      if value ~= nil then
        local ok, err = pcall(prop.set, ps, value)
        if not ok and self.logger then
          self.logger:log({
            type = "error",
            str = "[ParticleEditor] Failed to set " .. prop.key .. ": " .. tostring(err),
          })
        end
      end
    end
  end
end

--- Coerce a raw value to the property's type.
function ParticleEditorPlugin:_coerce(raw, prop)
  if prop.type == "number" then
    local n = tonumber(raw)
    if not n then
      return nil
    end
    local p = prop.props or {}
    if p.min and n < p.min then
      n = p.min
    end
    if p.max and n > p.max then
      n = p.max
    end
    return n
  elseif prop.type == "boolean" then
    return raw == "true" or raw == true
  elseif prop.type == "select" then
    return tostring(raw)
  else
    return tostring(raw)
  end
end

--- Handle actions: export, emit, reset.
function ParticleEditorPlugin:handleActionRequest(request, _feather)
  local action = request.params and request.params.action
  local ps = self:_getActivePS()

  if action == "export" then
    if not ps then
      return nil, "No active particle system"
    end
    local code = self:_generateCode()
    return {
      clipboard = code,
    }
  end

  if action == "emit" then
    if not ps then
      return nil, "No active particle system"
    end
    local count = tonumber(request.params and request.params.emitCount) or 100
    ps:emit(count)
    return true
  end

  if action == "reset" then
    if not ps then
      return nil, "No active particle system"
    end
    ps:reset()
    ps:start()
    return true
  end

  return true
end

--- Format a number: up to 5 decimal places, trailing zeros stripped.
---@param n number
---@return string
local function fmtNum(n)
  local s = string.format("%.5f", n)
  -- Strip trailing zeros after decimal point
  s = s:gsub("(%..-)0+$", "%1")
  -- Strip trailing dot if all decimals were zeros
  s = s:gsub("%.$", "")
  return s
end

--- Generate Lua code for the active particle system.
---@return string
function ParticleEditorPlugin:_generateCode()
  local ps = self:_getActivePS()
  if not ps then
    return "-- No active particle system"
  end

  local entry = self.systemMap[self.activeSystem]
  local imageRef = entry and entry.imageRef or "image"

  local lines = {}
  lines[#lines + 1] = "-- Generated by Feather Particle Editor"
  lines[#lines + 1] = "-- " .. os.date("%Y-%m-%d %H:%M:%S")
  lines[#lines + 1] = ""
  lines[#lines + 1] = string.format("local ps = love.graphics.newParticleSystem(%s, %d)", imageRef, ps:getBufferSize())
  lines[#lines + 1] = ""

  -- Colors
  local colors = { ps:getColors() }
  if #colors > 0 then
    local parts = {}
    for _, c in ipairs(colors) do
      if type(c) == "table" then
        for _, v in ipairs(c) do
          parts[#parts + 1] = fmtNum(v)
        end
      else
        parts[#parts + 1] = fmtNum(c)
      end
    end
    lines[#lines + 1] = "ps:setColors(" .. table.concat(parts, ", ") .. ")"
  end

  -- Direction
  lines[#lines + 1] = "ps:setDirection(" .. fmtNum(ps:getDirection()) .. ")"

  -- Emission area
  local dist, dx, dy, angle, rel = ps:getEmissionArea()
  lines[#lines + 1] = string.format(
    'ps:setEmissionArea("%s", %s, %s, %s, %s)',
    dist,
    fmtNum(dx),
    fmtNum(dy),
    fmtNum(angle),
    tostring(rel)
  )

  -- Emission rate
  lines[#lines + 1] = "ps:setEmissionRate(" .. fmtNum(ps:getEmissionRate()) .. ")"

  -- Emitter lifetime
  lines[#lines + 1] = "ps:setEmitterLifetime(" .. fmtNum(ps:getEmitterLifetime()) .. ")"

  -- Insert mode
  lines[#lines + 1] = string.format('ps:setInsertMode("%s")', ps:getInsertMode())

  -- Linear acceleration
  local xmin, ymin, xmax, ymax = ps:getLinearAcceleration()
  lines[#lines + 1] = "ps:setLinearAcceleration("
    .. fmtNum(xmin)
    .. ", "
    .. fmtNum(ymin)
    .. ", "
    .. fmtNum(xmax)
    .. ", "
    .. fmtNum(ymax)
    .. ")"

  -- Linear damping
  local ldmin, ldmax = ps:getLinearDamping()
  lines[#lines + 1] = "ps:setLinearDamping(" .. fmtNum(ldmin) .. ", " .. fmtNum(ldmax) .. ")"

  -- Offset
  local ox, oy = ps:getOffset()
  lines[#lines + 1] = "ps:setOffset(" .. fmtNum(ox) .. ", " .. fmtNum(oy) .. ")"

  -- Particle lifetime
  local plmin, plmax = ps:getParticleLifetime()
  lines[#lines + 1] = "ps:setParticleLifetime(" .. fmtNum(plmin) .. ", " .. fmtNum(plmax) .. ")"

  -- Radial acceleration
  local ramin, ramax = ps:getRadialAcceleration()
  lines[#lines + 1] = "ps:setRadialAcceleration(" .. fmtNum(ramin) .. ", " .. fmtNum(ramax) .. ")"

  -- Relative rotation
  lines[#lines + 1] = "ps:setRelativeRotation(" .. tostring(ps:hasRelativeRotation()) .. ")"

  -- Rotation
  local rotmin, rotmax = ps:getRotation()
  lines[#lines + 1] = "ps:setRotation(" .. fmtNum(rotmin) .. ", " .. fmtNum(rotmax) .. ")"

  -- Sizes
  local sizes = { ps:getSizes() }
  if #sizes > 0 then
    local parts = {}
    for _, s in ipairs(sizes) do
      parts[#parts + 1] = fmtNum(s)
    end
    lines[#lines + 1] = "ps:setSizes(" .. table.concat(parts, ", ") .. ")"
  end

  -- Size variation
  lines[#lines + 1] = "ps:setSizeVariation(" .. fmtNum(ps:getSizeVariation()) .. ")"

  -- Speed
  local smin, smax = ps:getSpeed()
  lines[#lines + 1] = "ps:setSpeed(" .. fmtNum(smin) .. ", " .. fmtNum(smax) .. ")"

  -- Spin
  local spmin, spmax = ps:getSpin()
  lines[#lines + 1] = "ps:setSpin(" .. fmtNum(spmin) .. ", " .. fmtNum(spmax) .. ")"

  -- Spin variation
  lines[#lines + 1] = "ps:setSpinVariation(" .. fmtNum(ps:getSpinVariation()) .. ")"

  -- Spread
  lines[#lines + 1] = "ps:setSpread(" .. fmtNum(ps:getSpread()) .. ")"

  -- Tangential acceleration
  local tamin, tamax = ps:getTangentialAcceleration()
  lines[#lines + 1] = "ps:setTangentialAcceleration(" .. fmtNum(tamin) .. ", " .. fmtNum(tamax) .. ")"

  lines[#lines + 1] = ""
  lines[#lines + 1] = "-- Usage:"
  lines[#lines + 1] = "-- ps:start()"
  lines[#lines + 1] = "-- function love.update(dt)  ps:update(dt)  end"
  lines[#lines + 1] = "-- function love.draw()  love.graphics.draw(ps, x, y)  end"
  lines[#lines + 1] = ""
  lines[#lines + 1] = "return ps"

  return table.concat(lines, "\n")
end

--- Push current property values as a table.
function ParticleEditorPlugin:handleRequest(_request, _feather)
  local ps = self:_getActivePS()
  if not ps then
    return {
      type = "table",
      loading = false,
      columns = {
        { key = "name", label = "Property" },
        { key = "value", label = "Value" },
      },
      data = { { name = "Status", value = "No particle system registered" } },
    }
  end

  local rows = {}
  for _, prop in ipairs(PROPERTIES) do
    local ok, value = pcall(prop.get, ps)
    rows[#rows + 1] = {
      name = prop.label,
      value = ok and tostring(value) or "error",
    }
  end

  -- Add live stats
  rows[#rows + 1] = { name = "Active Particles", value = tostring(ps:getCount()) }
  rows[#rows + 1] = { name = "Buffer Size", value = tostring(ps:getBufferSize()) }

  return {
    type = "table",
    loading = false,
    columns = {
      { key = "name", label = "Property" },
      { key = "value", label = "Value" },
    },
    data = rows,
  }
end

--- Build action list with current values for the desktop UI.
function ParticleEditorPlugin:getConfig()
  local ps = self:_getActivePS()
  local actions = {}

  -- System selector (if multiple registered)
  if #self.systems > 1 then
    local names = {}
    for _, s in ipairs(self.systems) do
      names[#names + 1] = s.name
    end
    actions[#actions + 1] = {
      label = "Particle System",
      key = "system",
      icon = "sparkles",
      type = "select",
      value = self.activeSystem or "",
      props = { options = names },
    }
  end

  -- Action buttons
  actions[#actions + 1] = { label = "Export Code", key = "export", icon = "download", type = "button" }
  actions[#actions + 1] = { label = "Emit", key = "emit", icon = "zap", type = "button" }
  actions[#actions + 1] = { label = "Reset", key = "reset", icon = "rotate-ccw", type = "button" }
  actions[#actions + 1] = {
    label = "Emit Count",
    key = "emitCount",
    icon = "hash",
    type = "input",
    value = 100,
    props = { type = "number", min = 1, max = 10000 },
  }

  -- Property inputs (only if a system is active)
  if ps then
    for _, prop in ipairs(PROPERTIES) do
      local ok, value = pcall(prop.get, ps)
      if ok then
        if prop.type == "boolean" then
          actions[#actions + 1] = {
            label = prop.label,
            key = prop.key,
            icon = "sliders-horizontal",
            type = "checkbox",
            value = value,
            group = prop.group,
          }
        elseif prop.type == "select" then
          actions[#actions + 1] = {
            label = prop.label,
            key = prop.key,
            icon = "list",
            type = "select",
            value = tostring(value),
            props = prop.props,
            group = prop.group,
          }
        elseif prop.type == "vector" then
          actions[#actions + 1] = {
            label = prop.label,
            key = prop.key,
            icon = "sliders-horizontal",
            type = "vector",
            value = tostring(value),
            props = prop.props or {},
            group = prop.group,
          }
        else
          actions[#actions + 1] = {
            label = prop.label,
            key = prop.key,
            icon = "sliders-horizontal",
            type = "input",
            value = value,
            props = prop.props or {},
            group = prop.group,
          }
        end
      end
    end
  end

  return {
    type = "particle-editor",
    icon = "sparkles",
    tabName = "Particles",
    docs = "https://github.com/Kyonru/feather/tree/main/src-lua/plugins/particle-editor",
    actions = actions,
  }
end

-- Expose the class + a singleton instance ref for demo hookup
ParticleEditorPlugin.instance = nil

return ParticleEditorPlugin
