local M = {}

local player = {
  x = 120,
  y = 320,
  speed = 220,
  score = 0,
  color = { 0.2, 0.72, 1 },
}

local world = {
  run = 1,
  elapsed = 0,
  message = "Reproducible: checkpoint restores player, targets, and sparkle.",
  targets = {},
  trail = {},
}

local sparkle = {
  x = 450,
  y = 300,
  pulse = 0,
  trail = {},
}

local logs = {}

local function setColor(color)
  love.graphics.setColor(color[1], color[2], color[3], color[4] or 1)
end

local function log(message)
  table.insert(logs, 1, string.format("%05.2f  %s", world.elapsed, message))
  if #logs > 8 then
    logs[9] = nil
  end
  print("[Session Replay Reproducible] " .. message)
end

local function resetTargets()
  world.targets = {
    { x = 260, y = 150, taken = false },
    { x = 640, y = 180, taken = false },
    { x = 430, y = 380, taken = false },
    { x = 720, y = 470, taken = false },
  }
end

function M.reset(reason)
  player.x = 120
  player.y = 320
  player.score = 0
  world.elapsed = 0
  world.trail = {}
  world.run = world.run + 1
  world.message = reason or "Reset"
  sparkle.x = 450
  sparkle.y = 300
  sparkle.pulse = 0
  sparkle.trail = {}
  resetTargets()
end

function M.capture()
  local targets = {}
  for i, target in ipairs(world.targets) do
    targets[i] = {
      x = target.x,
      y = target.y,
      taken = target.taken,
    }
  end

  return {
    player = {
      x = player.x,
      y = player.y,
      score = player.score,
    },
    sparkle = {
      x = sparkle.x,
      y = sparkle.y,
      pulse = sparkle.pulse,
    },
    world = {
      run = world.run,
      elapsed = world.elapsed,
      message = world.message,
      targets = targets,
    },
  }
end

function M.restore(state)
  if not state then
    return
  end

  if state.player then
    player.x = state.player.x or player.x
    player.y = state.player.y or player.y
    player.score = state.player.score or player.score
  end

  if state.sparkle then
    sparkle.x = state.sparkle.x or sparkle.x
    sparkle.y = state.sparkle.y or sparkle.y
    sparkle.pulse = state.sparkle.pulse or sparkle.pulse
  end

  if state.world then
    world.run = state.world.run or world.run
    world.elapsed = state.world.elapsed or world.elapsed
    world.message = state.world.message or world.message
    world.targets = {}
    for i, target in ipairs(state.world.targets or {}) do
      world.targets[i] = {
        x = target.x,
        y = target.y,
        taken = target.taken == true,
      }
    end
  end
end

local function movePlayer(dt)
  local dx, dy = 0, 0
  if love.keyboard.isDown("right", "d") then
    dx = dx + 1
  end
  if love.keyboard.isDown("left", "a") then
    dx = dx - 1
  end
  if love.keyboard.isDown("down", "s") then
    dy = dy + 1
  end
  if love.keyboard.isDown("up", "w") then
    dy = dy - 1
  end

  if dx ~= 0 or dy ~= 0 then
    local length = math.sqrt(dx * dx + dy * dy)
    player.x = player.x + (dx / length) * player.speed * dt
    player.y = player.y + (dy / length) * player.speed * dt
  end

  player.x = math.max(28, math.min(love.graphics.getWidth() - 28, player.x))
  player.y = math.max(88, math.min(love.graphics.getHeight() - 28, player.y))
end

local function updateTargets()
  for _, target in ipairs(world.targets) do
    if not target.taken then
      local dx = player.x - target.x
      local dy = player.y - target.y
      if dx * dx + dy * dy < 34 * 34 then
        target.taken = true
        player.score = player.score + 1
        world.message = "Collected target " .. tostring(player.score)
        log(world.message)
      end
    end
  end
end

