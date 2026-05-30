--- From https://github.com/Oval-Tutu/bootstrap-love2d-project/blob/main/game/lib/overlayStats.lua
---@class IngameOverlayStats
---A performance monitoring overlay module for LÖVE games
---@field isActive boolean Whether the overlay is currently visible
---@field sampleSize number Maximum number of samples to keep for metrics
---@field vsyncEnabled boolean Current VSync state
local name, version, vendor, device = love.graphics.getRendererInfo()
local arch = "unknown"
local ok, ffi = pcall(require, "ffi")
if ok and ffi and ffi.arch then
  arch = ffi.arch
elseif love.system.getOS() == "Web" then
  arch = "Web"
end

local overlayStats = {
  isActive = false,
  sampleSize = 60,
  sampleInterval = 0.1,
  sampleElapsed = 0,
  vsyncEnabled = nil,
  lastControllerCheck = 0,
  CONTROLLER_COOLDOWN = 0.2,
  -- Store active particle systems
  particleSystems = {},
  renderInfo = {
    name = name,
    version = version,
    vendor = vendor,
    device = device,
  },
  sysInfo = {
    arch = arch,
    os = love.system.getOS(),
    cpuCount = love.system.getProcessorCount(),
  },
  supportedFeatures = {
    glsl3 = false,
    pixelShaderHighp = false,
  },
  metrics = {
    canvases = {},
    canvasSwitches = {},
    drawCalls = {},
    drawCallsBatched = {},
    frameTime = {},
    imageCount = {},
    memoryUsage = {},
    shaderSwitches = {},
    textureMemory = {},
    particleCount = {},
  },
  currentSample = 0,
  averages = {},
  latestStats = {
    canvases = 0,
    canvasSwitches = 0,
    drawCalls = 0,
    drawCallsBatched = 0,
    imageCount = 0,
    shaderSwitches = 0,
    textureMemory = 0,
  },
  font = nil,
  layout = nil,
  -- Touch activation parameters
  touch = {
    cornerSize = 80, -- Size of the activation area in pixels
    lastTapTime = 0, -- Time of the last tap
    doubleTapThreshold = 0.5, -- Maximum time between taps to register as double-tap
    overlayArea = { x = 10, y = 10, width = 280, height = 340 }, -- Will be updated in draw
  },
}

-- Private functions

local function resetMetrics()
  for k, _ in pairs(overlayStats.metrics) do
    overlayStats.metrics[k] = {}
  end
  overlayStats.averages = {}
  overlayStats.currentSample = 0
  overlayStats.sampleElapsed = 0
end

local function updateAverages()
  local averages = overlayStats.averages
  for metric, samples in pairs(overlayStats.metrics) do
    local sum = 0
    local count = 0
    for _, value in ipairs(samples) do
      sum = sum + value
      count = count + 1
    end
    averages[metric] = count > 0 and sum / count or 0
  end
end

local function updateLayout()
  local font = overlayStats.font or (love.graphics.getFont and love.graphics.getFont())
  if not font then
    return
  end

  local padding = 20
  local baseWidth = 280
  local versionText = string.format("%s", overlayStats.renderInfo.version)
  local rendererText = string.format("Renderer: %s (%s)", overlayStats.renderInfo.name, overlayStats.renderInfo.vendor)
  local systemText = overlayStats.sysInfo.os
    .. " "
    .. overlayStats.sysInfo.arch
    .. ": "
    .. overlayStats.sysInfo.cpuCount
    .. "x CPU"
  local contentWidth = math.max(font:getWidth(versionText), font:getWidth(rendererText), font:getWidth(systemText), baseWidth)
  local rectangleWidth = contentWidth + padding

  overlayStats.layout = {
    height = 340,
    rectangleWidth = rectangleWidth,
    rendererText = rendererText,
    systemText = systemText,
    versionText = versionText,
  }

  overlayStats.touch.overlayArea = {
    x = 10,
    y = 10,
    width = rectangleWidth,
    height = 340,
  }
end

local function sampleMetrics(dt)
  overlayStats.currentSample = overlayStats.currentSample + 1
  if overlayStats.currentSample > overlayStats.sampleSize then
    overlayStats.currentSample = 1
  end

  local stats = love.graphics.getStats()
  local textureMemory = (stats.texturememory or 0) / (1024 * 1024)
  overlayStats.latestStats = {
    canvases = stats.canvases or stats.canvasses or 0,
    canvasSwitches = stats.canvasswitches or 0,
    drawCalls = stats.drawcalls or 0,
    drawCallsBatched = stats.drawcallsbatched or 0,
    imageCount = stats.images or 0,
    shaderSwitches = stats.shaderswitches or 0,
    textureMemory = textureMemory,
  }

  overlayStats.metrics.canvases[overlayStats.currentSample] = overlayStats.latestStats.canvases
  overlayStats.metrics.canvasSwitches[overlayStats.currentSample] = overlayStats.latestStats.canvasSwitches
  overlayStats.metrics.drawCalls[overlayStats.currentSample] = overlayStats.latestStats.drawCalls
  overlayStats.metrics.drawCallsBatched[overlayStats.currentSample] = overlayStats.latestStats.drawCallsBatched
  overlayStats.metrics.imageCount[overlayStats.currentSample] = overlayStats.latestStats.imageCount
  overlayStats.metrics.shaderSwitches[overlayStats.currentSample] = overlayStats.latestStats.shaderSwitches
  overlayStats.metrics.textureMemory[overlayStats.currentSample] = textureMemory
  overlayStats.metrics.memoryUsage[overlayStats.currentSample] = collectgarbage("count")
  overlayStats.metrics.frameTime[overlayStats.currentSample] = dt

  local totalParticles = 0
  for ps, _ in pairs(overlayStats.particleSystems) do
    if ps:isActive() then
      totalParticles = totalParticles + ps:getCount()
    end
  end
  overlayStats.metrics.particleCount[overlayStats.currentSample] = totalParticles

  updateAverages()
