local players = {
  {
    id = "p1",
    name = "Player 1",
    x = 150,
    y = 320,
    score = 0,
    color = { 0.2, 0.72, 1 },
    keys = { up = "w", down = "s", left = "a", right = "d" },
  },
  {
    id = "p2",
    name = "Player 2",
    x = 810,
    y = 320,
    score = 0,
    color = { 1, 0.48, 0.22 },
    keys = { up = "up", down = "down", left = "left", right = "right" },
    padX = 0,
    padY = 0,
  },
}

local ARENA = {
  width = 900,
  height = 620,
  top = 92,
}

local world = {
  elapsed = 0,
  round = 1,
  seed = 73419,
  message = "P1: WASD. P2: arrows or first gamepad left stick.",
  gems = {},
  obstacles = {},
  events = {},
}

local function setColor(color)
  love.graphics.setColor(color[1], color[2], color[3], color[4] or 1)
end

local function addEvent(message)
  table.insert(world.events, 1, string.format("%05.2f  %s", world.elapsed, message))
  if #world.events > 9 then
    world.events[10] = nil
  end
  print("[Session Replay Multiplayer] " .. message)
end

local function nextSeed(seed)
  return (seed * 1103515245 + 12345) % 2147483647
end

local function distanceSq(x1, y1, x2, y2)
  local dx = x1 - x2
  local dy = y1 - y2
  return dx * dx + dy * dy
end

local function overlapsSpawn(x, y, radius)
  return distanceSq(x, y, 150, 320) < radius * radius or distanceSq(x, y, 810, 320) < radius * radius
end

local function collidesWithObstacle(x, y, radius)
  for _, obstacle in ipairs(world.obstacles) do
    local closestX = math.max(obstacle.x, math.min(x, obstacle.x + obstacle.w))
    local closestY = math.max(obstacle.y, math.min(y, obstacle.y + obstacle.h))
    if distanceSq(x, y, closestX, closestY) < radius * radius then
      return true
    end
  end
  return false
end

local function generateArena(seed)
  local rng = love.math.newRandomGenerator(seed)
  world.obstacles = {}
  world.gems = {}

  for i = 1, 5 do
    local obstacle
    for _ = 1, 30 do
      local w = rng:random(64, 116)
      local h = rng:random(34, 72)
      local x = rng:random(170, ARENA.width - 170 - w)
      local y = rng:random(ARENA.top + 24, ARENA.height - 80 - h)
      if not overlapsSpawn(x + w / 2, y + h / 2, 150) then
        obstacle = { x = x, y = y, w = w, h = h }
        break
      end
    end
    world.obstacles[i] = obstacle or { x = 245 + i * 80, y = 190 + (i % 2) * 120, w = 76, h = 42 }
  end

  for i = 1, 8 do
    local gem
    for _ = 1, 40 do
      local x = rng:random(120, ARENA.width - 120)
      local y = rng:random(ARENA.top + 35, ARENA.height - 55)
      if not overlapsSpawn(x, y, 110) and not collidesWithObstacle(x, y, 28) then
        gem = { x = x, y = y, owner = nil }
        break
      end
    end
    world.gems[i] = gem or { x = 160 + i * 78, y = ARENA.top + 70 + (i % 3) * 125, owner = nil }
  end
end

local function resetRound(reason, seed)
  players[1].x = 150
  players[1].y = 320
  players[1].score = 0
  players[2].x = 810
  players[2].y = 320
  players[2].score = 0
  players[2].padX = 0
  players[2].padY = 0
  world.elapsed = 0
  world.round = world.round + 1
  world.seed = seed or nextSeed(world.seed)
  world.message = string.format("%s  seed=%d", reason or "Round reset", world.seed)
  generateArena(world.seed)
end

local function captureReplayState()
  local playerState = {}
  for i, player in ipairs(players) do
    playerState[i] = {
      id = player.id,
      x = player.x,
      y = player.y,
      score = player.score,
      padX = player.padX,
      padY = player.padY,
    }
  end

  local gems = {}
  for i, gem in ipairs(world.gems) do
    gems[i] = {
      x = gem.x,
      y = gem.y,
      owner = gem.owner,
    }
  end

  return {
    players = playerState,
    world = {
      elapsed = world.elapsed,
      round = world.round,
      seed = world.seed,
      message = world.message,
      gems = gems,
    },
  }
