local Class = require(FEATHER_PATH .. ".lib.class")

local PATCH_ROOT = ".feather/hot"
local HOT_RELOAD_PLUGIN_PATH = (...):gsub("%.hot_reloader$", "")

local FeatherHotReloader = Class({})

local function listHas(list, value)
  for _, item in ipairs(list or {}) do
    if item == value then
      return true
    end
  end
  return false
end

local function addUnique(list, value)
  if not listHas(list, value) then
    table.insert(list, value)
  end
end

local function removeValue(list, value)
  for i = #list, 1, -1 do
    if list[i] == value then
      table.remove(list, i)
    end
  end
end

local function isLocalHost(host)
  if host == "localhost" or host == "127.0.0.1" or host == "::1" then
    return true
  end
  if type(host) ~= "string" then
    return false
  end
  if host:match("^127%.") or host:match("^10%.") or host:match("^192%.168%.") then
    return true
  end
  local a, b = host:match("^(172)%.(%d+)%.")
  return a == "172" and tonumber(b) and tonumber(b) >= 16 and tonumber(b) <= 31
end

local function normalizeList(value)
  if type(value) ~= "table" then
    return {}
  end
  return value
end

local function moduleToPath(moduleName)
  return PATCH_ROOT .. "/" .. moduleName:gsub("%.", "/") .. ".lua"
end

local function mkdirs(path)
  local current = ""
  for part in path:gmatch("[^/]+") do
    current = current == "" and part or (current .. "/" .. part)
    love.filesystem.createDirectory(current)
  end
end

local function ensureParentDir(path)
  local parent = path:match("^(.*)/[^/]+$")
  if parent and #parent > 0 then
    mkdirs(parent)
  end
end

local function compileSource(source, moduleName)
  local chunkName = "@" .. moduleName:gsub("%.", "/") .. ".lua"
  local loader = loadstring or load
  local chunk, err = loader(source, chunkName)
  if not chunk then
    return nil, err
  end
  if setfenv then
    setfenv(chunk, _G)
  end
  return chunk
end

local function runModuleChunk(chunk, moduleName)
  local result = { pcall(chunk, moduleName) }
  local ok = table.remove(result, 1)
  if not ok then
    return false, result[1]
  end
  if #result == 0 or result[1] == nil then
    return true, package.loaded[moduleName] or true
  end
  return true, result[1]
end

