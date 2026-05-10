local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")

---@class PhysicsDebugPlugin: FeatherPlugin
---@field worlds table[]           Array of { name, getter } entries
---@field enabled boolean          Whether the overlay is drawn
---@field showBodies boolean
---@field showJoints boolean
---@field showContacts boolean
---@field showAABBs boolean
---@field alpha number             Overlay transparency
---@field _hooked boolean
local PhysicsDebugPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.worlds = {}
    self.enabled = self.options.enabled ~= false
    self.showBodies = self.options.showBodies ~= false
    self.showJoints = self.options.showJoints ~= false
    self.showContacts = self.options.showContacts ~= false
    self.showAABBs = self.options.showAABBs == true
    self.alpha = self.options.alpha or 0.7
    self._hooked = false
  end,
})

--- Register a physics World to debug-draw.
---@param name string       Display label
---@param getter function   Function that returns the love.physics.World
function PhysicsDebugPlugin:addWorld(name, getter)
  for i, w in ipairs(self.worlds) do
    if w.name == name then
      self.worlds[i] = { name = name, getter = getter }
      return
    end
  end
  self.worlds[#self.worlds + 1] = { name = name, getter = getter }
end

--- Remove a tracked world.
---@param name string
function PhysicsDebugPlugin:removeWorld(name)
  for i, w in ipairs(self.worlds) do
    if w.name == name then
      table.remove(self.worlds, i)
      return
    end
  end
end

--- Called by the plugin manager's central love.draw dispatcher.
function PhysicsDebugPlugin:onDraw()
  self:draw()
end

-- Color palette
local COLORS = {
  static = { 0.5, 0.5, 0.5 }, -- gray
  dynamic = { 0.2, 0.8, 0.2 }, -- green
  kinematic = { 0.2, 0.5, 0.9 }, -- blue
  sleeping = { 0.4, 0.4, 0.6 }, -- muted blue
  sensor = { 1.0, 0.8, 0.0 }, -- yellow
  joint = { 0.8, 0.2, 0.8 }, -- purple
  contact = { 1.0, 0.2, 0.2 }, -- red
  aabb = { 0.6, 0.6, 0.2 }, -- olive
}

--- Get the draw color for a body.
---@param body love.Body
---@param fixture love.Fixture
---@return number r, number g, number b
local function getColor(body, fixture)
  if fixture:isSensor() then
    return COLORS.sensor[1], COLORS.sensor[2], COLORS.sensor[3]
  end

  local bodyType = body:getType()
  if bodyType == "static" then
    return COLORS.static[1], COLORS.static[2], COLORS.static[3]
  elseif bodyType == "kinematic" then
    return COLORS.kinematic[1], COLORS.kinematic[2], COLORS.kinematic[3]
  end

  -- Dynamic
  if not body:isAwake() then
    return COLORS.sleeping[1], COLORS.sleeping[2], COLORS.sleeping[3]
  end
  return COLORS.dynamic[1], COLORS.dynamic[2], COLORS.dynamic[3]
end

--- Draw a single shape.
---@param body love.Body
---@param shape love.Shape
local function drawShape(body, shape)
  local shapeType = shape:getType()

  if shapeType == "circle" then
    local cx, cy = body:getWorldPoint(shape:getPoint())
    local r = shape:getRadius()
    love.graphics.circle("line", cx, cy, r)
    -- Draw direction line
    local angle = body:getAngle()
    love.graphics.line(cx, cy, cx + r * math.cos(angle), cy + r * math.sin(angle))
  elseif shapeType == "polygon" then
    love.graphics.polygon("line", body:getWorldPoints(shape:getPoints()))
  elseif shapeType == "edge" then
    love.graphics.line(body:getWorldPoints(shape:getPoints()))
  elseif shapeType == "chain" then
    local points = { body:getWorldPoints(shape:getPoints()) }
    if #points >= 4 then
      love.graphics.line(unpack(points))
    end
  end
end

--- Draw an AABB for a fixture.
---@param fixture love.Fixture
local function drawAABB(fixture)
  local topLeftX, topLeftY, bottomRightX, bottomRightY = fixture:getBoundingBox()
  love.graphics.rectangle("line", topLeftX, topLeftY, bottomRightX - topLeftX, bottomRightY - topLeftY)
end

--- Draw a joint.
---@param joint love.Joint
local function drawJoint(joint)
  local x1, y1, x2, y2 = joint:getAnchors()
  if x1 and y1 and x2 and y2 then
    love.graphics.line(x1, y1, x2, y2)
    love.graphics.circle("fill", x1, y1, 3)
    love.graphics.circle("fill", x2, y2, 3)
  elseif x1 and y1 then
    love.graphics.circle("fill", x1, y1, 3)
  end
end

--- Render the debug overlay. Call at the end of love.draw()
--- (called automatically if autoHook is enabled).
function PhysicsDebugPlugin:draw()
  if not self.enabled then
    return
  end

  -- Save graphics state
  local r, g, b, a = love.graphics.getColor()
  local lineWidth = love.graphics.getLineWidth()
  love.graphics.setLineWidth(1)

  for _, entry in ipairs(self.worlds) do
    local ok, world = pcall(entry.getter)
    if ok and world then
      -- Draw bodies & shapes
      if self.showBodies then
        for _, body in ipairs(world:getBodies()) do
          for _, fixture in ipairs(body:getFixtures()) do
            local cr, cg, cb = getColor(body, fixture)
            love.graphics.setColor(cr, cg, cb, self.alpha)
            drawShape(body, fixture:getShape())

            if self.showAABBs then
              love.graphics.setColor(COLORS.aabb[1], COLORS.aabb[2], COLORS.aabb[3], self.alpha * 0.5)
              drawAABB(fixture)
            end
          end
        end
      end

      -- Draw joints
      if self.showJoints then
        love.graphics.setColor(COLORS.joint[1], COLORS.joint[2], COLORS.joint[3], self.alpha)
        for _, joint in ipairs(world:getJoints()) do
          drawJoint(joint)
        end
      end

      -- Draw contacts
      if self.showContacts then
        love.graphics.setColor(COLORS.contact[1], COLORS.contact[2], COLORS.contact[3], self.alpha)
        for _, contact in ipairs(world:getContacts()) do
          if contact:isTouching() then
            local x1, y1, x2, y2 = contact:getPositions()
            if x1 and y1 then
              love.graphics.circle("fill", x1, y1, 4)
            end
            if x2 and y2 then
              love.graphics.circle("fill", x2, y2, 4)
            end
          end
        end
      end
    end
  end

  -- Restore graphics state
  love.graphics.setLineWidth(lineWidth)
  love.graphics.setColor(r, g, b, a)
end

function PhysicsDebugPlugin:update()
  -- No per-frame work needed; drawing happens in love.draw via hook
end

function PhysicsDebugPlugin:handleRequest()
  local rows = {}
  local totalBodies = 0
  local totalJoints = 0
  local totalContacts = 0

  for _, entry in ipairs(self.worlds) do
    local ok, world = pcall(entry.getter)
    if ok and world then
      local bodies = world:getBodyCount()
      local joints = world:getJointCount()
      local contacts = #world:getContacts()
      totalBodies = totalBodies + bodies
      totalJoints = totalJoints + joints
      totalContacts = totalContacts + contacts

      rows[#rows + 1] = {
        world = entry.name,
        bodies = tostring(bodies),
        joints = tostring(joints),
        contacts = tostring(contacts),
        gravity = string.format("%.1f, %.1f", world:getGravity()),
      }
    else
      rows[#rows + 1] = {
        world = entry.name,
        bodies = "N/A",
        joints = "N/A",
        contacts = "N/A",
        gravity = "N/A",
      }
    end
  end

  -- Summary row if multiple worlds
  if #self.worlds > 1 then
    rows[#rows + 1] = {
      world = "TOTAL",
      bodies = tostring(totalBodies),
      joints = tostring(totalJoints),
      contacts = tostring(totalContacts),
      gravity = "",
    }
  end

  return {
    type = "table",
    loading = false,
    columns = {
      { key = "world", label = "World" },
      { key = "bodies", label = "Bodies" },
      { key = "joints", label = "Joints" },
      { key = "contacts", label = "Contacts" },
      { key = "gravity", label = "Gravity" },
    },
    data = rows,
  }
end

function PhysicsDebugPlugin:handleActionRequest(request)
  local action = request.params and request.params.action

  if action == "toggle" then
    self.enabled = not self.enabled
    return { data = self.enabled and "Overlay enabled" or "Overlay disabled" }
  end

  return nil, "Unknown action: " .. tostring(action)
end

function PhysicsDebugPlugin:handleParamsUpdate(request)
  local params = request.params or {}
  if params.showBodies ~= nil then
    self.showBodies = params.showBodies == "true" or params.showBodies == true
  end
  if params.showJoints ~= nil then
    self.showJoints = params.showJoints == "true" or params.showJoints == true
  end
  if params.showContacts ~= nil then
    self.showContacts = params.showContacts == "true" or params.showContacts == true
  end
  if params.showAABBs ~= nil then
    self.showAABBs = params.showAABBs == "true" or params.showAABBs == true
  end
end

function PhysicsDebugPlugin:getConfig()
  return {
    type = "physics",
    icon = "box",
    tabName = "Physics",
    docs = "https://github.com/Kyonru/feather/tree/main/src-lua/plugins/physics-debug",
    actions = {
      {
        label = self.enabled and "Disable Overlay" or "Enable Overlay",
        key = "toggle",
        icon = self.enabled and "eye-off" or "eye",
        type = "button",
      },
      {
        label = "Bodies",
        key = "showBodies",
        icon = "square",
        type = "checkbox",
        value = tostring(self.showBodies),
      },
      {
        label = "Joints",
        key = "showJoints",
        icon = "link",
        type = "checkbox",
        value = tostring(self.showJoints),
      },
      {
        label = "Contacts",
        key = "showContacts",
        icon = "zap",
        type = "checkbox",
        value = tostring(self.showContacts),
      },
      {
        label = "AABBs",
        key = "showAABBs",
        icon = "maximize-2",
        type = "checkbox",
        value = tostring(self.showAABBs),
      },
    },
  }
end

function PhysicsDebugPlugin:finish() end

return PhysicsDebugPlugin
