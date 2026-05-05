local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".plugins.base")
local inspect = require(FEATHER_PATH .. ".lib.inspect")

--- Resolve a value: if it's a function, call it; otherwise return as-is.
---@param v any
---@return any
local function resolve(v)
  if type(v) == "function" then
    local ok, result = pcall(v)
    return ok and result or nil
  end
  return v
end

--- Safely tostring a value, with a depth-limited inspect for tables.
---@param v any
---@param maxLen number
---@return string
local function safeStr(v, maxLen)
  if v == nil then
    return "nil"
  end
  if type(v) == "table" then
    local ok, s = pcall(inspect, v, { depth = 1 })
    if ok then
      if #s > maxLen then
        s = s:sub(1, maxLen) .. "…"
      end
      return s
    end
  end
  local s = tostring(v)
  if #s > maxLen then
    s = s:sub(1, maxLen) .. "…"
  end
  return s
end

--- Known property names to auto-detect on entities.
local KNOWN_PROPS = {
  "x",
  "y",
  "z",
  "width",
  "height",
  "w",
  "h",
  "rotation",
  "angle",
  "scale",
  "scaleX",
  "scaleY",
  "visible",
  "active",
  "alive",
  "enabled",
  "name",
  "id",
  "tag",
  "type",
  "class",
  "health",
  "hp",
  "speed",
  "velocity",
  "vx",
  "vy",
  "layer",
  "zIndex",
  "order",
}

---@class EntitySource
---@field name string Display name for this source
---@field entities table|function A table of entities, or a function returning one
---@field getChildren? fun(entity: any): table|nil  Optional: return child entities
---@field getProperties? fun(entity: any): table|nil  Optional: return { key = value } for custom props
---@field getName? fun(entity: any, index: number): string  Optional: display name for an entity
---@field filter? fun(entity: any): boolean  Optional: skip entities that return false

---@class EntityInspectorPlugin: FeatherPlugin
---@field sources EntitySource[]
---@field maxValueLen number
---@field maxEntities number
---@field maxDepth number
---@field selectedSource number
---@field searchFilter string
local EntityInspectorPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.sources = {}
    self.maxValueLen = self.options.maxValueLen or 120
    self.maxEntities = self.options.maxEntities or 500
    self.maxDepth = self.options.maxDepth or 3
    self.selectedSource = 1
    self.searchFilter = ""

    -- Register sources passed via options
    if self.options.sources then
      for _, src in ipairs(self.options.sources) do
        self:addSource(src)
      end
    end
  end,
})

