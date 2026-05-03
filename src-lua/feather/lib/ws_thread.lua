-- Background Love2D thread: handles ALL WebSocket I/O.
-- The main game thread only pushes/pops from two channels — no blocking network calls.
--
-- Channel "feather_tx": main → thread  (JSON payloads to send, or "__quit__")
-- Channel "feather_rx": thread → main  (received JSON payloads, or "__connected__" / "__disconnected__")

local INIT = love.thread.getChannel("feather_init")

local path = INIT:demand()
local host = INIT:demand()
local port = INIT:demand()
local connectTimeout = INIT:demand()
local retryInterval = INIT:demand()

local ws = require(path .. ".lib.ws")
local socket = require("socket")

local TX = love.thread.getChannel("feather_tx")
local RX = love.thread.getChannel("feather_rx")

local conn = nil
local lastAttempt = -retryInterval -- trigger connect on first loop iteration
local lastPing = 0
local PING_INTERVAL = 15 -- send ping every 15s to keep connection alive
local MAX_DRAIN_PER_TICK = 50 -- cap messages sent per iteration to prevent flooding
local MAX_QUEUE_SIZE = 500 -- drop old messages if queue grows beyond this

while true do
  -- ── Quit signal ───────────────────────────────────────────────────────────
  if TX:peek() == "__quit__" then
    break
  end

  -- ── Disconnected: try to connect ──────────────────────────────────────────
  if not conn or not conn.sock then
    conn = nil
    local now = socket.gettime()
    if now - lastAttempt >= retryInterval then
      lastAttempt = now
      local c = ws.connect(host, port, connectTimeout)
      if c then
        conn = c
        lastPing = now
        -- Flush stale messages that accumulated during disconnect
        local queueSize = TX:getCount()
        if queueSize > MAX_QUEUE_SIZE then
          local toDrop = queueSize - MAX_QUEUE_SIZE
          for _ = 1, toDrop do
            local dropped = TX:pop()
            if dropped == "__quit__" then
              -- Put quit back and exit
              TX:push("__quit__")
              break
            end
          end
        end
        RX:push("__connected__")
      end
    end
    socket.sleep(0.005) -- 5 ms idle; avoids busy-wait while disconnected

  -- ── Connected: send + receive ─────────────────────────────────────────────
  else
    local now = socket.gettime()
    local alive = true

    -- Send periodic ping to keep connection alive
    if now - lastPing >= PING_INTERVAL then
      lastPing = now
      local ok = pcall(function()
        conn:ping()
      end)
      if not ok then
        conn.sock = nil
        conn = nil
        RX:push("__disconnected__")
        alive = false
      end
    end

    -- Drain queued outgoing messages (capped per iteration to prevent blocking)
    if alive then
      local quitting = false
      local sent = 0
      local payload = TX:pop()
      while payload and sent < MAX_DRAIN_PER_TICK do
        if payload == "__quit__" then
          quitting = true
          break
        end
        local ok = pcall(function()
          conn:send(payload)
        end)
        if not ok then
          conn.sock = nil -- mark dead; reconnect on next iteration
          conn = nil
          RX:push("__disconnected__")
          alive = false
          break
        end
        sent = sent + 1
        payload = TX:pop()
      end
      if quitting then
        break
      end
    end

    -- Receive incoming WS frames (non-blocking — socket timeout is 0)
    if alive and conn and conn.sock then
      local msg = conn:receive()
      if msg then
        RX:push(msg)
      elseif not conn.sock then
        -- Socket was nil'd by receive() on close/error
        conn = nil
        RX:push("__disconnected__")
      end
    end

    socket.sleep(0.001) -- 1 ms yield while connected
  end
end

-- ── Graceful shutdown ─────────────────────────────────────────────────────────
if conn and conn.sock then
  pcall(function()
    conn:close()
  end)
end
