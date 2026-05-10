-- example/test_cli/main.lua
-- Minimal love2d game with NO feather code.
-- Run via the CLI to verify auto-injection:
--
--   npm run feather -- run src-lua/example/test_cli
--   npm run feather -- run src-lua/example/test_cli --config src-lua/example/test_cli/feather.config.lua
--
-- What to verify in the Feather desktop app:
--   1. A new session appears automatically.
--   2. Logs tab shows print() output (wrapPrint).
--   3. Performance tab shows FPS / memory.
--   4. Observer tab shows "x", "y", "score", "state".
--   5. Press arrow keys → values change and observers update.
--   6. Press Space → a log line appears in the Logs tab.

local state = {
  x      = 320,
  y      = 200,
  score  = 0,
  status = "running",
  speed  = 150,
}

local BOX_SIZE = 40
local LOG_LINES = {}

local function addLog(msg)
  table.insert(LOG_LINES, 1, msg)
  if #LOG_LINES > 8 then
    LOG_LINES[9] = nil
  end
  print(msg)
end

function love.load()
  love.graphics.setFont(love.graphics.newFont(14))
  addLog("game loaded (no feather require in this file)")
end

function love.update(dt)
  -- Move box with arrow keys
  if love.keyboard.isDown("right") then state.x = state.x + state.speed * dt end
  if love.keyboard.isDown("left")  then state.x = state.x - state.speed * dt end
  if love.keyboard.isDown("down")  then state.y = state.y + state.speed * dt end
  if love.keyboard.isDown("up")    then state.y = state.y - state.speed * dt end

  -- Clamp to window
  state.x = math.max(BOX_SIZE / 2, math.min(love.graphics.getWidth()  - BOX_SIZE / 2, state.x))
  state.y = math.max(BOX_SIZE / 2, math.min(love.graphics.getHeight() - BOX_SIZE / 2, state.y))

  -- Push observers if DEBUGGER was injected by the CLI
  if DEBUGGER then
    DEBUGGER:observe("x",      math.floor(state.x))
    DEBUGGER:observe("y",      math.floor(state.y))
    DEBUGGER:observe("score",  state.score)
    DEBUGGER:observe("status", state.status)
    DEBUGGER:update(dt)
  end
end

function love.keypressed(key)
  if key == "space" then
    state.score = state.score + 10
    addLog("scored! total = " .. state.score)
  elseif key == "r" then
    state.x, state.y = 320, 200
    state.score = 0
    addLog("reset")
  elseif key == "escape" then
    love.event.quit()
  end
end

function love.draw()
  love.graphics.setColor(0.15, 0.15, 0.2)
  love.graphics.rectangle("fill", 0, 0, love.graphics.getDimensions())

  -- Box
  love.graphics.setColor(0.3, 0.7, 1)
  love.graphics.rectangle("fill",
    state.x - BOX_SIZE / 2,
    state.y - BOX_SIZE / 2,
    BOX_SIZE, BOX_SIZE, 6)

  -- HUD
  love.graphics.setColor(1, 1, 1)
  love.graphics.print(
    string.format("score: %d   x: %d   y: %d", state.score, math.floor(state.x), math.floor(state.y)),
    10, 10)
  love.graphics.print("arrows: move   space: score   r: reset   esc: quit", 10, 30)

  local injected = DEBUGGER ~= nil
  love.graphics.setColor(injected and {0.3, 1, 0.5} or {1, 0.4, 0.4})
  love.graphics.print(
    injected and "feather: injected by CLI ✓" or "feather: not present",
    10, 56)

  -- Log lines
  love.graphics.setColor(0.7, 0.7, 0.7)
  for i, line in ipairs(LOG_LINES) do
    love.graphics.print(line, 10, love.graphics.getHeight() - 20 * i - 10)
  end
end
