--- Plugin activation policy: manifest validation, API compatibility, capability
--- grants and the structured reason a plugin is not running.
---
--- Pure functions over plain tables, so each rule can be tested without a game
--- loop. The plugin manager computes one activation result per plugin from
--- these before any plugin code runs.
local contract = require(FEATHER_PATH .. ".plugin_contract")

local Policy = {}

local function toSet(list)
  local set = {}
  for _, value in ipairs(list or {}) do
    set[value] = true
  end
  return set
end

Policy.contract = contract
Policy.KNOWN_CAPABILITIES = toSet(contract.capabilities)

local RUNTIME_VALUES = {
  cost = toSet(contract.runtime.cost),
  update = toSet(contract.runtime.update),
  push = toSet(contract.runtime.push),
}

local function copy(source)
  local target = {}
  for key, value in pairs(source or {}) do
    target[key] = value
  end
  return target
end

-- ── API compatibility ──────────────────────────────────────────────────────

function Policy.normalizeApiCompatibility(api)
  if api == nil then
    return {}
  end
  if type(api) == "number" then
    return { api = api, minApi = api, maxApi = api }
  end
  if type(api) == "table" then
    local compatibility = copy(api)
    if #api > 0 then
      compatibility.api = api
    end
    if type(compatibility.api) == "table" and #compatibility.api == 0 then
      compatibility.minApi = compatibility.minApi or compatibility.api.min
      compatibility.maxApi = compatibility.maxApi or compatibility.api.max
      compatibility.api = nil
    end
    return compatibility
  end
  return {}
end

function Policy.isApiCompatible(compatibility, currentApi)
  if not compatibility then
    return true
  end

  local accepted = compatibility.api
  if type(accepted) == "number" then
    return currentApi == accepted
  end
  if type(accepted) == "table" and #accepted > 0 then
    for _, api in ipairs(accepted) do
      if currentApi == api then
        return true
      end
    end
    return false
  end

  if compatibility.minApi ~= nil and currentApi < compatibility.minApi then
    return false
  end
  if compatibility.maxApi ~= nil and currentApi > compatibility.maxApi then
    return false
  end

  return true
end

function Policy.describeApiCompatibility(compatibility, currentApi)
  local current = tostring(currentApi)
  if not compatibility then
    return "Requires a different Feather plugin API. Desktop API is " .. current .. "."
  end
  if type(compatibility.api) == "number" then
    return "Requires Feather plugin API " .. tostring(compatibility.api) .. "; desktop API is " .. current .. "."
  end
  if type(compatibility.api) == "table" and #compatibility.api > 0 then
    return "Requires Feather plugin API " .. table.concat(compatibility.api, ", ") .. "; desktop API is " .. current .. "."
  end
  if compatibility.minApi ~= nil or compatibility.maxApi ~= nil then
    local min = compatibility.minApi ~= nil and tostring(compatibility.minApi) or "any"
    local max = compatibility.maxApi ~= nil and tostring(compatibility.maxApi) or "any"
    return "Requires Feather plugin API " .. min .. "-" .. max .. "; desktop API is " .. current .. "."
  end
  return "Requires a different Feather plugin API. Desktop API is " .. current .. "."
end

-- ── Capabilities ───────────────────────────────────────────────────────────

--- Turn the user's `config.capabilities` into a grant set.
--- nil and "all" grant everything; a list grants its tokens; a single other
--- string grants that token. Anything else grants nothing (fail closed).
---@return table|string grants  "all" or a set of tokens
function Policy.grantSet(allowed)
  if allowed == nil or allowed == "all" then
    return "all"
  end
  if type(allowed) == "string" then
    return { [allowed] = true }
  end
  if type(allowed) == "table" then
    local set = {}
    for _, token in ipairs(allowed) do
      if type(token) == "string" then
        set[token] = true
      end
    end
    return set
  end
  return {}
end

function Policy.isGranted(grants, token)
  return grants == "all" or (type(grants) == "table" and grants[token] == true)