end

---Toggles the visibility of the overlay
---Resets all metrics on activation
local function toggleOverlay()
  overlayStats.isActive = not overlayStats.isActive
  resetMetrics()
  print(string.format("Overlay %s", overlayStats.isActive and "enabled" or "disabled"))
end

---Toggles the VSync state in LÖVE
---Only functions when the overlay is active
local function toggleVSync()
  if not overlayStats.isActive then
    return
  end
  overlayStats.vsyncEnabled = not overlayStats.vsyncEnabled
  love.window.setVSync(overlayStats.vsyncEnabled and 1 or 0)
  print(string.format("VSync %s", overlayStats.vsyncEnabled and "enabled" or "disabled"))
end

---Checks and processes controller input for toggling the overlay
---Called from update() function
local function handleController()
  -- Controller input with cooldown
  local currentTime = love.timer.getTime()
  if currentTime - overlayStats.lastControllerCheck < overlayStats.CONTROLLER_COOLDOWN then
    return
  end

  local joysticks = love.joystick.getJoysticks()
  for _, joystick in ipairs(joysticks) do
    if joystick:isGamepadDown("back") then
      if joystick:isGamepadDown("a") then
        toggleOverlay()
        overlayStats.lastControllerCheck = currentTime
      elseif joystick:isGamepadDown("b") then
        toggleVSync()
        overlayStats.lastControllerCheck = currentTime
      end
    end
  end
end

---Checks if the given touch position is in the top-right corner activation area
---@param x number The x-coordinate of the touch
---@param y number The y-coordinate of the touch
---@return boolean inCorner True if touch is in the activation area
local function isTouchInCorner(x, y)
  local w = love.graphics.getWidth()
  return x >= w - overlayStats.touch.cornerSize and y <= overlayStats.touch.cornerSize
end

---Checks if the given touch position is inside the overlay area
---@param x number The x-coordinate of the touch
---@param y number The y-coordinate of the touch
---@return boolean insideOverlay True if touch is inside the overlay area
local function isTouchInsideOverlay(x, y)
  local area = overlayStats.touch.overlayArea
  return x >= area.x and x <= area.x + area.width and y >= area.y and y <= area.y + area.height
end

---Processes touch input for the overlay toggle
---@param x number The x-coordinate of the touch
---@param y number The y-coordinate of the touch
---@return nil
local function handleTouch(x, y)
  local currentTime = love.timer.getTime()
  local timeSinceLastTap = currentTime - overlayStats.touch.lastTapTime

  if overlayStats.isActive and isTouchInsideOverlay(x, y) then
    -- Handle touches inside the active overlay
    if timeSinceLastTap <= overlayStats.touch.doubleTapThreshold then
      -- Double tap inside overlay - toggle VSync
      toggleVSync()
      overlayStats.touch.lastTapTime = 0
    else
      overlayStats.touch.lastTapTime = currentTime
    end
  elseif isTouchInCorner(x, y) then
    -- Original behavior for corner taps to toggle overlay
    if timeSinceLastTap <= overlayStats.touch.doubleTapThreshold then
      toggleOverlay()
      overlayStats.touch.lastTapTime = 0
    else
      overlayStats.touch.lastTapTime = currentTime
    end
  end
end

-- Public API

---Initializes the overlay stats module
---@return nil
function overlayStats.load()
  resetMetrics()
  -- Get initial vsync state from LÖVE config
  overlayStats.vsyncEnabled = love.window.getVSync() == 1

  -- Get graphics feature support information
  local supported = love.graphics.getSupported()
  overlayStats.supportedFeatures.glsl3 = supported.glsl3
  overlayStats.supportedFeatures.pixelShaderHighp = supported.pixelshaderhighp

  overlayStats.font = love.graphics.newFont(16)
  updateLayout()
end

