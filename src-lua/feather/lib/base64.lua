--- Base64 encoder for Feather.
--- Used by ws.lua (handshake key) and screenshot capture (PNG → base64).
--- Optimised: builds 4-char chunks via pre-computed lookup table to avoid
--- per-character string.sub calls (≈4× faster on large payloads).

local bit = require("bit")
local band = bit.band
local shr = bit.rshift

local b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

-- Pre-compute single-char lookup (0-63 → char)
local b64 = {}
for i = 0, 63 do
  b64[i] = b64chars:sub(i + 1, i + 1)
end

--- Encode a binary string as base64.
---@param data string
---@return string
local function encode(data)
  local len = #data
  local result = {}
  local ri = 0
  local i = 1

  -- Process 3-byte chunks → 4 base64 chars
  while i <= len - 2 do
    local a, b, c = data:byte(i, i + 2)
    local n = a * 65536 + b * 256 + c
    ri = ri + 1
    result[ri] = b64[shr(n, 18)] .. b64[band(shr(n, 12), 63)] .. b64[band(shr(n, 6), 63)] .. b64[band(n, 63)]
    i = i + 3
  end

  -- Handle remaining 1 or 2 bytes
  local rem = len - i + 1
  if rem == 2 then
    local a, b = data:byte(i, i + 1)
    local n = a * 65536 + b * 256
    ri = ri + 1
    result[ri] = b64[shr(n, 18)] .. b64[band(shr(n, 12), 63)] .. b64[band(shr(n, 6), 63)] .. "="
  elseif rem == 1 then
    local a = data:byte(i)
    local n = a * 65536
    ri = ri + 1
    result[ri] = b64[shr(n, 18)] .. b64[band(shr(n, 12), 63)] .. "=="
  end

  return table.concat(result)
end

return {
  encode = encode,
}