end

--- Validate a capability list. Returns the tokens plus errors and warnings.
local function readCapabilityList(value, field, errors, warnings)
  if value == nil then
    return {}
  end
  if type(value) ~= "table" then
    errors[#errors + 1] = field .. " must be a list of capability tokens"
    return {}
  end
  local tokens = {}
  for _, token in ipairs(value) do
    if type(token) ~= "string" or token == "" then
      errors[#errors + 1] = field .. " contains a non-string entry"
    else
      if not Policy.KNOWN_CAPABILITIES[token] then
        warnings[#warnings + 1] = field .. " lists unknown capability '" .. token .. "'"
      end
      tokens[#tokens + 1] = token
    end
  end
  return tokens
end

-- ── Runtime policy ─────────────────────────────────────────────────────────

--- Resolve a declared runtime policy against the contract.
--- A missing policy (or missing field) is a warning and takes the cheap,
--- interest-gated default; an invalid value is an error.
---@return table resolved, boolean declared
function Policy.resolveRuntime(runtime, errors, warnings)
  local defaults = contract.defaultRuntime
  if runtime == nil or (type(runtime) == "table" and next(runtime) == nil) then
    warnings[#warnings + 1] = "No runtime policy declared; using the cheap default (update = \""
      .. defaults.update
      .. "\", push = \""
      .. defaults.push
      .. "\"). Declare runtime = { cost, update, push, sampleRate } in the manifest."
    return copy(defaults), false
  end
  if type(runtime) ~= "table" then
    errors[#errors + 1] = "runtime must be a table"
    return copy(defaults), false
  end

  local resolved = {}
  for _, field in ipairs({ "cost", "update", "push" }) do
    local value = runtime[field]
    if value == nil then
      warnings[#warnings + 1] = "runtime." .. field .. " is not declared; using \"" .. defaults[field] .. "\""
      resolved[field] = defaults[field]
    elseif not RUNTIME_VALUES[field][value] then
      errors[#errors + 1] = "runtime." .. field .. " has unknown value '" .. tostring(value) .. "'"
      resolved[field] = defaults[field]
    else
      resolved[field] = value
    end
  end

  local sampleRate = runtime.sampleRate
  if sampleRate == nil then
    warnings[#warnings + 1] = "runtime.sampleRate is not declared; using " .. tostring(defaults.sampleRate)
    resolved.sampleRate = defaults.sampleRate
  elseif type(sampleRate) ~= "number" or sampleRate <= 0 then
    errors[#errors + 1] = "runtime.sampleRate must be a positive number of seconds"
    resolved.sampleRate = defaults.sampleRate
  else
    resolved.sampleRate = sampleRate
  end

  return resolved, true
end

-- ── Action contracts ───────────────────────────────────────────────────────

--- Validate an optional `actions` contract. Returns name -> contract, or nil
--- when the manifest declares none (actions are then not checked).
function Policy.readActions(actions, errors)
  if actions == nil then
    return nil
  end
  if type(actions) ~= "table" then
    errors[#errors + 1] = "actions must be a list of { name, cancellable }"
    return nil
  end
  local byName = {}
  for _, action in ipairs(actions) do
    if type(action) ~= "table" or type(action.name) ~= "string" or action.name == "" then
      errors[#errors + 1] = "every declared action needs a name"
    elseif byName[action.name] then
      errors[#errors + 1] = "action '" .. action.name .. "' is declared twice"
    else
      byName[action.name] = { name = action.name, cancellable = action.cancellable == true }
    end
  end
  return byName
end

-- ── Manifest ───────────────────────────────────────────────────────────────

--- Validate the parts of a plugin registration the runtime depends on.
---@param entry table  A createPlugin() result
---@return table manifest { capabilities, optionalCapabilities, runtime, runtimeDeclared, actions, errors, warnings }
function Policy.readManifest(entry)
  local errors, warnings = {}, {}
  if type(entry.identifier) ~= "string" or entry.identifier == "" then
    errors[#errors + 1] = "plugin identifier must be a non-empty string"
  end
  local extra = type(entry.manifest) == "table" and entry.manifest or {}
  local capabilities = readCapabilityList(entry.capabilities, "capabilities", errors, warnings)
  local optional = readCapabilityList(extra.optionalCapabilities, "optionalCapabilities", errors, warnings)
  local runtime, declared = Policy.resolveRuntime(entry.runtime, errors, warnings)
  local actions = Policy.readActions(extra.actions, errors)
  return {
    capabilities = capabilities,
    optionalCapabilities = optional,
    runtime = runtime,
    runtimeDeclared = declared,
    actions = actions,
    errors = errors,
    warnings = warnings,
  }
end

-- ── Activation ─────────────────────────────────────────────────────────────

local function reason(code, message, remediation, extra)
  local result = extra or {}
  result.code = code
  result.message = message
  result.remediation = remediation
  return result
end

local function quoteList(tokens)
  local quoted = {}
  for index, token in ipairs(tokens) do
    quoted[index] = '"' .. token .. '"'
  end
  return table.concat(quoted, ", ")
end

--- Reasons a plugin can never run in this session, whatever the user toggles.
--- Returns nil when the plugin may be activated.
---@param record table  Plugin record with manifest, compatibility and factory
---@param grants table|string  From Policy.grantSet
---@param currentApi number
function Policy.blockingReason(record, grants, currentApi, isCallable)
  local id = tostring(record.identifier)
  if #record.manifestErrors > 0 then
    return reason(
      "invalid-manifest",
      "Manifest is invalid: " .. table.concat(record.manifestErrors, "; ") .. ".",
      "Fix plugins/" .. id .. "/manifest.lua (or the createPlugin arguments) and restart the game."
    )
  end
  if not isCallable(record.factory) then
    return reason(
      "not-callable",
      "Plugin module is not callable (got " .. type(record.factory) .. ").",
      "Make plugins/" .. id .. "/init.lua return the plugin class, then restart the game."
    )
  end
  if not Policy.isApiCompatible(record.compatibility, currentApi) then
    return reason(
      "incompatible-api",
      Policy.describeApiCompatibility(record.compatibility, currentApi),
      "Update this plugin or use a matching Feather runtime and desktop version."
    )
  end
  local missing = {}
  for _, token in ipairs(record.capabilities) do
    if not Policy.isGranted(grants, token) then
      missing[#missing + 1] = token
    end
  end
  if #missing > 0 then
    return reason(
      "capability-denied",
      "Requires capabilities this game does not grant: " .. table.concat(missing, ", ") .. ".",
      "Add "
        .. quoteList(missing)
        .. " to capabilities in feather.config.lua (or run `feather config plugins --include "
        .. id
        .. "`), then restart the game.",
      { missingCapabilities = missing }
    )
  end
  return nil
end

function Policy.disabledReason(record)
  local id = tostring(record.identifier)
  return reason(
    "disabled",
    "Plugin is disabled.",
    "Enable it from its Inspector page, or add \"" .. id .. "\" to include in feather.config.lua."
  )
end

function Policy.erroredReason(phase, count, message)
  return reason(
    "disabled-by-errors",
    "Disabled after " .. tostring(count) .. " consecutive " .. tostring(phase) .. " errors: " .. tostring(message),
    "Fix the error shown in the game log, then enable the plugin again from its Inspector page."
  )
end

function Policy.initFailedReason(message)
  return reason(
    "init-failed",
    "Plugin failed to start: " .. tostring(message),
    "Check the game log for the traceback, fix the plugin, then restart the game."
  )
end

--- Which of a plugin's declared capabilities are granted.
function Policy.grantedCapabilities(record, grants)
  local granted = {}
  for _, list in ipairs({ record.capabilities, record.optionalCapabilities }) do
    for _, token in ipairs(list) do
      if Policy.isGranted(grants, token) then
        granted[#granted + 1] = token
      end
    end
  end
  return granted
end

return Policy
