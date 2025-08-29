local PATH = (...):gsub("%.utils$", "")

local inspect = require(PATH .. ".lib.inspect")

local function get_current_dir()
  local is_windows = package.config:sub(1, 1) == "\\"
  local cmd = is_windows and "cd" or "pwd"
  local p = io.popen(cmd)
  if not p then
    return ""
  end

  local dir = p:read("*l")
  p:close()

  return dir
end

local function format(...)
  return inspect(..., { newline = "\n", indent = "\t" })
end

-- helper to wrap methods
---@param tbl table
---@param methodName string
---@param callback fun(...: any)
local function wrapWith(tbl, methodName, callback)
  local original = tbl[methodName]
  tbl[methodName] = function(self, ...)
    callback(methodName, ...)
    return original(self, ...)
  end
end

local function startsWith(str, value)
  return string.sub(str, 1, string.len(value)) == value
end

return {
  get_current_dir = get_current_dir,
  format = format,
  wrapWith = wrapWith,
  startsWith = startsWith,
}
