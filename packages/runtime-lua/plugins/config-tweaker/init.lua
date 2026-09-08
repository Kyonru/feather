local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")

---@class ConfigField
---@field key string       Unique key for this config field
---@field label string     Display label in the desktop UI
---@field icon? string     Lucide icon name (default: "sliders-horizontal")
---@field get fun(): any   Getter — returns current value
---@field set fun(v: any)  Setter — applies the new value
---@field type string      "number"|"string"|"boolean"
---@field min? number      Min value (number fields)
---@field max? number      Max value (number fields)
---@field step? number     Step increment (number fields)

---@class ConfigTweakerPlugin: FeatherPlugin
---@field fields ConfigField[]
---@field fieldMap table<string, ConfigField>
local ConfigTweakerPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.fields = {}
    self.fieldMap = {}

    if self.options.fields then
      for _, field in ipairs(self.options.fields) do
        self:addField(field)
      end
    end
  end,
})

--- Register a config field for tweaking.
---@param field ConfigField
function ConfigTweakerPlugin:addField(field)
  local f = {
    key = field.key,
    label = field.label or field.key,
    icon = field.icon or "sliders-horizontal",
    get = field.get,
    set = field.set,
    type = field.type or "number",
    min = field.min,
    max = field.max,
    step = field.step,
  }
  self.fields[#self.fields + 1] = f
  self.fieldMap[f.key] = f
end

--- Handle param updates from the desktop (input value changes).
function ConfigTweakerPlugin:handleParamsUpdate(request, _feather)
  local params = request.params or {}
  for key, rawValue in pairs(params) do
    local field = self.fieldMap[key]
    if field then
      local value = self:_coerce(rawValue, field)
      if value ~= nil then
        local ok, err = pcall(field.set, value)
        if not ok and self.logger and self.logger.log then
          self.logger:log({
            type = "error",
            str = "[ConfigTweaker] Failed to set " .. key .. ": " .. tostring(err),
          })
        end
      end
    end
  end
end

--- Coerce a raw string value to the field's declared type.
---@param raw any
---@param field ConfigField
---@return any
function ConfigTweakerPlugin:_coerce(raw, field)
  if field.type == "number" then
    local n = tonumber(raw)
    if not n then
      return nil
    end
    if field.min and n < field.min then
      n = field.min
    end
    if field.max and n > field.max then
      n = field.max
    end
    return n
  elseif field.type == "boolean" then
    return raw == "true" or raw == true
  else
    return tostring(raw)
  end
end

--- Handle reset action.
function ConfigTweakerPlugin:handleActionRequest(request, _feather)
  local action = request.params and request.params.action
  if action == "refresh" then
    return true
  end
end

--- Push current values as a table to the desktop.
function ConfigTweakerPlugin:handleRequest(_request, _feather)
  local rows = {}
  for _, field in ipairs(self.fields) do
    local ok, value = pcall(field.get)
    rows[#rows + 1] = {
      name = field.label,
      key = field.key,
      type = field.type,
      value = ok and tostring(value) or "error",
    }
  end

  return {
    type = "table",
    loading = false,
    columns = {
      { key = "name", label = "Config" },
      { key = "value", label = "Value" },
      { key = "type", label = "Type" },
    },
    data = rows,
  }
end

--- Build the action list with current values so the desktop inputs stay in sync.
function ConfigTweakerPlugin:getConfig()
  local actions = {
    { label = "Refresh", key = "refresh", icon = "refresh-cw", type = "button" },
  }

  for _, field in ipairs(self.fields) do
    local ok, value = pcall(field.get)
    local props = {}

    if field.type == "number" then
      props.type = "number"
      if field.min then
        props.min = field.min
      end
      if field.max then
        props.max = field.max
      end
      if field.step then
        props.step = field.step
      end
    end

    if field.type == "boolean" then
      actions[#actions + 1] = {
        label = field.label,
        key = field.key,
        icon = field.icon,
        type = "checkbox",
        value = ok and value or false,
      }
    else
      actions[#actions + 1] = {
        label = field.label,
        key = field.key,
        icon = field.icon,
        type = "input",
        value = ok and tostring(value) or "",
        props = props,
      }
    end
  end

  return {
    type = "config-tweaker",
    icon = "sliders-horizontal",
    tabName = "Config",
    docs = "https://github.com/Kyonru/feather/tree/main/src-lua/plugins/config-tweaker",
    actions = actions,
  }
end

return ConfigTweakerPlugin