---Draws the performance overlay when active
---@return nil
function overlayStats.draw()
  if not overlayStats.isActive then
    return
  end

  local averages = overlayStats.averages
  local stats = overlayStats.latestStats
  local layout = overlayStats.layout
  if not layout then
    updateLayout()
    layout = overlayStats.layout
  end

  -- Set up overlay drawing
  love.graphics.push("all")
  love.graphics.setFont(overlayStats.font)

  -- Draw background rectangle with dynamic width
  love.graphics.setColor(0, 0, 0, 0.8)
  love.graphics.rectangle("fill", 10, 10, layout.rectangleWidth, layout.height)
  love.graphics.setColor(0.678, 0.847, 0.902, 1)

  -- System Info
  local y = 20
  love.graphics.print(layout.systemText, 20, y)
  y = y + 30

  love.graphics.setColor(1, 1, 1, 1)
  love.graphics.print(layout.rendererText, 20, y)
  y = y + 20

  love.graphics.print(layout.versionText, 20, y)
  y = y + 30

  -- Safely handle frameTime with nil/zero checks
  love.graphics.setColor(0, 1, 0, 1)
  local frameTime = averages.frameTime or 0
  local fps = frameTime > 0 and (1 / frameTime) or 0
  love.graphics.print(string.format("FPS: %.1f (%.1fms)", fps, frameTime * 1000), 20, y)
  y = y + 20

  love.graphics.print(string.format("Canvases: %d", stats.canvases), 20, y)
  y = y + 20

  love.graphics.print(string.format("Canvas Switches: %d", stats.canvasSwitches), 20, y)
  y = y + 20

  love.graphics.print(string.format("Shader Switches: %d", stats.shaderSwitches), 20, y)
  y = y + 20

  love.graphics.print(string.format("Draw Calls: %d (%d batched)", stats.drawCalls, stats.drawCallsBatched), 20, y)
  y = y + 20

  love.graphics.print(string.format("RAM: %.1f MB", (averages.memoryUsage or 0) / 1024), 20, y)
  y = y + 20

  love.graphics.print(string.format("VRAM: %.1f MB", stats.textureMemory), 20, y)
  y = y + 20

  love.graphics.print(string.format("Images: %d", stats.imageCount), 20, y)
  y = y + 20

  -- Display particle count
  local currentParticleCount = averages.particleCount or 0
  love.graphics.print(string.format("Particles: %d", math.floor(currentParticleCount)), 20, y)
  y = y + 20

  -- Add GLSL 3 support indicator
  if overlayStats.supportedFeatures.glsl3 then
    love.graphics.setColor(0, 1, 0, 1)
  else
    love.graphics.setColor(1, 0, 0, 1)
  end
  love.graphics.print(string.format("GLSL 3: %s", overlayStats.supportedFeatures.glsl3 and "Yes" or "No"), 20, y)
  y = y + 20

  -- Add pixel shader highp support indicator
  if overlayStats.supportedFeatures.pixelShaderHighp then
    love.graphics.setColor(0, 1, 0, 1)
  else
    love.graphics.setColor(1, 0, 0, 1)
  end
  love.graphics.print(
    string.format("Pixel Shader highp: %s", overlayStats.supportedFeatures.pixelShaderHighp and "Yes" or "No"),
    20,
    y
  )
  y = y + 20

  -- Add VSync status with color indication
  if overlayStats.vsyncEnabled then
    love.graphics.setColor(0, 1, 0, 1)
  else
    love.graphics.setColor(1, 0, 0, 1)
  end
  love.graphics.print(string.format("VSync: %s", overlayStats.vsyncEnabled and "ON" or "OFF"), 20, y)

  love.graphics.pop()
end

---Updates performance metrics and handles controller input
---@param dt number Delta time since the last frame
---@return nil
function overlayStats.update(dt)
  handleController()

  if not overlayStats.isActive then
    return
  end

  overlayStats.sampleElapsed = overlayStats.sampleElapsed + (dt or 0)
  if overlayStats.currentSample > 0 and overlayStats.sampleElapsed < overlayStats.sampleInterval then
    return
  end

  overlayStats.sampleElapsed = 0
  sampleMetrics(dt or 0)
end

---Processes keyboard input for the overlay
---@param key string The key that was pressed
---@return nil
function overlayStats.handleKeyboard(key)
  if key == "f3" then
    toggleOverlay()
  elseif key == "f5" then
    toggleVSync()
  end
end

---Handles touch press events for toggling the overlay
---@param id any Touch ID from LÖVE
---@param x number The x-coordinate of the touch
---@param y number The y-coordinate of the touch
---@param dx number The horizontal component of the touch press
---@param dy number The vertical component of the touch press
---@param pressure number The pressure of the touch
---@return nil
function overlayStats.handleTouch(_, x, y)
  handleTouch(x, y)
end

---Register a particle system to be tracked
---@param particleSystem love.ParticleSystem The particle system to register
---@return nil
function overlayStats.registerParticleSystem(particleSystem)
  overlayStats.particleSystems[particleSystem] = true
end

---Unregister a particle system from tracking
---@param particleSystem love.ParticleSystem The particle system to unregister
---@return nil
function overlayStats.unregisterParticleSystem(particleSystem)
  overlayStats.particleSystems[particleSystem] = nil
end

return overlayStats
