--- Depends on bump.lua for collision world management.
--- https://github.com/kikito/bump.lua

local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".plugins.base")

--- Collision Debug Plugin — visualize bump.lua AABB collision worlds.
--- Draws bounding boxes for all items, optional cell grid, and tracks collision stats.
--- Follows the same overlay pattern as the physics-debug plugin.

---@class BumpWorldEntry
---@field name string
---@field getter function  Returns the bump world
---@field colorFn function|nil  Optional (item) -> r,g,b,a for per-item colors
---@field labelFn function|nil  Optional (item) -> string for item labels

---@class CollisionDebugPlugin: FeatherPlugin
---@field worlds BumpWorldEntry[]
---@field enabled boolean
---@field showGrid boolean
---@field showLabels boolean
---@field alpha number
---@field _hooked boolean
---@field _origDraw function|nil
---@field _collisionLog table[]  Recent collisions for the table view
---@field _maxLog number
local CollisionDebugPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.worlds = {}
    self.enabled = self.options.enabled ~= false
    self.showGrid = self.options.showGrid == true
    self.showLabels = self.options.showLabels == true
    self.alpha = self.options.alpha or 0.6
    self._hooked = false
    self._origDraw = nil
    self._collisionLog = {}
    self._maxLog = self.options.maxLog or 200

    if self.options.autoHook ~= false then
      self:hookDraw()
    end
  end,
})

