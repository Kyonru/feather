-- Feather integration stress test: uses full init.lua to isolate freezing.
-- Run: love src-lua --test-ws
-- Watch console for memory growth and frame time.

local FeatherDebugger = require("feather")

local feather
local elapsed = 0
local tick = 0

function love.load()
  feather = FeatherDebugger({
    debug = true,
    host = "127.0.0.1",
    port = 4004,
    sampleRate = 1,
    wrapPrint = false,
    sessionName = "feather_test_ws",
    deviceId = "feather_test_device",
    outfile = "test_ws_log",
    defaultObservers = false,
    captureScreenshot = false,
    plugins = {},
  })
  print("[TEST] Feather initialized")
end

function love.update(dt)
  if not feather then
    return
  end

  local before = collectgarbage("count")
  feather:update(dt)
  local after = collectgarbage("count")

  elapsed = elapsed + dt
  if elapsed >= 1.0 then
    elapsed = 0
    tick = tick + 1
    collectgarbage("collect")

    -- Send a log every second to simulate real usage
    feather.featherLogger:print("trace")

    feather.featherLogger:print("[TEST] tick " .. tick .. " mem=" .. string.format("%.1f KB", collectgarbage("count")))

    local mem = collectgarbage("count")
    local status = feather.wsConnected and "CONNECTED" or "disconnected"
    print(
      string.format(
        "[TEST] t=%ds  mem=%.1f KB  update_alloc=%.1f KB  ws=%s  fps=%d",
        tick,
        mem,
        after - before,
        status,
        love.timer.getFPS()
      )
    )
  end
end

function love.draw()
  local mem = collectgarbage("count")
  local status = feather and feather.wsConnected and "CONNECTED" or "disconnected"
  love.graphics.print(string.format("Mem: %.1f KB | WS: %s | FPS: %d", mem, status, love.timer.getFPS()), 10, 10)
end

function love.keypressed(key)
  if key == "escape" then
    if feather then
      feather:finish()
    end
    love.event.quit()
  end
end
