--- Validation for data crossing from a plugin into Inspector.
---
--- JSON encoding alone is not a safety boundary: a deeply nested tree, tens of
--- thousands of nodes, one giant string, or a large attachment set can consume
--- the desktop before React gets a chance to handle it. Walk first, then encode
--- and enforce the exact wire byte limit in the scheduler.
local contract = require(FEATHER_PATH .. ".plugin_contract")

local Payload = {}
Payload.limits = contract.uiLimits

local function finite(value)
  return value == value and value ~= math.huge and value ~= -math.huge
end

local function pathFor(parent, key)
  local text = tostring(key)
  if #text > 80 then
    text = text:sub(1, 77) .. "..."
  end
  return parent .. "[" .. text .. "]"
end

--- Validate JSON-shaped plugin data without allocating a transformed copy.
---@return boolean valid
---@return string|nil reason
---@return table stats
function Payload.validate(value, customLimits)
  local limits = customLimits or Payload.limits
  local active = {}
  local stats = { nodes = 0, maxDepth = 0, strings = 0 }

  local function visit(current, depth, path)
    if depth > limits.maxDepth then
      return false, path .. " exceeds maximum depth " .. limits.maxDepth
    end
    if depth > stats.maxDepth then
      stats.maxDepth = depth
    end

    local kind = type(current)
    if kind == "string" then
      stats.strings = stats.strings + 1
      if #current > limits.maxStringBytes then
        return false, path .. " is a " .. #current .. " byte string (limit " .. limits.maxStringBytes .. ")"
      end
      return true
    end
    if kind == "number" then
      if not finite(current) then
        return false, path .. " is not a finite number"
      end
      return true
    end
    if kind == "nil" or kind == "boolean" then
      return true
    end
    if kind ~= "table" then
      return false, path .. " contains unsupported " .. kind
    end
    if active[current] then
      return false, path .. " contains a cycle"
    end

    stats.nodes = stats.nodes + 1
    if stats.nodes > limits.maxNodes then
      return false, path .. " exceeds maximum node count " .. limits.maxNodes
    end

    active[current] = true
    for key, child in pairs(current) do
      local keyType = type(key)
      if keyType ~= "string" and keyType ~= "number" then
        active[current] = nil
        return false, path .. " has an unsupported " .. keyType .. " key"
      end
      if keyType == "string" and #key > limits.maxStringBytes then
        active[current] = nil
        return false, path .. " has a key larger than " .. limits.maxStringBytes .. " bytes"
      end
      local ok, reason = visit(child, depth + 1, pathFor(path, key))
      if not ok then
        active[current] = nil
        return false, reason
      end
    end
    active[current] = nil
    return true
  end

  local ok, reason = visit(value, 1, "data")
  return ok, reason, stats
end

--- Validate only attachments created while one plugin payload was built.
---@param pending table
---@param firstIndex number
---@return boolean valid
---@return string|nil reason
---@return number bytes
---@return number count
function Payload.validateBinaries(pending, firstIndex, customLimits)
  local limits = customLimits or Payload.limits
  local bytes = 0
  local count = 0
  for index = firstIndex, #pending do
    local attachment = pending[index]
    count = count + 1
    if count > limits.maxBinaryAttachments then
      return false, "binary attachment count exceeds " .. limits.maxBinaryAttachments, bytes, count
    end
    if type(attachment) ~= "table" or type(attachment.bytes) ~= "string" then
      return false, "binary attachment " .. count .. " is malformed", bytes, count
    end
    bytes = bytes + #attachment.bytes
    if bytes > limits.maxBinaryBytes then
      return false, "binary attachments total " .. bytes .. " bytes (limit " .. limits.maxBinaryBytes .. ")", bytes, count
    end
  end
  return true, nil, bytes, count
end

return Payload