end

local function restoreReplayState(state)
  if not state then
    return
  end

  for i, playerState in ipairs(state.players or {}) do
    local player = players[i]
    if player then
      player.x = playerState.x or player.x
      player.y = playerState.y or player.y
      player.score = playerState.score or player.score
      player.padX = playerState.padX or 0
      player.padY = playerState.padY or 0
    end
  end

  if state.world then
    if state.world.seed and state.world.seed ~= world.seed then
      world.seed = state.world.seed
      generateArena(world.seed)
    end
    world.elapsed = state.world.elapsed or world.elapsed
    world.round = state.world.round or world.round
    world.message = state.world.message or world.message
    world.gems = {}
    for i, gem in ipairs(state.world.gems or {}) do
      world.gems[i] = {
        x = gem.x,
        y = gem.y,
        owner = gem.owner,
      }
    end
  end
end

local function registerReplay()
  if DEBUGGER then
    DEBUGGER:replayRegister("multiplayer", captureReplayState, restoreReplayState, {
      sampleInterval = 0.08,
    })
    addEvent("Session Replay registered through CLI injection.")
  else
    addEvent("Run with: npm run feather -- run src-lua/example/session_replay/multiplayer")
  end
end

local function axis(value)
  if math.abs(value) < 0.18 then
    return 0
  end
  return value
end

function love.load()
  love.graphics.setFont(love.graphics.newFont(14))
  resetRound("Seeded arena ready", world.seed)
  registerReplay()
  addEvent("Open Session Replay, record a short local multiplayer run, then replay it.")
end

function love.gamepadaxis(_joystick, axisName, value)
  if axisName == "leftx" then
    players[2].padX = axis(value)
  elseif axisName == "lefty" then
    players[2].padY = axis(value)
  end
end

local function keyboardVector(player)
  local dx, dy = 0, 0
  if love.keyboard.isDown(player.keys.right) then
    dx = dx + 1
  end
  if love.keyboard.isDown(player.keys.left) then
    dx = dx - 1
  end
  if love.keyboard.isDown(player.keys.down) then
    dy = dy + 1
  end
  if love.keyboard.isDown(player.keys.up) then
    dy = dy - 1
  end
  return dx, dy
end

local function updatePlayer(player, dt)
  local dx, dy = keyboardVector(player)
  if player.id == "p2" then
    dx = dx + (player.padX or 0)
    dy = dy + (player.padY or 0)
  end

  if dx ~= 0 or dy ~= 0 then
    local length = math.sqrt(dx * dx + dy * dy)
    local nextX = player.x + (dx / length) * 235 * dt
    local nextY = player.y + (dy / length) * 235 * dt
    if not collidesWithObstacle(nextX, nextY, 24) then
      player.x = nextX
      player.y = nextY
    end
  end

  player.x = math.max(28, math.min(love.graphics.getWidth() - 28, player.x))
  player.y = math.max(92, math.min(love.graphics.getHeight() - 28, player.y))
end

local function updateGems()
  for _, gem in ipairs(world.gems) do
    if not gem.owner then
      for _, player in ipairs(players) do
        local dx = player.x - gem.x
        local dy = player.y - gem.y
        if dx * dx + dy * dy < 32 * 32 then
          gem.owner = player.id
          player.score = player.score + 1
          world.message = player.name .. " scored"
          addEvent(world.message)
          break
        end
      end
    end
  end
end

function love.update(dt)
  world.elapsed = world.elapsed + dt
  for _, player in ipairs(players) do
    updatePlayer(player, dt)
  end
  updateGems()

  if DEBUGGER then
    DEBUGGER:observe("session_replay_multiplayer.p1", players[1].score)
    DEBUGGER:observe("session_replay_multiplayer.p2", players[2].score)
    DEBUGGER:observe("session_replay_multiplayer.seed", world.seed)
    DEBUGGER:observe("session_replay_multiplayer.message", world.message)
  end
end

