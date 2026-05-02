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
        RX:push("__connected__")
      end
    end
    socket.sleep(0.005) -- 5 ms idle; avoids busy-wait while disconnected

  -- ── Connected: send + receive ─────────────────────────────────────────────
  else
    -- Drain all queued outgoing messages
    local quitting = false
    local payload = TX:pop()
    while payload do
      if payload == "__quit__" then
        quitting = true
        break
      end
      local ok = pcall(function()
        conn:send(payload)
      end)
      if not ok then
        conn.sock = nil -- mark dead; reconnect on next iteration
        break
      end
      payload = TX:pop()
    end
    if quitting then
      break
    end

    -- Receive one incoming WS frame (non-blocking — socket timeout is 0)
    if conn and conn.sock then
      local msg = conn:receive()
      if msg then
        RX:push(msg)
      elseif not conn.sock then
        -- Socket was nil'd by receive() on close/error
        conn = nil
        RX:push("__disconnected__")
      end
    else
      conn = nil
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
