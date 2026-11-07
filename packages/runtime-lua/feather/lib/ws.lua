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
local bit = require((FEATHER_PATH or "feather") .. ".lib.bit")
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
    -- Outbound queue, indexed head..tail so draining never shifts the array.
    _outQueue = {},
    _outHead = 1,
    _outTail = 0,
    _queuedBytes = 0,
    limits = {},
    stats = {
      queuedFrames = 0,
      dropped = 0,
      droppedBytes = 0,
      maxFlushMs = 0,
      receiveOverflows = 0,
    },
  }
  for key, value in pairs(_M.DEFAULT_LIMITS) do
    m.limits[key] = value
  end
  m.socket:settimeout(0)
  m.socket:connect(host, port)
  setmetatable(m, _M)
  return m
end

-- ── Outbound frames ─────────────────────────────────────────────────────────
--
-- A frame is queued as its header plus the *unmasked* payload, and masked a
-- chunk at a time while it is being sent. Masking used to run over the whole
-- payload, one Lua closure per byte, before the frame was even queued — outside
-- the runtime's per-frame budget and proportional to the message: tens of
-- milliseconds for a few hundred KiB. Now each update masks and sends only
-- until its time budget is spent, and a large message simply takes several
-- frames.
--
-- RFC 6455 §5.3 requires a fresh, unpredictable masking key for every client
-- frame; the client used one fixed key for all of them.

local unpack = unpack or table.unpack
local MASK_CHUNK = 4096 -- multiple of 4, so every chunk starts at key index 1

--- Queue limits. A game that produces faster than the socket drains must not
--- grow memory without bound; past `maxQueuedBytes` ordinary messages are
--- refused (and counted), while `reserveBytes` beyond it is kept for replies
--- to desktop commands so a flood of telemetry cannot starve them.
_M.DEFAULT_LIMITS = {
  maxQueuedBytes = 8 * 1024 * 1024,
  reserveBytes = 1024 * 1024,
  flushBudgetMs = 1.0,
}

local function randomByte()
  if love and love.math and love.math.random then
    return love.math.random(0, 255)
  end
  return math.random(0, 255)
end

local function now()
  if love and love.timer and love.timer.getTime then
    return love.timer.getTime()
  end
  return os.clock()
end

local function maskChunk(data, first, last, key)
  local bytes = { data:byte(first, last) }
  for index = 1, #bytes do
    bytes[index] = bxor(bytes[index], key[(index - 1) % 4 + 1])
  end
  return string.char(unpack(bytes))
end