function love.keypressed(key)
  if key == "f5" and DEBUGGER then
    local id, err = DEBUGGER:startSessionReplay({
      initialStates = {
        multiplayer = captureReplayState(),
      },
    })
    addEvent(id and "Recording started" or ("Could not start recording: " .. tostring(err)))
  elseif key == "f6" and DEBUGGER then
    DEBUGGER:stopSessionReplay()
    addEvent("Recording stopped and loaded")
  elseif key == "f7" and DEBUGGER then
    resetRound("Replay baseline")
    DEBUGGER:playSessionReplay()
    addEvent("Replay started")
  elseif key == "r" then
    resetRound("Manual seeded reset")
    addEvent("Manual reset")
  elseif key == "escape" then
    if DEBUGGER then
      DEBUGGER:finish()
    end
    love.event.quit()
  end
end

local function drawGem(gem)
  love.graphics.push()
  love.graphics.translate(gem.x, gem.y)
  love.graphics.rotate(math.pi / 4)
  if gem.owner == "p1" then
    setColor(players[1].color)
  elseif gem.owner == "p2" then
    setColor(players[2].color)
  else
    love.graphics.setColor(0.95, 0.85, 0.28)
  end
  love.graphics.rectangle("fill", -11, -11, 22, 22, 4)
  love.graphics.setColor(1, 1, 1, gem.owner and 0.12 or 0.5)
  love.graphics.rectangle("line", -11, -11, 22, 22, 4)
  love.graphics.pop()
end

local function drawObstacle(obstacle)
  love.graphics.setColor(0.23, 0.28, 0.34)
  love.graphics.rectangle("fill", obstacle.x, obstacle.y, obstacle.w, obstacle.h, 6)
  love.graphics.setColor(0.55, 0.64, 0.72, 0.35)
  love.graphics.rectangle("line", obstacle.x, obstacle.y, obstacle.w, obstacle.h, 6)
end

local function drawPlayer(player)
  setColor(player.color)
  love.graphics.circle("fill", player.x, player.y, 24)
  love.graphics.setColor(1, 1, 1, 0.85)
  love.graphics.circle("line", player.x, player.y, 24)
  love.graphics.print(player.name, player.x - 28, player.y + 32)
end

function love.draw()
  love.graphics.clear(0.08, 0.1, 0.13)
  love.graphics.setColor(0.12, 0.15, 0.19)
  love.graphics.rectangle("fill", 0, 76, love.graphics.getWidth(), love.graphics.getHeight() - 76)

  love.graphics.setColor(1, 1, 1)
  love.graphics.print("Session Replay Multiplayer", 18, 16)
  love.graphics.setColor(0.72, 0.78, 0.86)
  love.graphics.print("F5 record   F6 stop/load   F7 replay   R reset   Esc quit", 18, 40)
  love.graphics.print("P1 WASD. P2 arrows or first gamepad left stick.", 440, 40)

  for _, obstacle in ipairs(world.obstacles) do
    drawObstacle(obstacle)
  end

  for _, gem in ipairs(world.gems) do
    drawGem(gem)
  end
  for _, player in ipairs(players) do
    drawPlayer(player)
  end

  setColor(players[1].color)
  love.graphics.print("P1 score: " .. tostring(players[1].score), 18, 100)
  setColor(players[2].color)
  love.graphics.print("P2 score: " .. tostring(players[2].score), 18, 122)
  love.graphics.setColor(1, 1, 1)
  love.graphics.print("state stream: multiplayer", 18, 146)
  love.graphics.print("seeded arena: " .. tostring(world.seed), 18, 168)
  love.graphics.print(world.message, 18, 190)

  local status = DEBUGGER and "connected to Feather runtime" or "DEBUGGER not available"
  setColor(DEBUGGER and { 0.35, 1, 0.58 } or { 1, 0.36, 0.36 })
  love.graphics.print(status, 18, love.graphics.getHeight() - 32)

  love.graphics.setColor(0.72, 0.78, 0.86)
  local y = 220
  love.graphics.print("Recent events", love.graphics.getWidth() - 320, y)
  for i, line in ipairs(world.events) do
    love.graphics.print(line, love.graphics.getWidth() - 320, y + 22 * i)
  end
end