local function matchesPattern(moduleName, pattern)
  if type(pattern) ~= "string" then
    return false
  end
  if pattern:sub(-2) == ".*" then
    local prefix = pattern:sub(1, -3)
    return moduleName == prefix or moduleName:sub(1, #prefix + 1) == prefix .. "."
  end
  return moduleName == pattern
end

local function matchesAny(moduleName, patterns)
  for _, pattern in ipairs(patterns or {}) do
    if matchesPattern(moduleName, pattern) then
      return true
    end
  end
  return false
end

local function trimTrailingDot(value)
  if type(value) ~= "string" then
    return nil
  end
  return value:gsub("%.$", "")
end

local function isSameOrChild(moduleName, prefix)
  prefix = trimTrailingDot(prefix)
  if not prefix or prefix == "" then
    return false
  end
  return moduleName == prefix or moduleName:sub(1, #prefix + 1) == prefix .. "."
end

local function hasModuleSegment(moduleName, segment)
  return moduleName == segment or moduleName:match("^" .. segment .. "%.") or moduleName:match("%." .. segment .. "%.") or moduleName:match("%." .. segment .. "$")
end

local function isProtectedModule(moduleName)
  if type(moduleName) ~= "string" then
    return true
  end

  if moduleName == "main" or moduleName == "conf" then
    return true
  end

  -- Protect Feather even when installed as lib.feather.* or another prefix.
  if hasModuleSegment(moduleName, "feather") then
    return true
  end
  if isSameOrChild(moduleName, _G.FEATHER_PATH) or isSameOrChild(moduleName, _G.FEATHER_PLUGIN_PATH) then
    return true
  end

  -- The hot-reload plugin owns the allowlist and command handler. Never allow
  -- hot reload to replace itself, even if a broad allowlist includes plugins.*.
  if isSameOrChild(moduleName, HOT_RELOAD_PLUGIN_PATH)
    or isSameOrChild(moduleName, "plugins.hot_reload")
    or isSameOrChild(moduleName, "plugins.hot-reload")
  then
    return true
  end

  return false
end

local function isValidModuleName(moduleName)
  if type(moduleName) ~= "string" or moduleName == "" then
    return false
  end

  for segment in moduleName:gmatch("[^%.]+") do
    if not segment:match("^[%a_][%w_]*$") then
      return false
    end
  end

  return moduleName:sub(1, 1) ~= "." and moduleName:sub(-1) ~= "." and not moduleName:match("%.%.")
end

local function clearDir(path)
  local info = love.filesystem.getInfo(path)
  if not info then
    return
  end
  if info.type ~= "directory" then
    love.filesystem.remove(path)
    return
  end
  for _, item in ipairs(love.filesystem.getDirectoryItems(path)) do
    clearDir(path .. "/" .. item)
  end
  love.filesystem.remove(path)
end

local function installPatchLoader()
  if _G.__FEATHER_HOT_LOADER_INSTALLED then
    return
  end
  local searchers = package.searchers or package.loaders
  if type(searchers) ~= "table" then
    return
  end

  table.insert(searchers, 1, function(moduleName)
    local config = _G.__FEATHER_HOT_RELOAD_CONFIG or {}
    if not config.enabled then
      return "\n\tFeather hot reload is disabled"
    end

    if type(moduleName) ~= "string" or isProtectedModule(moduleName) then
      return "\n\tFeather hot reload skipped " .. tostring(moduleName)
    end
    if matchesAny(moduleName, config.deny) then
      return "\n\tFeather hot reload denied " .. moduleName
    end
    if not matchesAny(moduleName, config.allow) then
      return "\n\tFeather hot reload not allowlisted " .. moduleName
    end

    local path = moduleToPath(moduleName)
    local info = love.filesystem.getInfo(path, "file")
    if not info then
      return "\n\tno Feather hot patch " .. path
    end

    local source, readErr = love.filesystem.read(path)
    if not source then
      return "\n\tfailed to read Feather hot patch " .. tostring(readErr)
    end

    local chunk, compileErr = compileSource(source, moduleName)
    if not chunk then
      return "\n\tfailed to compile Feather hot patch " .. tostring(compileErr)
    end

    return chunk
  end)

  _G.__FEATHER_HOT_LOADER_INSTALLED = true
end

function FeatherHotReloader:init(feather, config)
  config = config or {}
  self.feather = feather
  self.enabled = config.enabled == true
  self.allow = normalizeList(config.allow)
  self.deny = normalizeList(config.deny)
  self.persistToDisk = config.persistToDisk == true
  self.clearOnBoot = config.clearOnBoot == true
  self.requireLocalNetwork = config.requireLocalNetwork ~= false
  self.originals = {}
  self.modifiedModules = {}
  self.persistedModules = {}
  self.failedModules = {}
  self.history = {}

  installPatchLoader()
  _G.__FEATHER_HOT_RELOAD_CONFIG = {
    enabled = self.enabled,
    allow = self.allow,
    deny = self.deny,
  }

  if self.enabled then
    self.feather.featherLogger:logger(
      "[Feather] WARNING: hot reload is enabled. This is development-only remote code execution."
    )
  end

  if self.clearOnBoot then
    clearDir(PATCH_ROOT)
  end
end

function FeatherHotReloader:validate(moduleName)
  if not self.enabled then
    return false, "Hot reload is disabled for this session"
  end

  if self.requireLocalNetwork and not isLocalHost(self.feather.host) then
    return false, "Hot reload requires a local network host"
  end

  if not isValidModuleName(moduleName) then
    return false, "Invalid Lua module name"
  end

  if isProtectedModule(moduleName) then
    return false, "This module is protected"
  end

  if matchesAny(moduleName, self.deny) then
    return false, "Module is denied by hotReload.deny"
  end

  if #self.allow == 0 or not matchesAny(moduleName, self.allow) then
    return false, "Module is not allowlisted by hotReload.allow"
  end

  return true
end

function FeatherHotReloader:addHistory(entry)
  entry.time = os.time()
  table.insert(self.history, entry)
  while #self.history > 50 do
    table.remove(self.history, 1)
  end
end

function FeatherHotReloader:reload(moduleName, source)
  local ok, err = self:validate(moduleName)
  if not ok then
    self:addHistory({ ok = false, module = moduleName or "", error = err })
    addUnique(self.failedModules, moduleName or "")
    return false, err
  end

  if type(source) ~= "string" or source == "" then
    err = "Missing Lua source"
    self:addHistory({ ok = false, module = moduleName, error = err })
    addUnique(self.failedModules, moduleName)
    return false, err
  end

  local chunk, compileErr = compileSource(source, moduleName)
  if not chunk then
    self:addHistory({ ok = false, module = moduleName, error = compileErr })
    addUnique(self.failedModules, moduleName)
    return false, compileErr
  end

  if not self.originals[moduleName] then
    self.originals[moduleName] = {
      exists = package.loaded[moduleName] ~= nil,
      value = package.loaded[moduleName],
    }
  end

  local previous = package.loaded[moduleName]
  package.loaded[moduleName] = nil

  local loaded, nextModule = runModuleChunk(chunk, moduleName)
  if not loaded then
    package.loaded[moduleName] = previous
    self:addHistory({ ok = false, module = moduleName, error = tostring(nextModule) })
    addUnique(self.failedModules, moduleName)
    return false, tostring(nextModule)
  end

  package.loaded[moduleName] = nextModule

  local migrator = type(nextModule) == "table" and nextModule.__feather_reload
  if type(migrator) ~= "function" and type(previous) == "table" then
    migrator = previous.__feather_reload
  end

  if type(migrator) == "function" then
    local migrated, migrationErr = pcall(migrator, nextModule, previous)
    if not migrated then
      package.loaded[moduleName] = previous
      self:addHistory({ ok = false, module = moduleName, error = tostring(migrationErr) })
      addUnique(self.failedModules, moduleName)
      return false, tostring(migrationErr)
    end
  end

  local persisted = false
  if self.persistToDisk then
    local path = moduleToPath(moduleName)
    ensureParentDir(path)
    persisted = love.filesystem.write(path, source) == true
    if persisted then
      addUnique(self.persistedModules, moduleName)
    end
  end

  addUnique(self.modifiedModules, moduleName)
  removeValue(self.failedModules, moduleName)
  self:addHistory({ ok = true, module = moduleName, persisted = persisted })
  return true, nil, persisted
end

function FeatherHotReloader:restore()
  for moduleName, original in pairs(self.originals) do
    if original.exists then
      package.loaded[moduleName] = original.value
    else
      package.loaded[moduleName] = nil
    end
  end

  clearDir(PATCH_ROOT)
  self.originals = {}
  self.modifiedModules = {}
  self.persistedModules = {}
  self.failedModules = {}
  self:addHistory({ ok = true, module = "*", restored = true, persisted = false })
end

function FeatherHotReloader:getState()
  return {
    enabled = self.enabled,
    active = #self.modifiedModules > 0,
    persistToDisk = self.persistToDisk,
    requireLocalNetwork = self.requireLocalNetwork,
    modifiedModules = self.modifiedModules,
    persistedModules = self.persistedModules,
    failedModules = self.failedModules,
    history = self.history,
  }
end

return FeatherHotReloader
