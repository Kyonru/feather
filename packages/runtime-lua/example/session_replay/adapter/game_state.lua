local M = {}

local ARENA = {
  width = 900,
  height = 620,
  top = 86,
}

M.player = {
  x = 130,
  y = 320,
  score = 0,
  speed = 230,
}

M.world = {
  seed = 91827,
  elapsed = 0,
  message = "Move with WASD or arrows. Record with F5.",
  shards = {},
  blocks = {},
  events = {},
}

local function setColor(color)
  love.graphics.setColor(color[1], color[2], color[3], color[4] or 1)
end

local function nextSeed(seed)
  return (seed * 1664525 + 1013904223) % 2147483647
end

local function distanceSq(x1, y1, x2, y2)
  local dx = x1 - x2
  local dy = y1 - y2
  return dx * dx + dy * dy
end

local function collidesWithBlock(x, y, radius)
  for _, block in ipairs(M.world.blocks) do
    local closestX = math.max(block.x, math.min(x, block.x + block.w))
    local closestY = math.max(block.y, math.min(y, block.y + block.h))
    if distanceSq(x, y, closestX, closestY) < radius * radius then
      return true
    end
  end
  return false
end

local function generateWorld(seed)
  local rng = love.math.newRandomGenerator(seed)
  M.world.blocks = {}
  M.world.shards = {}

  for i = 1, 4 do
    local w = rng:random(70, 130)
    local h = rng:random(30, 62)
    M.world.blocks[i] = {
      x = rng:random(190, ARENA.width - 190 - w),
      y = rng:random(ARENA.top + 40, ARENA.height - 85 - h),
      w = w,
      h = h,
    }
  end

  for i = 1, 7 do
    local shard
    for _ = 1, 40 do
      local x = rng:random(110, ARENA.width - 110)
      local y = rng:random(ARENA.top + 35, ARENA.height - 55)
      if distanceSq(x, y, 130, 320) > 120 * 120 and not collidesWithBlock(x, y, 26) then
        shard = { x = x, y = y, taken = false }
        break
      end
    end
    M.world.shards[i] = shard or { x = 140 + i * 88, y = 160 + (i % 3) * 120, taken = false }
  end
end

function M.addEvent(message)
  table.insert(M.world.events, 1, string.format("%05.2f  %s", M.world.elapsed, message))
  if #M.world.events > 8 then
    M.world.events[9] = nil
  end
  print("[Session Replay Adapter] " .. message)
end

function M.reset(reason, seed)
  M.player.x = 130
  M.player.y = 320
  M.player.score = 0
  M.world.elapsed = 0
  M.world.seed = seed or nextSeed(M.world.seed)
  M.world.message = string.format("%s  seed=%d", reason or "Reset", M.world.seed)
  generateWorld(M.world.seed)
end

function M.captureReplayState()
  local shards = {}
  for i, shard in ipairs(M.world.shards) do
    shards[i] = {
      x = shard.x,
      y = shard.y,
      taken = shard.taken,
    }
  end

  return {
    world = {
      seed = M.world.seed,
      elapsed = M.world.elapsed,
      message = M.world.message,
      shards = shards,
    },
    player = {
      x = M.player.x,
      y = M.player.y,
      score = M.player.score,
    },
  }
end

function M.restoreReplayState(state)
  if not state then
    return
  end

  if state.world then
    if state.world.seed and state.world.seed ~= M.world.seed then
      M.world.seed = state.world.seed
      generateWorld(M.world.seed)
    end
    M.world.elapsed = state.world.elapsed or M.world.elapsed
    M.world.message = state.world.message or M.world.message
    for i, shardState in ipairs(state.world.shards or {}) do
      if M.world.shards[i] then
        M.world.shards[i].taken = shardState.taken == true
      end
    end
  end

  if state.player then
    M.player.x = state.player.x or M.player.x
    M.player.y = state.player.y or M.player.y
    M.player.score = state.player.score or M.player.score
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
    local nextX = M.player.x + (dx / length) * M.player.speed * dt
    local nextY = M.player.y + (dy / length) * M.player.speed * dt
    if not collidesWithBlock(nextX, nextY, 22) then
      M.player.x = nextX
      M.player.y = nextY
    end
  end

  M.player.x = math.max(28, math.min(love.graphics.getWidth() - 28, M.player.x))
  M.player.y = math.max(ARENA.top + 12, math.min(love.graphics.getHeight() - 28, M.player.y))
