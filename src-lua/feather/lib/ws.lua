--- Minimal WebSocket client built on LuaSocket (no external dependencies).
--- Supports text frames only — sufficient for Feather's JSON message protocol.
--- Requires LuaJIT's `bit` library for frame masking (available in Love2D).

local socket = require("socket")
local bit = bit or require("bit")

local ws = {}

-- Base64 encoder (needed for the Sec-WebSocket-Key handshake header)
local b64chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

local function base64(data)
  local result = {}
  local padding = (3 - #data % 3) % 3
  data = data .. string.rep("\0", padding)
  for i = 1, #data, 3 do
    local a, b, c = data:byte(i, i + 2)
    local n = a * 65536 + b * 256 + c
    result[#result + 1] = b64chars:sub(bit.rshift(n, 18) + 1, bit.rshift(n, 18) + 1)
    result[#result + 1] = b64chars:sub(bit.band(bit.rshift(n, 12), 63) + 1, bit.band(bit.rshift(n, 12), 63) + 1)
    result[#result + 1] = b64chars:sub(bit.band(bit.rshift(n, 6), 63) + 1, bit.band(bit.rshift(n, 6), 63) + 1)
    result[#result + 1] = b64chars:sub(bit.band(n, 63) + 1, bit.band(n, 63) + 1)
  end
  if padding == 1 then
    result[#result] = "="
  elseif padding == 2 then
    result[#result - 1] = "="
    result[#result] = "="
  end
  return table.concat(result)
end

local function randomKey()
  local bytes = {}
  for _ = 1, 16 do
    bytes[#bytes + 1] = string.char(math.random(0, 255))
  end
  return base64(table.concat(bytes))
end

-- WS connection object
local Conn = {}
Conn.__index = Conn

--- Send a UTF-8 text frame. WS spec requires clients to mask all frames.
function Conn:send(msg)
  if not self.sock then
    return
  end
  local len = #msg
  local mask = {
    math.random(0, 255),
    math.random(0, 255),
    math.random(0, 255),
    math.random(0, 255),
  }

  -- Build masked payload; rolling counter avoids (i-1)%4+1 per iteration
  local payload = {}
  local mi = 0
  for i = 1, len do
    mi = mi % 4 + 1
    payload[i] = string.char(bit.bxor(msg:byte(i), mask[mi]))
  end

  -- Frame header: FIN + text opcode (0x81), MASK bit + length
  local header
  if len < 126 then
    header = string.char(0x81, bit.bor(0x80, len))
  elseif len < 65536 then
    header = string.char(0x81, 0xFE, bit.rshift(len, 8), bit.band(len, 0xFF))
  else
    -- Large payloads (>64KB) — encode 8-byte length
    header = string.char(
      0x81,
      0xFF,
      0,
      0,
      0,
      0,
      bit.band(bit.rshift(len, 24), 0xFF),
      bit.band(bit.rshift(len, 16), 0xFF),
      bit.band(bit.rshift(len, 8), 0xFF),
      bit.band(len, 0xFF)
    )
  end

  self.sock:send(header .. string.char(mask[1], mask[2], mask[3], mask[4]) .. table.concat(payload))
end

--- Non-blocking receive. Returns a decoded message string or nil if none available.
--- Accumulates partial data in self._buf across calls.
function Conn:receive()
  if not self.sock then
    return nil
  end

  -- Pull any available bytes into the buffer (non-blocking)
  local chunk, err = self.sock:receive(4096)
  if chunk then
    self._buf = self._buf .. chunk

    -- 🔥 HARD GUARD: prevent runaway memory + O(n²) string cost
    if #self._buf > 1024 * 1024 then -- 1MB cap
      -- Reset buffer if something goes wrong
      self._buf = ""
      return nil
    end
  elseif err ~= "timeout" then
    self.sock = nil
    return nil
  end

  -- Need at least 2 bytes for the frame header
  if #self._buf < 2 then
    return nil
  end

  local b1 = self._buf:byte(1)
  local b2 = self._buf:byte(2)
  local opcode = bit.band(b1, 0x0F)
  local masked = bit.band(b2, 0x80) ~= 0
  local payloadLen = bit.band(b2, 0x7F)

  local headerLen = 2
  if payloadLen == 126 then
    if #self._buf < 4 then
      return nil
    end
    payloadLen = self._buf:byte(3) * 256 + self._buf:byte(4)
    headerLen = 4
  elseif payloadLen == 127 then
    if #self._buf < 10 then
      return nil
    end
    -- Only handle lengths that fit in a Lua number (< 2^53)
    payloadLen = self._buf:byte(9) * 16777216 + self._buf:byte(10)
    headerLen = 10
  end

  local maskLen = masked and 4 or 0
  local totalLen = headerLen + maskLen + payloadLen

  if #self._buf < totalLen then
    return nil
  end

  -- Extract payload
  local payload = self._buf:sub(headerLen + maskLen + 1, totalLen)

  if masked then
    local maskBytes = { self._buf:byte(headerLen + 1, headerLen + 4) }
    local unmasked = {}
    for i = 1, #payload do
      unmasked[i] = string.char(bit.bxor(payload:byte(i), maskBytes[(i - 1) % 4 + 1]))
    end
    payload = table.concat(unmasked)
  end

  -- Consume the frame from the buffer
  self._buf = self._buf:sub(totalLen + 1)

  -- Handle control frames
  if opcode == 0x8 then
    -- Close frame — server is closing
    self.sock = nil
    return nil
  elseif opcode == 0x9 then
    -- Ping — send pong
    self.sock:send(string.char(0x8A, 0x80, 0, 0, 0, 0))
    return self:receive()
  elseif opcode == 0x1 or opcode == 0x0 then
    -- Text or continuation frame
    return payload
  end

  return nil
end

--- Send a WebSocket close frame and close the socket.
function Conn:close()
  if not self.sock then
    return
  end
  -- Close frame: FIN + close opcode, masked, empty payload
  self.sock:send(string.char(0x88, 0x80, 0, 0, 0, 0))
  self.sock:close()
  self.sock = nil
end

--- Connect to a WebSocket server. Returns a Conn object or nil + error string.
---@param host string Desktop IP or hostname (e.g. "192.168.1.100" or "127.0.0.1")
---@param port number WebSocket server port (default 4004)
---@param timeout? number TCP connect timeout in seconds (default 2)
---@return table|nil, string|nil
function ws.connect(host, port, timeout)
  local sock = socket.tcp()
  sock:settimeout(timeout or 2)

  local ok, err = sock:connect(host, port)
  if not ok then
    sock:close()
    return nil, "connect failed: " .. tostring(err)
  end

  -- HTTP upgrade handshake
  local key = randomKey()
  local request = table.concat({
    "GET / HTTP/1.1",
    "Host: " .. host .. ":" .. port,
    "Upgrade: websocket",
    "Connection: Upgrade",
    "Sec-WebSocket-Key: " .. key,
    "Sec-WebSocket-Version: 13",
    "",
    "",
  }, "\r\n")

  sock:send(request)

  -- Read response headers
  local response = {}
  while true do
    local line, lerr = sock:receive("*l")
    if lerr then
      sock:close()
      return nil, "handshake read failed: " .. tostring(lerr)
    end
    if line == "" or line == "\r" then
      break
    end
    response[#response + 1] = line
  end

  -- Validate 101 Switching Protocols
  if not response[1] or not response[1]:find("101") then
    sock:close()
    return nil, "unexpected handshake response: " .. tostring(response[1])
  end

  -- Switch to non-blocking for the update loop
  sock:settimeout(0)

  local conn = setmetatable({
    sock = sock,
    _buf = "",
  }, Conn)

  return conn, nil
end

return ws