--- Register a bump.lua world for debug drawing.
---@param name string       Display label
---@param getter function   Returns the bump world
---@param colorFn? function (item) -> r,g,b  Optional per-item color
---@param labelFn? function (item) -> string Optional per-item label
function CollisionDebugPlugin:addWorld(name, getter, colorFn, labelFn)
  for i, w in ipairs(self.worlds) do
    if w.name == name then
      self.worlds[i] = { name = name, getter = getter, colorFn = colorFn, labelFn = labelFn }
      return
    end
  end
  self.worlds[#self.worlds + 1] = { name = name, getter = getter, colorFn = colorFn, labelFn = labelFn }
end

--- Remove a tracked world.
---@param name string
function CollisionDebugPlugin:removeWorld(name)
  for i, w in ipairs(self.worlds) do
    if w.name == name then
      table.remove(self.worlds, i)
      return
    end
  end
end

--- Record a collision for the log (call from your game code after world:move).
---@param item any      The item that moved
---@param other any     The item it collided with
---@param colType string  Collision response type ("slide", "touch", "cross", "bounce")
---@param normal? table  {x, y} collision normal
function CollisionDebugPlugin:logCollision(item, other, colType, normal)
  local entry = {
    time = love.timer.getTime(),
    item = tostring(item),
    other = tostring(other),
    type = colType or "?",
    nx = normal and normal.x or 0,
    ny = normal and normal.y or 0,
  }
  self._collisionLog[#self._collisionLog + 1] = entry
  if #self._collisionLog > self._maxLog then
    table.remove(self._collisionLog, 1)
  end
end

--- Hook love.draw() to auto-render the debug overlay.
function CollisionDebugPlugin:hookDraw()
  if self._hooked then
    return
  end

  local plugin = self
  local origDraw = love.draw
  self._origDraw = origDraw

  love.draw = function()
    if origDraw then
      origDraw()
    end
    plugin:draw()
  end

  self._hooked = true
end

--- Unhook love.draw() and restore the original.
function CollisionDebugPlugin:unhookDraw()
  if not self._hooked then
    return
  end
  if self._origDraw then
    love.draw = self._origDraw
  end
  self._origDraw = nil
  self._hooked = false
end

-- Default color palette for items without a colorFn
local DEFAULT_COLOR = { 0.2, 0.8, 0.4 } -- green
local GRID_COLOR = { 0.3, 0.3, 0.3 }

--- Render the debug overlay. Call at the end of love.draw()
--- (called automatically if autoHook is enabled).
function CollisionDebugPlugin:draw()
  if not self.enabled then
    return
  end

  local r, g, b, a = love.graphics.getColor()
  local lineWidth = love.graphics.getLineWidth()
  love.graphics.setLineWidth(1)

  for _, entry in ipairs(self.worlds) do
    local ok, world = pcall(entry.getter)
    if ok and world then
      -- Draw cell grid
      if self.showGrid and world.cellSize then
        love.graphics.setColor(GRID_COLOR[1], GRID_COLOR[2], GRID_COLOR[3], self.alpha * 0.3)
        local sw, sh = love.graphics.getDimensions()
        local cs = world.cellSize
        for gx = 0, sw, cs do
          love.graphics.line(gx, 0, gx, sh)
        end
        for gy = 0, sh, cs do
          love.graphics.line(0, gy, sw, gy)
        end
      end

      -- Draw item rectangles
      local items, len = world:getItems()
      for i = 1, len do
        local item = items[i]
        local ix, iy, iw, ih = world:getRect(item)

        if entry.colorFn then
          local cr, cg, cb = entry.colorFn(item)
          love.graphics.setColor(cr or DEFAULT_COLOR[1], cg or DEFAULT_COLOR[2], cb or DEFAULT_COLOR[3], self.alpha)
        else
          love.graphics.setColor(DEFAULT_COLOR[1], DEFAULT_COLOR[2], DEFAULT_COLOR[3], self.alpha)
        end

        love.graphics.rectangle("line", ix, iy, iw, ih)

        -- Draw label
        if self.showLabels and entry.labelFn then
          local label = entry.labelFn(item)
          if label then
            love.graphics.setColor(1, 1, 1, self.alpha)
            love.graphics.print(label, ix, iy - 14)
          end
        end
      end
    end
  end

  love.graphics.setLineWidth(lineWidth)
  love.graphics.setColor(r, g, b, a)
end

function CollisionDebugPlugin:update()
  -- No per-frame work; drawing happens in love.draw via hook
end

function CollisionDebugPlugin:handleRequest()
  local rows = {}
  local totalItems = 0
  local totalCells = 0

  for _, entry in ipairs(self.worlds) do
    local ok, world = pcall(entry.getter)
    if ok and world then
      local itemCount = world:countItems()
      local cellCount = world:countCells()
      totalItems = totalItems + itemCount
      totalCells = totalCells + cellCount

      rows[#rows + 1] = {
        world = entry.name,
        items = tostring(itemCount),
        cells = tostring(cellCount),
        cellSize = world.cellSize and tostring(world.cellSize) or "?",
      }
    else
      rows[#rows + 1] = {
        world = entry.name,
        items = "N/A",
        cells = "N/A",
        cellSize = "N/A",
      }
    end
  end

  if #self.worlds > 1 then
    rows[#rows + 1] = {
      world = "TOTAL",
      items = tostring(totalItems),
      cells = tostring(totalCells),
      cellSize = "",
    }
  end

  return {
    type = "table",
    loading = false,
    columns = {
      { key = "world", label = "World" },
      { key = "items", label = "Items" },
      { key = "cells", label = "Cells" },
      { key = "cellSize", label = "Cell Size" },
    },
    data = rows,
  }
end

function CollisionDebugPlugin:handleActionRequest(request)
  local action = request.params and request.params.action
  if action == "toggle" then
    self.enabled = not self.enabled
    return { data = self.enabled and "Overlay enabled" or "Overlay disabled" }
  elseif action == "clear-log" then
    self._collisionLog = {}
    return "Collision log cleared"
  end
  return nil, "Unknown action: " .. tostring(action)
end

function CollisionDebugPlugin:handleParamsUpdate(request)
  local params = request.params or {}
  if params.showGrid ~= nil then
    self.showGrid = params.showGrid == "true" or params.showGrid == true
  end
  if params.showLabels ~= nil then
    self.showLabels = params.showLabels == "true" or params.showLabels == true
  end
end

function CollisionDebugPlugin:getConfig()
  local totalItems = 0
  local totalCells = 0
  for _, entry in ipairs(self.worlds) do
    local ok, world = pcall(entry.getter)
    if ok and world then
      totalItems = totalItems + world:countItems()
      totalCells = totalCells + world:countCells()
    end
  end

  return {
    type = "collision-debug",
    color = "#f97316",
    icon = "grid-3x3",
    tabName = "Collision",
    actions = {
      -- Toolbar
      {
        label = self.enabled and "Disable Overlay" or "Enable Overlay",
        key = "toggle",
        icon = self.enabled and "eye-off" or "eye",
        type = "button",
      },
      { label = "Clear Log", key = "clear-log", icon = "trash-2", type = "button" },
      { label = "Grid", key = "showGrid", icon = "grid-3x3", type = "checkbox", value = tostring(self.showGrid) },
      { label = "Labels", key = "showLabels", icon = "tag", type = "checkbox", value = tostring(self.showLabels) },

      -- Stats card
      {
        label = "Worlds",
        key = "worldCount",
        icon = "globe",
        type = "input",
        value = tostring(#self.worlds),
        props = { disabled = true },
        group = "Stats",
      },
      {
        label = "Total Items",
        key = "totalItems",
        icon = "box",
        type = "input",
        value = tostring(totalItems),
        props = { disabled = true },
        group = "Stats",
      },
      {
        label = "Total Cells",
        key = "totalCells",
        icon = "layout-grid",
        type = "input",
        value = tostring(totalCells),
        props = { disabled = true },
        group = "Stats",
      },
      {
        label = "Logged Collisions",
        key = "loggedCollisions",
        icon = "activity",
        type = "input",
        value = tostring(#self._collisionLog),
        props = { disabled = true },
        group = "Stats",
      },
    },
  }
end

function CollisionDebugPlugin:finish()
  self:unhookDraw()
end

return CollisionDebugPlugin