end

local function updateShards()
  for _, shard in ipairs(M.world.shards) do
    if not shard.taken and distanceSq(M.player.x, M.player.y, shard.x, shard.y) < 32 * 32 then
      shard.taken = true
      M.player.score = M.player.score + 1
      M.world.message = "Collected shard " .. tostring(M.player.score)
      M.addEvent(M.world.message)
    end
  end
end

function M.update(dt)
  M.world.elapsed = M.world.elapsed + dt
  movePlayer(dt)
  updateShards()

  if DEBUGGER then
    DEBUGGER:observe("session_replay_adapter.seed", M.world.seed)
    DEBUGGER:observe("session_replay_adapter.score", M.player.score)
    DEBUGGER:observe("session_replay_adapter.message", M.world.message)
  end
end

local function drawShard(shard)
  love.graphics.push()
  love.graphics.translate(shard.x, shard.y)
  love.graphics.rotate(math.pi / 4)
  setColor(shard.taken and { 0.18, 0.2, 0.25, 0.45 } or { 0.9, 0.82, 0.28 })
  love.graphics.rectangle("fill", -10, -10, 20, 20, 4)
  love.graphics.setColor(1, 1, 1, shard.taken and 0.1 or 0.5)
  love.graphics.rectangle("line", -10, -10, 20, 20, 4)
  love.graphics.pop()
end

local function drawBlock(block)
  love.graphics.setColor(0.23, 0.28, 0.35)
  love.graphics.rectangle("fill", block.x, block.y, block.w, block.h, 6)
  love.graphics.setColor(0.55, 0.64, 0.72, 0.35)
  love.graphics.rectangle("line", block.x, block.y, block.w, block.h, 6)
end

function M.draw()
  love.graphics.clear(0.08, 0.1, 0.13)
  love.graphics.setColor(0.12, 0.15, 0.19)
  love.graphics.rectangle("fill", 0, 76, love.graphics.getWidth(), love.graphics.getHeight() - 76)

  love.graphics.setColor(1, 1, 1)
  love.graphics.print("Session Replay Adapter Example", 18, 16)
  love.graphics.setColor(0.72, 0.78, 0.86)
  love.graphics.print("F5 record   F6 stop/load   F7 replay   R new seed   Esc quit", 18, 40)
  love.graphics.print("All replay-specific glue lives in dev/replay.lua", 480, 40)

  for _, block in ipairs(M.world.blocks) do
    drawBlock(block)
  end
  for _, shard in ipairs(M.world.shards) do
    drawShard(shard)
  end

  love.graphics.setColor(0.35, 0.78, 1)
  love.graphics.circle("fill", M.player.x, M.player.y, 22)
  love.graphics.setColor(1, 1, 1, 0.85)
  love.graphics.circle("line", M.player.x, M.player.y, 22)

  love.graphics.setColor(1, 1, 1)
  love.graphics.print("score: " .. tostring(M.player.score), 18, 104)
  love.graphics.print("seed: " .. tostring(M.world.seed), 18, 126)
  love.graphics.print("stream: adapter_demo", 18, 148)
  love.graphics.print(M.world.message, 18, 170)

  local status = DEBUGGER and "connected to Feather runtime" or "DEBUGGER not available"
  setColor(DEBUGGER and { 0.35, 1, 0.58 } or { 1, 0.36, 0.36 })
  love.graphics.print(status, 18, love.graphics.getHeight() - 32)

  love.graphics.setColor(0.72, 0.78, 0.86)
  local y = 220
  love.graphics.print("Recent events", love.graphics.getWidth() - 320, y)
  for i, line in ipairs(M.world.events) do
    love.graphics.print(line, love.graphics.getWidth() - 320, y + 22 * i)
  end
end

return M