local function updateTrail()
  if #world.trail == 0 then
    world.trail[1] = { x = player.x, y = player.y }
    return
  end

  local last = world.trail[#world.trail]
  local dx = player.x - last.x
  local dy = player.y - last.y
  if dx * dx + dy * dy > 12 * 12 then
    world.trail[#world.trail + 1] = { x = player.x, y = player.y }
    if #world.trail > 80 then
      table.remove(world.trail, 1)
    end
  end
end

local function updateSparkle(dt)
  local x, y = love.mouse.getPosition()
  sparkle.x = x
  sparkle.y = y
  sparkle.pulse = sparkle.pulse + dt * 6

  if #sparkle.trail == 0 then
    sparkle.trail[1] = { x = x, y = y, life = 1 }
  else
    local last = sparkle.trail[#sparkle.trail]
    local dx = x - last.x
    local dy = y - last.y
    if dx * dx + dy * dy > 10 * 10 then
      sparkle.trail[#sparkle.trail + 1] = { x = x, y = y, life = 1 }
    end
  end

  for i = #sparkle.trail, 1, -1 do
    local point = sparkle.trail[i]
    point.life = point.life - dt * 0.9
    if point.life <= 0 or #sparkle.trail > 42 then
      table.remove(sparkle.trail, i)
    end
  end
end

function M.update(dt)
  world.elapsed = world.elapsed + dt
  movePlayer(dt)
  updateTargets()
  updateTrail()
  updateSparkle(dt)

  if DEBUGGER then
    DEBUGGER:observe("session_replay.scene", "reproducible")
    DEBUGGER:observe("session_replay.score", player.score)
    DEBUGGER:observe("session_replay.position", string.format("%d, %d", player.x, player.y))
    DEBUGGER:observe("session_replay.sparkle", string.format("%d, %d", sparkle.x, sparkle.y))
    DEBUGGER:observe("session_replay.message", world.message)
  end
end

local function drawDiamond(x, y, taken)
  love.graphics.push()
  love.graphics.translate(x, y)
  love.graphics.rotate(math.pi / 4)
  setColor(taken and { 0.18, 0.2, 0.24, 0.7 } or { 1, 0.78, 0.22 })
  love.graphics.rectangle("fill", -12, -12, 24, 24, 4)
  love.graphics.setColor(1, 1, 1, taken and 0.08 or 0.45)
  love.graphics.rectangle("line", -12, -12, 24, 24, 4)
  love.graphics.pop()
end

local function drawSparkle()
  for _, point in ipairs(sparkle.trail) do
    local alpha = math.max(0, math.min(1, point.life))
    love.graphics.setColor(0.95, 0.78, 1, alpha * 0.42)
    love.graphics.circle("fill", point.x, point.y, 8 * alpha)
    love.graphics.setColor(0.4, 0.9, 1, alpha * 0.5)
    love.graphics.circle("fill", point.x, point.y, 3 * alpha)
  end

  local radius = 10 + math.sin(sparkle.pulse) * 3
  love.graphics.setColor(1, 0.95, 0.45, 0.9)
  love.graphics.circle("fill", sparkle.x, sparkle.y, 4)
  love.graphics.setColor(0.95, 0.78, 1, 0.85)
  love.graphics.line(sparkle.x - radius, sparkle.y, sparkle.x + radius, sparkle.y)
  love.graphics.line(sparkle.x, sparkle.y - radius, sparkle.x, sparkle.y + radius)
  love.graphics.setColor(0.4, 0.9, 1, 0.65)
  love.graphics.circle("line", sparkle.x, sparkle.y, radius)
end

function M.draw()
  love.graphics.setColor(0.22, 0.34, 0.42, 0.55)
  for _, point in ipairs(world.trail) do
    love.graphics.circle("fill", point.x, point.y, 4)
  end

  for _, target in ipairs(world.targets) do
    drawDiamond(target.x, target.y, target.taken)
  end

  drawSparkle()

  setColor(player.color)
  love.graphics.circle("fill", player.x, player.y, 22)
  love.graphics.setColor(1, 1, 1, 0.85)
  love.graphics.circle("line", player.x, player.y, 22)

  love.graphics.setColor(1, 1, 1)
  love.graphics.print(string.format("score: %d / %d", player.score, #world.targets), 18, 112)
  love.graphics.print(string.format("time: %.2f", world.elapsed), 18, 134)
  love.graphics.print("mode: reproducible checkpoint", 18, 156)
  love.graphics.print(world.message, 18, 178)

  love.graphics.setColor(0.72, 0.78, 0.86)
  local y = 240
  love.graphics.print("Recent events", love.graphics.getWidth() - 290, y)
  for i, line in ipairs(logs) do
    love.graphics.print(line, love.graphics.getWidth() - 290, y + 22 * i)
  end
end

function M.log(message)
  log(message)
end

M.reset("Fresh run")

return M
