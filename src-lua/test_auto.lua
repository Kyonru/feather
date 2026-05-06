-- Feather auto-setup integration test.
-- Run: love src-lua --test-auto
-- Verifies that require("feather.auto").setup() registers all built-in plugins,
-- creates the global DEBUGGER, and runs without errors under normal update load.
FEATHER_PLUGIN_PATH = ""
FEATHER_PATH = "feather"
require("feather.auto")

local elapsed = 0
local tick = 0

function love.load()
  assert(DEBUGGER, "DEBUGGER global was not created by auto.setup()")

  local pm = DEBUGGER.pluginManager
  assert(pm, "pluginManager not found on DEBUGGER")

  local registered = {}
  for id in pairs(pm:getPlugins() or {}) do
    registered[id] = true
  end

  -- Verify a core set of plugins are registered
  local expected = {
    "screenshots",
    "profiler",
    "bookmark",
    "memory-snapshot",
    "network-inspector",
    "input-replay",
    "entity-inspector",
    "config-tweaker",
    "particle-editor",
    "audio-debug",
    "coroutine-monitor",
    "filesystem",
    -- force-included opt-in plugins
    "physics-debug",
    "collision-debug",
  }
  local missing = {}
  for _, id in ipairs(expected) do
    if not registered[id] then
      missing[#missing + 1] = id
    end
  end

  if #missing > 0 then
    print("[FAIL] Missing plugins: " .. table.concat(missing, ", "))
  else
    print("[PASS] All expected plugins registered (" .. #expected .. " checked)")
  end

  -- Verify excluded plugins are absent
  local excluded = { "hump.signal", "lua-state-machine", "animation-inspector", "timer-inspector" }
  for _, id in ipairs(excluded) do
    if registered[id] then
      print("[FAIL] Excluded plugin is still registered: " .. id)
    end
  end

  -- Exercise observe
  DEBUGGER:observe("test.value", 42)
  DEBUGGER:observe("test.string", "hello")

  print("[TEST] Auto setup complete — running update loop")
end

function love.update(dt)
  elapsed = elapsed + dt
  if elapsed >= 1.0 then
    elapsed = 0
    tick = tick + 1
    collectgarbage("collect")

    local mem = collectgarbage("count")
    local status = DEBUGGER.wsConnected and "CONNECTED" or "disconnected"

    -- Update an observer each tick to exercise the push path
    DEBUGGER:observe("test.tick", tick)
    DEBUGGER:observe("test.mem_kb", string.format("%.1f", mem))

    print(string.format("[TEST] t=%ds  mem=%.1f KB  ws=%s  fps=%d", tick, mem, status, love.timer.getFPS()))
  end
  DEBUGGER:update(dt)
end

function love.draw()
  local mem = collectgarbage("count")
  local status = DEBUGGER and DEBUGGER.wsConnected and "CONNECTED" or "disconnected"
  love.graphics.print(
    string.format("AUTO TEST | Mem: %.1f KB | WS: %s | FPS: %d", mem, status, love.timer.getFPS()),
    10,
    10
  )
  love.graphics.print(
    "Plugins registered: "
      .. tostring(DEBUGGER and DEBUGGER.pluginManager and #DEBUGGER.pluginManager:getPlugins() or 0),
    10,
    30
  )
end

function love.keypressed(key)
  if key == "escape" then
    DEBUGGER:finish()
    love.event.quit()
  end
end
