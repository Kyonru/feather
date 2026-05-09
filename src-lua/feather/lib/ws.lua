--[[
Minimal WebSocket client for Love2D.
Non-blocking, event-driven. Call client:update() every frame.

Usage:
  local ws = require("ws")
  local client = ws.new("127.0.0.1", 4004)
  function client:onopen() self:send("hello") end
  function client:onmessage(msg) print(msg) end
  function client:onclose(code, reason) end
  function client:onerror(err) end

  function love.update() client:update() end
]]

local socket = require("socket")
local bit = require("bit")
local band, bor, bxor = bit.band, bit.bor, bit.bxor
local shl, shr = bit.lshift, bit.rshift

local base64 = require(FEATHER_PATH .. ".lib.base64").encode

local function randomKey()
  local bytes = {}
  for _ = 1, 16 do
    bytes[#bytes + 1] = string.char(math.random(0, 255))
  end
  return base64(table.concat(bytes))
end

local STATUS = {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
  TCPOPENING = 4,
}

local _M = { STATUS = STATUS }
_M.__index = _M

function _M:onopen() end
function _M:onmessage(msg) end
function _M:onerror(err) end
function _M:onclose(code, reason) end

function _M.new(host, port, path)
  local m = {
    url = { host = host, port = port, path = path or "/" },
    status = STATUS.TCPOPENING,
    _buf = "",
    _connectAttempts = 0,
    socket = socket.tcp(),
  }
  m.socket:settimeout(0)
  m.socket:connect(host, port)
  setmetatable(m, _M)
  return m
end

-- Build and send a complete WS frame in one sock:send() call
local mask_key = { 1, 14, 5, 14 }
local mask_str = string.char(1, 14, 5, 14)

function _M:_sendFrame(message, opcode)
  if self.status ~= STATUS.OPEN then
    return
  end
  opcode = opcode or 0x1
  local length = #message

  -- Header
  local header
  if length > 65535 then
    header = string.char(
      bor(0x80, opcode),
      bor(127, 0x80),
      0,
      0,
      0,
      0,
      band(shr(length, 24), 0xff),
      band(shr(length, 16), 0xff),
      band(shr(length, 8), 0xff),
      band(length, 0xff)
    )
  elseif length > 125 then
    header = string.char(bor(0x80, opcode), bor(126, 0x80), band(shr(length, 8), 0xff), band(length, 0xff))
  else
    header = string.char(bor(0x80, opcode), bor(length, 0x80))
  end

  -- Mask payload
  local i = 0
  local masked = message:gsub(".", function(c)
    i = i + 1
    return string.char(bxor(c:byte(), mask_key[(i - 1) % 4 + 1]))
  end)

  self.socket:send(header .. mask_str .. masked)
end

function _M:send(message)
  return self:_sendFrame(message, 0x1)
end

function _M:sendBinary(message)
  return self:_sendFrame(message, 0x2)
end

function _M:close(code, message)
  if self.status ~= STATUS.OPEN then
    return
  end
  local payload = ""
  if code then
    payload = string.char(shr(code, 8), band(code, 0xff)) .. (message or "")
  end
  local length = #payload
  local header = string.char(0x88, bor(length, 0x80))
  local i = 0
  local masked = payload:gsub(".", function(c)
    i = i + 1
    return string.char(bxor(c:byte(), mask_key[(i - 1) % 4 + 1]))
  end)
  self.socket:send(header .. mask_str .. masked)
  self.status = STATUS.CLOSING
end

-- Try to parse one frame from self._buf. Returns payload, opcode or nil.
function _M:_parseFrame()
  local buf = self._buf
  if #buf < 2 then
    return nil
  end

  local b2 = buf:byte(2)
  local opcode = band(buf:byte(1), 0x0f)
  local payloadLen = band(b2, 0x7f)
  local headerLen = 2

  if payloadLen == 126 then
    if #buf < 4 then
      return nil
    end
    payloadLen = shl(buf:byte(3), 8) + buf:byte(4)
    headerLen = 4
  elseif payloadLen == 127 then
    if #buf < 10 then
      return nil
    end
    payloadLen = shl(buf:byte(7), 24) + shl(buf:byte(8), 16) + shl(buf:byte(9), 8) + buf:byte(10)
    headerLen = 10
  end

  local totalLen = headerLen + payloadLen
  if #buf < totalLen then
    return nil
  end

  local payload = buf:sub(headerLen + 1, totalLen)
  self._buf = buf:sub(totalLen + 1)
  return payload, opcode
end

function _M:update()
  local sock = self.socket

  if self.status == STATUS.TCPOPENING then
    local _, err = sock:connect(self.url.host, self.url.port)
    self._connectAttempts = self._connectAttempts + 1
    if err == "already connected" then
      local key = randomKey()
      sock:send(
        "GET "
          .. self.url.path
          .. " HTTP/1.1\r\n"
          .. "Host: "
          .. self.url.host
          .. ":"
          .. self.url.port
          .. "\r\n"
          .. "Connection: Upgrade\r\n"
          .. "Upgrade: websocket\r\n"
          .. "Sec-WebSocket-Version: 13\r\n"
          .. "Sec-WebSocket-Key: "
          .. key
          .. "\r\n\r\n"
      )
      self.status = STATUS.CONNECTING
      self._buf = ""
    elseif self._connectAttempts > 300 then
      self:onerror("connection failed")
      self.status = STATUS.CLOSED
    end
    return
  end

  if self.status == STATUS.CONNECTING then
    local chunk, _, partial = sock:receive(4096)
    local data = chunk or partial
    if data and #data > 0 then
      self._buf = self._buf .. data
    end
    if self._buf:find("\r\n\r\n") then
      self._buf = ""
      self.status = STATUS.OPEN
      self:onopen()
    end
    return
  end

  if self.status == STATUS.OPEN or self.status == STATUS.CLOSING then
    -- Read available data (non-blocking)
    local chunk, err, partial = sock:receive(4096)
    if err == "closed" then
      self.status = STATUS.CLOSED
      self:onclose(1006, "connection closed")
      return
    end
    local data = chunk or partial
    if data and #data > 0 then
      self._buf = self._buf .. data
    end

    -- Parse frames (capped to prevent runaway)
    local frames = 0
    while frames < 50 do
      local payload, opcode = self:_parseFrame()
      if not payload then
        break
      end
      frames = frames + 1

      if opcode == 0x8 then -- Close
        local code, reason = 1005, ""
        if #payload >= 2 then
          code = shl(payload:byte(1), 8) + payload:byte(2)
          reason = payload:sub(3)
        end
        self.status = STATUS.CLOSED
        self:onclose(code, reason)
        return
      elseif opcode == 0x9 then -- Ping → Pong
        local plen = #payload
        local ph = string.char(0x8A, bor(plen, 0x80))
        local pi = 0
        local pm = payload:gsub(".", function(c)
          pi = pi + 1
          return string.char(bxor(c:byte(), mask_key[(pi - 1) % 4 + 1]))
        end)
        sock:send(ph .. mask_str .. pm)
      elseif opcode == 0x1 or opcode == 0x2 then -- Text/Binary
        self:onmessage(payload)
      end
      -- 0xA (Pong) — silently consume
    end

    -- Hard cap: prevent buffer from growing forever
    if #self._buf > 1048576 then
      self._buf = ""
    end
  end
end

return _M
