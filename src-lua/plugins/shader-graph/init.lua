local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")

local ShaderGraphPlugin = Class({ __includes = Base })

local PREVIEW_SHAPES = {
  circle = true,
  line = true,
  rectangle = true,
}

local DEFAULT_PREVIEW_SIZE = 128

local function restoreCanvas(canvas)
  if canvas then
    love.graphics.setCanvas(canvas)
  else
    love.graphics.setCanvas()
  end
end

local function buildShader(pixelSource, vertexSource)
  pixelSource = pixelSource or ""
  vertexSource = vertexSource or ""

  local pixelOk, pixelShaderOrErr = pcall(function()
    return love.graphics.newShader(pixelSource)
  end)

  if not pixelOk then
    return nil, tostring(pixelShaderOrErr), nil
  end

  if vertexSource ~= "" then
    local combinedOk, combinedShaderOrErr = pcall(function()
      return love.graphics.newShader(pixelSource .. "\n" .. vertexSource)
    end)
    if not combinedOk then
      return nil, nil, tostring(combinedShaderOrErr)
    end
    return combinedShaderOrErr
  end

  return pixelShaderOrErr
end

local function makePreviewCanvas(shape, size)
  size = tonumber(size) or DEFAULT_PREVIEW_SIZE
  if size < 32 then
    size = 32
  elseif size > 512 then
    size = 512
  end

  local canvas = love.graphics.newCanvas(size, size)
  local previousCanvas = love.graphics.getCanvas()
  local previousShader = love.graphics.getShader()
  local previousBlend, previousAlphaMode = love.graphics.getBlendMode()
  local previousLineWidth = love.graphics.getLineWidth()
  local r, g, b, a = love.graphics.getColor()
  local pad = size * 0.22

  love.graphics.push()
  love.graphics.setCanvas(canvas)
  love.graphics.origin()
  love.graphics.clear(0, 0, 0, 0)
  love.graphics.setShader()
  love.graphics.setBlendMode("alpha")
  love.graphics.setColor(1, 1, 1, 1)

  if shape == "rectangle" then
    love.graphics.rectangle("fill", pad, pad, size - pad * 2, size - pad * 2)
  elseif shape == "line" then
    love.graphics.setLineWidth(math.max(6, size * 0.12))
    love.graphics.line(pad, size - pad, size - pad, pad)
  else
    love.graphics.circle("fill", size / 2, size / 2, size * 0.3)
  end

  restoreCanvas(previousCanvas)
  love.graphics.pop()
  love.graphics.setShader(previousShader)
  love.graphics.setBlendMode(previousBlend, previousAlphaMode)
  love.graphics.setLineWidth(previousLineWidth)
  love.graphics.setColor(r, g, b, a)

  return canvas
end

local function compileShader(params)
  local pixelSource = params.pixelSource or ""
  local vertexSource = params.vertexSource or ""

  local pixelError = nil
  local vertexError = nil

  local pixelOk, pixelErr = pcall(function()
    love.graphics.newShader(pixelSource)
  end)
  if not pixelOk then
    pixelError = tostring(pixelErr)
  end

  if pixelOk and vertexSource and vertexSource ~= "" then
    local vertOk, vertErr = pcall(function()
      love.graphics.newShader(pixelSource .. "\n" .. vertexSource)
    end)
    if not vertOk then
      vertexError = tostring(vertErr)
    end
  end

  if pixelError or vertexError then
    return { status = "error", pixelError = pixelError, vertexError = vertexError }
  end

  return { status = "ok" }
end

function ShaderGraphPlugin:init(config)
  Base.init(self, config)
  self.preview = nil
end

function ShaderGraphPlugin:_previewShader(params)
  if not love or not love.graphics then
    return { status = "error", pixelError = "Shader preview requires love.graphics." }
  end

  local shape = tostring(params.shape or "circle")
  if not PREVIEW_SHAPES[shape] then
    shape = "circle"
  end

  local shader, pixelError, vertexError = buildShader(params.pixelSource, params.vertexSource)
  if not shader then
    return { status = "error", pixelError = pixelError, vertexError = vertexError }
  end

  local okCanvas, canvasOrErr = pcall(makePreviewCanvas, shape, params.size)
  if not okCanvas then
    return { status = "error", pixelError = tostring(canvasOrErr) }
  end

  self.preview = {
    shader = shader,
    canvas = canvasOrErr,
    shape = shape,
    updatedAt = love.timer and love.timer.getTime() or os.clock(),
  }

  return { status = "ok", shape = shape }
end

function ShaderGraphPlugin:onDraw()
  if not self.preview or not love or not love.graphics then
    return
  end

  local canvas = self.preview.canvas
  local shader = self.preview.shader
  if not canvas or not shader then
    return
  end

  local previousBlend, previousAlphaMode = love.graphics.getBlendMode()
  local previousShader = love.graphics.getShader()
  local r, g, b, a = love.graphics.getColor()
  local previousLineWidth = love.graphics.getLineWidth()
  local width = love.graphics.getWidth()
  local height = love.graphics.getHeight()
  local previewSize = math.min(280, math.max(128, math.min(width, height) * 0.42))
  local scale = previewSize / canvas:getWidth()
  local x = (width - previewSize) / 2
  local y = (height - previewSize) / 2

  love.graphics.push()
  love.graphics.origin()
  love.graphics.setShader()
  love.graphics.setBlendMode("alpha")
  love.graphics.setColor(0.04, 0.05, 0.07, 0.74)
  love.graphics.rectangle("fill", x - 10, y - 10, previewSize + 20, previewSize + 42, 6, 6)
  love.graphics.setColor(1, 1, 1, 0.22)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle("line", x - 10, y - 10, previewSize + 20, previewSize + 42, 6, 6)
  love.graphics.setColor(1, 1, 1, 0.72)
  love.graphics.print("Shader Preview: " .. self.preview.shape, x - 4, y + previewSize + 12)

  if shader.send and love.timer then
    pcall(shader.send, shader, "u_time", love.timer.getTime())
  end
  love.graphics.setShader(shader)
  love.graphics.setColor(1, 1, 1, 1)
  love.graphics.draw(canvas, x, y, 0, scale, scale)

  love.graphics.setBlendMode(previousBlend, previousAlphaMode)
  love.graphics.setShader(previousShader)
  love.graphics.setColor(r, g, b, a)
  love.graphics.setLineWidth(previousLineWidth)
  love.graphics.pop()
end

function ShaderGraphPlugin:handleActionRequest(request)
  local params = request.params or {}
  local action = params.action

  if action == "compile-shader" then
    return compileShader(params)
  end

  if action == "preview-shader" then
    return self:_previewShader(params)
  end

  if action == "clear-preview" then
    self.preview = nil
    return { status = "ok" }
  end

  return { status = "error", pixelError = "Unknown shader graph action: " .. tostring(action) }
end

function ShaderGraphPlugin:getConfig()
  return {
    type = "shader-graph",
    icon = "blend",
    preview = self.preview and {
      shape = self.preview.shape,
      active = true,
    } or nil,
  }
end

return ShaderGraphPlugin