--- Mask a whole (small) payload at once. Used for control frames only.
local function maskAll(payload, key)
  local parts = {}
  for first = 1, #payload, MASK_CHUNK do
    parts[#parts + 1] = maskChunk(payload, first, math.min(first + MASK_CHUNK - 1, #payload), key)
  end
  return table.concat(parts)
end
_M._maskAll = maskAll

local function newMaskKey()
  local key = { randomByte(), randomByte(), randomByte(), randomByte() }
  return key, string.char(key[1], key[2], key[3], key[4])
end

local function frameHeader(opcode, length)
  if length > 65535 then
    return string.char(
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
    return string.char(bor(0x80, opcode), bor(126, 0x80), band(shr(length, 8), 0xff), band(length, 0xff))
  end
  return string.char(bor(0x80, opcode), bor(length, 0x80))
end

--- A complete, masked control frame (close / pong). Control payloads are at
--- most 125 bytes, so masking them in one go is fine.
local function controlFrame(opcode, payload)
  local key, keyString = newMaskKey()
  return frameHeader(opcode, #payload) .. keyString .. maskAll(payload, key)
end

--- Queue one message. Returns true when queued, or false and a reason when the
--- queue is full; the caller decides what a refused message means.
---@param message string
---@param opcode number|nil
---@param priority boolean|nil  replies to desktop commands may use the reserve
function _M:_sendFrame(message, opcode, priority)
  if self.status ~= STATUS.OPEN then
    return false, "not open"
  end
  local limits = self.limits
  local ceiling = limits.maxQueuedBytes + (priority and limits.reserveBytes or 0)
  if self._queuedBytes + #message > ceiling then
    self.stats.dropped = self.stats.dropped + 1
    self.stats.droppedBytes = self.stats.droppedBytes + #message
    return false, "queue full"
  end

  local key, keyString = newMaskKey()
  local tail = self._outTail + 1
  self._outTail = tail
  self._outQueue[tail] = {
    data = message,
    key = key,
    masked = 0, -- payload bytes masked so far
    pending = frameHeader(opcode or 0x1, #message) .. keyString, -- bytes ready to write
    pendingPos = 1,
  }
  self._queuedBytes = self._queuedBytes + #message
  self.stats.queuedFrames = tail - self._outHead + 1
  return true
end

--- Write queued frames until the socket would block or the time budget is
--- spent. Always makes some progress, so a tiny budget cannot stall a frame.
---@param budgetMs number|nil
function _M:_flush(budgetMs)
  local queue = self._outQueue
  if self._outHead > self._outTail then
    return
  end
  local startedAt = now()
  local deadline = startedAt + (budgetMs or self.limits.flushBudgetMs) / 1000
  local progressed = false

  while self._outHead <= self._outTail do
    local frame = queue[self._outHead]

    if frame.pendingPos > #frame.pending then
      if frame.masked >= #frame.data then
        -- Whole frame written.
        queue[self._outHead] = nil
        self._outHead = self._outHead + 1
        self._queuedBytes = self._queuedBytes - #frame.data
      else
        if progressed and now() >= deadline then
          break
        end
        local first = frame.masked + 1
        local last = math.min(frame.masked + MASK_CHUNK, #frame.data)
        frame.pending = maskChunk(frame.data, first, last, frame.key)
        frame.pendingPos = 1
        frame.masked = last
      end
    else
      -- LuaSocket's send(data, i, j) returns the last byte INDEX sent (not a
      -- count); on a partial send the third value is that index.
      local sent, _, partial = self.socket:send(frame.pending, frame.pendingPos, #frame.pending)
      if sent then
        frame.pendingPos = #frame.pending + 1
        progressed = true
      else
        if partial and partial >= frame.pendingPos then
          frame.pendingPos = partial + 1
          progressed = true
        end
        break -- the OS buffer is full; continue next update
      end
    end
  end

  local elapsedMs = (now() - startedAt) * 1000
  if elapsedMs > self.stats.maxFlushMs then
    self.stats.maxFlushMs = elapsedMs
  end
  self.stats.queuedFrames = math.max(0, self._outTail - self._outHead + 1)
end

--- Bytes of payload still waiting to be written.
function _M:getQueuedBytes()
  return self._queuedBytes
end

--- Transport counters for diagnostics (`featherOverhead.transport`).
function _M:getStats()
  local stats = self.stats
  return {
    queuedBytes = self._queuedBytes,
    queuedFrames = stats.queuedFrames,
    dropped = stats.dropped,
    droppedBytes = stats.droppedBytes,
    maxFlushMs = stats.maxFlushMs,
    receiveOverflows = stats.receiveOverflows,
  }
end

function _M:_resetQueue()
  self._outQueue = {}
  self._outHead = 1
  self._outTail = 0
  self._queuedBytes = 0
  self.stats.queuedFrames = 0
end

---@param message string
---@param priority boolean|nil
function _M:send(message, priority)
  return self:_sendFrame(message, 0x1, priority)
end

---@param message string
---@param priority boolean|nil
function _M:sendBinary(message, priority)
  return self:_sendFrame(message, 0x2, priority)
end

function _M:close(code, message)
  if self.status ~= STATUS.OPEN then
    return
  end
  local payload = ""
  if code then
    payload = string.char(shr(code, 8), band(code, 0xff)) .. (message or "")
  end
  -- Close frames are small and sent immediately; flush what is queued first.
  self:_flush(math.huge)
  self.socket:send(controlFrame(0x8, payload))
  self.status = STATUS.CLOSING
  self:_resetQueue()
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
    local _, hdr_end = self._buf:find("\r\n\r\n")
    if hdr_end then
      self._buf = self._buf:sub(hdr_end + 1) -- keep any WS frame bytes that followed the headers
      self.status = STATUS.OPEN
      self:onopen()
    end
    return
  end

  if self.status == STATUS.OPEN or self.status == STATUS.CLOSING then
    -- Flush any queued outbound frames before reading
    self:_flush()

    -- Read what is available (non-blocking). Several chunks per update: one
    -- 4 KiB read per frame let a burst of desktop commands queue up for
    -- seconds at 60 fps.
    for _ = 1, 16 do
      local chunk, err, partial = sock:receive(4096)
      if err == "closed" then
        self.status = STATUS.CLOSED
        self:_resetQueue()
        self:onclose(1006, "connection closed")
        return
      end
      local data = chunk or partial
      if data and #data > 0 then
        self._buf = self._buf .. data
      end
      if not chunk then
        break -- nothing more waiting
      end
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
        self:_resetQueue()
        self:onclose(code, reason)
        return
      elseif opcode == 0x9 then -- Ping → Pong
        sock:send(controlFrame(0xA, payload))
      elseif opcode == 0x1 or opcode == 0x2 then -- Text/Binary
        self:onmessage(payload)
      end
      -- 0xA (Pong) — silently consume
    end

    -- Hard cap. Emptying the buffer mid-frame (what this used to do, silently)
    -- desynchronises the stream: the next bytes are parsed as a header and every
    -- later command is garbage. A message this large from the desktop is a
    -- protocol fault, so say so and close with 1009 (message too big); the
    -- runtime reconnects cleanly.
    if #self._buf > 1048576 then
      self.stats.receiveOverflows = self.stats.receiveOverflows + 1
      self._buf = ""
      self:onerror("receive buffer overflow: a desktop message exceeded 1 MiB")
      self:close(1009, "message too big")
    end
  end
end

return _M
