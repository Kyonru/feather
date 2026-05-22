local state = {
  tool = "shader-graph",
  shaderName = "shader graph",
  particles = {},
  time = 0,
}

local function drawGrid(w, h)
  love.graphics.setColor(0.58, 0.64, 0.72, 0.12)
  for x = 0, w, 32 do
    love.graphics.line(x, 0, x, h)
  end
  for y = 0, h, 32 do
    love.graphics.line(0, y, w, y)
  end
end

local function drawShaderPreview(w, h)
  local r = math.min(w, h) * 0.22
  local x, y = w * 0.5, h * 0.5
  love.graphics.setColor(0.22, 0.74, 0.97, 1)
  love.graphics.circle("fill", x, y, r)
  love.graphics.setColor(0.49, 0.23, 0.93, 0.55)
  love.graphics.circle("fill", x + r * 0.18, y + r * 0.12, r * 0.7)
  love.graphics.setColor(0.4, 0.91, 0.98, 1)
  love.graphics.setLineWidth(3)
  love.graphics.circle("line", x, y, r)
  love.graphics.setColor(1, 1, 1, 0.9)
  love.graphics.printf(state.shaderName, x - r, y + r + 18, r * 2, "center")
end

local function drawParticles(w, h)
  local system = state.particles or {}
  local props = system.properties or {}
  local rate = math.max(24, math.min(180, tonumber(props.emissionRate) or 80))
  local speed = tonumber(props.speedMax) or 140
  local cx = w * 0.5 + (tonumber(system.x) or 0)
  local cy = h * 0.56 + (tonumber(system.y) or 0)

  for i = 1, rate do
    local p = ((i / rate) + state.time * 0.15 * (speed / 120)) % 1
    local angle = i * 2.399 + state.time
    local spread = 26 + p * math.min(220, speed)
    local x = cx + math.cos(angle) * spread * (0.25 + p)
    local y = cy - p * 210 + math.sin(angle * 1.7) * spread * 0.18
    local alpha = math.max(0, 1 - p)
    love.graphics.setColor(1, 0.45 + 0.35 * alpha, 0.12 + 0.45 * p, alpha)
    love.graphics.circle("fill", x, y, 2 + 8 * alpha)
  end
end

function love.update(dt)
  state.time = state.time + dt
end

function love.draw()
  local w, h = love.graphics.getDimensions()
  love.graphics.clear(0.02, 0.03, 0.05, 1)
  drawGrid(w, h)
  if state.tool == "particle-system-playground" then
    drawParticles(w, h)
  else
    drawShaderPreview(w, h)
  end
  love.graphics.setColor(0.84, 0.87, 0.91, 0.72)
  love.graphics.print("Feather standalone preview target", 12, 12)
end
