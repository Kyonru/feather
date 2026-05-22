local M = {}

local player = {
  x = 120,
  y = 320,
  speed = 220,
  score = 0,
  color = { 1, 0.48, 0.22 },
}

local world = {
  elapsed = 0,
  message = "Divergent: the hazard phase is intentionally not restored.",
  targets = {},
  trail = {},
}

local hazard = {
  phase = 0,
  x = 480,
  y = 320,
  radius = 26,
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
  print("[Session Replay Divergent] " .. message)
end

local function resetTargets()
  world.targets = {
    { x = 250, y = 160, taken = false },
    { x = 705, y = 160, taken = false },
    { x = 480, y = 455, taken = false },
  }
end

function M.reset(reason)
  player.x = 120
  player.y = 320
  player.score = 0
  world.elapsed = 0
  world.trail = {}
  world.message = reason or "Reset"
  hazard.phase = 0
  hazard.x = 480
  hazard.y = 320
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
    world = {
      elapsed = world.elapsed,
      message = world.message,
      targets = targets,
    },
    -- Intentionally omitted: hazard.phase, hazard.x, hazard.y.
    -- This scene demonstrates why a replay can diverge if the game does not
    -- restore everything that affects simulation.
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

  if state.world then
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
      if dx * dx + dy * dy < 32 * 32 then
        target.taken = true
        player.score = player.score + 1
        world.message = "Collected target " .. tostring(player.score)
        log(world.message)
      end
    end
  end
end

local function updateHazard(dt)
  hazard.phase = hazard.phase + dt
  hazard.x = 480 + math.sin(hazard.phase * 1.7) * 210
  hazard.y = 320 + math.cos(hazard.phase * 1.1) * 120

  local dx = player.x - hazard.x
  local dy = player.y - hazard.y
  if dx * dx + dy * dy < (hazard.radius + 18) * (hazard.radius + 18) then
    player.score = math.max(0, player.score - 1)
    world.message = "Hazard touched player; divergence depends on hazard phase."
    player.x = 120
    player.y = 320
    log("Hazard collision")
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

function M.update(dt)
  world.elapsed = world.elapsed + dt
  movePlayer(dt)
  updateHazard(dt)
  updateTargets()
  updateTrail()

  if DEBUGGER then
    DEBUGGER:observe("session_replay.scene", "divergent")
    DEBUGGER:observe("session_replay.score", player.score)
    DEBUGGER:observe("session_replay.hazard_phase", string.format("%.2f", hazard.phase))
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

function M.draw()
  love.graphics.setColor(0.36, 0.2, 0.17, 0.5)
  for _, point in ipairs(world.trail) do
    love.graphics.circle("fill", point.x, point.y, 4)
  end

  for _, target in ipairs(world.targets) do
    drawDiamond(target.x, target.y, target.taken)
  end

  love.graphics.setColor(1, 0.18, 0.16, 0.8)
  love.graphics.circle("fill", hazard.x, hazard.y, hazard.radius)
  love.graphics.setColor(1, 1, 1, 0.55)
  love.graphics.circle("line", hazard.x, hazard.y, hazard.radius)

  setColor(player.color)
  love.graphics.circle("fill", player.x, player.y, 22)
  love.graphics.setColor(1, 1, 1, 0.85)
  love.graphics.circle("line", player.x, player.y, 22)

  love.graphics.setColor(1, 1, 1)
  love.graphics.print(string.format("score: %d / %d", player.score, #world.targets), 18, 112)
  love.graphics.print(string.format("time: %.2f", world.elapsed), 18, 134)
  love.graphics.print("mode: divergent checkpoint", 18, 156)
  love.graphics.print("hazard phase is not restored", 18, 178)
  love.graphics.print(world.message, 18, 200)

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