--- Register an entity source for inspection.
---@param source EntitySource
function EntityInspectorPlugin:addSource(source)
  self.sources[#self.sources + 1] = {
    name = source.name or ("Source " .. #self.sources + 1),
    entities = source.entities,
    getChildren = source.getChildren,
    getProperties = source.getProperties,
    getName = source.getName,
    filter = source.filter,
  }
end

--- Auto-detect properties on an entity table.
---@param entity table
---@return table<string, string> props  key → display string
local function autoDetectProps(entity, maxLen)
  local props = {}
  -- First pass: known properties in order
  for _, key in ipairs(KNOWN_PROPS) do
    local v = entity[key]
    if v ~= nil then
      props[key] = safeStr(v, maxLen)
    end
  end
  return props
end

--- Build a tree node for a single entity.
---@param entity any
---@param source EntitySource
---@param index number
---@param depth number
---@param maxDepth number
---@param maxLen number
---@param count table  { n = number } mutable counter
---@param maxEntities number
---@return table|nil node
local function buildNode(entity, source, index, depth, maxDepth, maxLen, count, maxEntities)
  if count.n >= maxEntities then
    return nil
  end
  count.n = count.n + 1

  -- Determine display name
  local name
  if source.getName then
    local ok, n = pcall(source.getName, entity, index)
    if ok and n then
      name = tostring(n)
    end
  end
  if not name then
    if type(entity) == "table" then
      name = entity.name or entity.id or entity.tag or entity.type or entity.class
      if name then
        name = tostring(name)
      end
    end
  end
  if not name then
    name = "#" .. index
  end

  -- Collect properties
  local properties = {}
  if source.getProperties then
    local ok, custom = pcall(source.getProperties, entity)
    if ok and type(custom) == "table" then
      for k, v in pairs(custom) do
        properties[tostring(k)] = safeStr(v, maxLen)
      end
    end
  end

  -- Auto-detect if entity is a table
  if type(entity) == "table" then
    local auto = autoDetectProps(entity, maxLen)
    for k, v in pairs(auto) do
      if properties[k] == nil then
        properties[k] = v
      end
    end
  end

  -- Build ordered property list for the desktop
  local propList = {}
  -- Known props first (in order), then any custom ones
  local seen = {}
  for _, key in ipairs(KNOWN_PROPS) do
    if properties[key] then
      propList[#propList + 1] = { key = key, value = properties[key] }
      seen[key] = true
    end
  end
  for k, v in pairs(properties) do
    if not seen[k] then
      propList[#propList + 1] = { key = k, value = v }
    end
  end

  -- Children
  local children = nil
  if depth < maxDepth and source.getChildren then
    local ok, childList = pcall(source.getChildren, entity)
    if ok and type(childList) == "table" then
      children = {}
      for i, child in ipairs(childList) do
        local childNode = buildNode(child, source, i, depth + 1, maxDepth, maxLen, count, maxEntities)
        if childNode then
          children[#children + 1] = childNode
        end
        if count.n >= maxEntities then
          break
        end
      end
      if #children == 0 then
        children = nil
      end
    end
  end

  return {
    name = name,
    properties = propList,
    children = children,
  }
end

--- Return data for the desktop. Called by plugin_manager:pushAll() via handleRequest().
function EntityInspectorPlugin:handleRequest(_request, _feather)
  if #self.sources == 0 then
    return {
      type = "tree",
      loading = false,
      sources = {},
      selectedSource = self.selectedSource,
      nodes = {},
      searchFilter = self.searchFilter,
    }
  end

  -- Clamp selectedSource
  local srcIdx = self.selectedSource
  if srcIdx < 1 then
    srcIdx = 1
  end
  if srcIdx > #self.sources then
    srcIdx = #self.sources
  end

  local source = self.sources[srcIdx]
  local entityList = resolve(source.entities)

  local sourceNames = {}
  for i, src in ipairs(self.sources) do
    sourceNames[i] = src.name
  end

  if type(entityList) ~= "table" then
    return {
      type = "tree",
      loading = false,
      sources = sourceNames,
      selectedSource = srcIdx,
      nodes = {},
      searchFilter = self.searchFilter,
    }
  end

  -- Build tree
  local count = { n = 0 }
  local nodes = {}
  local filter = self.searchFilter ~= "" and self.searchFilter:lower() or nil

  for i, entity in ipairs(entityList) do
    -- Apply user filter
    if source.filter then
      local ok, pass = pcall(source.filter, entity)
      if ok and not pass then
        goto continue
      end
    end

    local node = buildNode(entity, source, i, 1, self.maxDepth, self.maxValueLen, count, self.maxEntities)

    if node then
      -- Apply search filter (name match)
      if filter then
        if not node.name:lower():find(filter, 1, true) then
          goto continue
        end
      end
      nodes[#nodes + 1] = node
    end

    if count.n >= self.maxEntities then
      break
    end

    ::continue::
  end

  return {
    type = "tree",
    loading = false,
    sources = sourceNames,
    selectedSource = srcIdx,
    nodes = nodes,
    searchFilter = self.searchFilter,
    total = #entityList,
    shown = #nodes,
  }
end

function EntityInspectorPlugin:handleParamsUpdate(request, _feather)
  local params = request.params or {}
  if params.selectedSource ~= nil then
    self.selectedSource = tonumber(params.selectedSource) or 1
  end
  if params.searchFilter ~= nil then
    self.searchFilter = tostring(params.searchFilter)
  end
end

function EntityInspectorPlugin:handleActionRequest(request, _feather)
  local action = request.params and request.params.action
  if action == "refresh" then
    return true
  end
end

function EntityInspectorPlugin:getConfig()
  return {
    type = "entity-inspector",
    icon = "boxes",
    tabName = "Entities",
    docs = "https://github.com/Kyonru/feather/tree/main/src-lua/plugins/entity-inspector",
    actions = {
      { label = "Refresh", key = "refresh", icon = "refresh-cw", type = "button" },
    },
  }
end

return EntityInspectorPlugin
