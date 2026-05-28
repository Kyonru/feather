local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")
local PreviewRuntime = require((FEATHER_PLUGIN_PATH or "") .. "plugins.shader-graph.preview_runtime")

local ShaderGraphPlugin = Class({ __includes = Base })

function ShaderGraphPlugin:init(config)
  Base.init(self, config)
  self.preview = nil
  self.previewCache = {
    shaderKey = nil,
    shader = nil,
    drawableKey = nil,
    drawable = nil,
    texturesKey = nil,
    textures = nil,
    parametersKey = nil,
  }
end

local function stableValue(value, depth)
  depth = depth or 0
  if depth > 5 then
    return "<max-depth>"
  end
  local valueType = type(value)
  if valueType ~= "table" then
    return valueType .. ":" .. tostring(value)
  end

  local keys = {}
  for key in pairs(value) do
    keys[#keys + 1] = key
  end
  table.sort(keys, function(a, b)
    return tostring(a) < tostring(b)
  end)

  local parts = {}
  for _, key in ipairs(keys) do
    parts[#parts + 1] = tostring(key) .. "=" .. stableValue(value[key], depth + 1)
  end
  return "{" .. table.concat(parts, ",") .. "}"
end

local function previewInputKey(params)
  return tostring(params.previewKey or stableValue({
    pixelSource = params.pixelSource,
    vertexSource = params.vertexSource,
    shape = params.shape,
    color = params.color,
    baseTexture = params.baseTexture,
    textureUniforms = params.textureUniforms,
    textures = params.textures,
    parameters = params.parameters,
  }))
end

local function shaderKey(params)
  return tostring(params.pixelSource or "") .. "\n---vertex---\n" .. tostring(params.vertexSource or "")
end

local function drawableKey(params, shape, color)
  local baseTexture = params.baseTexture
  if type(baseTexture) == "table" and baseTexture.dataBase64 then
    return stableValue({
      filename = baseTexture.filename,
      bytes = #tostring(baseTexture.dataBase64),
      data = baseTexture.dataBase64,
    })
  end
  return stableValue({
    shape = shape,
    size = params.size,
    color = color,
  })
end

local function previewSize()
  local width = love.graphics.getWidth()
  local height = love.graphics.getHeight()
  return math.min(280, math.max(128, math.min(width, height) * 0.42))
end

local function ensurePreviewCanvas(preview, size)
  size = math.max(1, math.floor(size))
  if preview.canvas and preview.canvasSize == size then
    return preview.canvas
  end
  local ok, canvas = pcall(love.graphics.newCanvas, size, size)
  if not ok or not canvas then
    return nil
  end
  preview.canvas = canvas
  preview.canvasSize = size
  preview.renderedAt = nil
  return canvas
end

local function renderPreviewCanvas(preview, size)
  local canvas = ensurePreviewCanvas(preview, size)
  if not canvas then
    return false
  end

  local drawable = preview.drawable
  local shader = preview.shader
  local previousCanvas = love.graphics.getCanvas()
  local previousShader = love.graphics.getShader()
  local r, g, b, a = love.graphics.getColor()
  local previousBlend, previousAlphaMode = love.graphics.getBlendMode()

  love.graphics.push()
  love.graphics.origin()
  love.graphics.setCanvas(canvas)
  love.graphics.clear(0, 0, 0, 0)
  love.graphics.setBlendMode("alpha")
  if shader then
    if shader.send and love.timer then
      pcall(shader.send, shader, "u_time", love.timer.getTime())
    end
    love.graphics.setShader(shader)
  else
    love.graphics.setShader()
  end
  love.graphics.setColor(1, 1, 1, 1)
  love.graphics.draw(drawable, 0, 0, 0, size / drawable:getWidth(), size / drawable:getHeight())
  love.graphics.setCanvas(previousCanvas)
  love.graphics.setShader(previousShader)
  love.graphics.setBlendMode(previousBlend, previousAlphaMode)
  love.graphics.setColor(r, g, b, a)
  love.graphics.pop()

  preview.renderedAt = love.timer and love.timer.getTime() or os.clock()
  return true
end

function ShaderGraphPlugin:_previewShader(params)
  if not love or not love.graphics then
    return { status = "error", pixelError = "Shader preview requires love.graphics." }
  end

  local shape = PreviewRuntime.normalizeShape(params.shape)
  local cache = self.previewCache
  local inputKey = previewInputKey(params)
  if self.preview and self.preview.inputKey == inputKey then
    self.preview.updatedAt = love.timer and love.timer.getTime() or os.clock()
    return { status = "ok", shape = self.preview.shape, color = self.preview.color, cached = true }
  end

  local shaderCacheKey = shaderKey(params)
  local shader = cache.shader
  if cache.shaderKey ~= shaderCacheKey or not shader then
    local nextShader, pixelError, vertexError = PreviewRuntime.buildShader(params.pixelSource, params.vertexSource)
    if not nextShader then
      return { status = "error", pixelError = pixelError, vertexError = vertexError }
    end
    shader = nextShader
    cache.shader = shader
    cache.shaderKey = shaderCacheKey
  end

  local color = PreviewRuntime.previewColor(params.color)
  local drawable
  local baseTexture = params.baseTexture
  local nextDrawableKey = drawableKey(params, shape, color)
  if cache.drawableKey == nextDrawableKey and cache.drawable then
    drawable = cache.drawable
  elseif type(baseTexture) == "table" and baseTexture.dataBase64 then
    local image, imageErr = PreviewRuntime.imageFromUpload(baseTexture, "preview-texture.png")
    if not image then
      return { status = "error", pixelError = imageErr }
    end
    drawable = image
  else
    local okCanvas, canvasOrErr = pcall(PreviewRuntime.makePreviewImage, shape, params.size, color)
    if not okCanvas then
      return { status = "error", pixelError = tostring(canvasOrErr) }
    end
    drawable = canvasOrErr
  end
  cache.drawable = drawable
  cache.drawableKey = nextDrawableKey

  local nextTexturesKey = stableValue({ params.textureUniforms, params.textures, shaderCacheKey })
  local textures = cache.textures
  if cache.texturesKey ~= nextTexturesKey or not textures then
    local textureErr
    textures, textureErr = PreviewRuntime.sendTextureUniforms(shader, params.textureUniforms, params.textures)
    if not textures then
      return { status = "error", pixelError = textureErr }
    end
    cache.textures = textures
    cache.texturesKey = nextTexturesKey
  end

  local nextParametersKey = stableValue({ params.parameters, shaderCacheKey })
  if cache.parametersKey ~= nextParametersKey then
    local parametersOk, parameterErr = PreviewRuntime.sendShaderParameters(shader, params.parameters)
    if not parametersOk then
      return { status = "error", pixelError = parameterErr }
    end
    cache.parametersKey = nextParametersKey
  end

  self.preview = {
    inputKey = inputKey,
    shader = shader,
    drawable = drawable,
    shape = shape,
    color = color,
    baseTexture = type(baseTexture) == "table" and baseTexture.filename or nil,
    textures = textures,
    canvas = self.preview and self.preview.canvas or nil,
    canvasSize = self.preview and self.preview.canvasSize or nil,
    renderedAt = nil,
    renderInterval = 1 / 15,
    updatedAt = love.timer and love.timer.getTime() or os.clock(),
  }

  return { status = "ok", shape = shape, color = color }
end

function ShaderGraphPlugin:onDraw()
  if not self.preview or not love or not love.graphics then
    return
  end

  local drawable = self.preview.drawable
  local shader = self.preview.shader
  if not drawable or not shader then
    return
  end

  local previousBlend, previousAlphaMode = love.graphics.getBlendMode()
  local previousShader = love.graphics.getShader()
  local r, g, b, a = love.graphics.getColor()
  local previousLineWidth = love.graphics.getLineWidth()
  local width = love.graphics.getWidth()
  local height = love.graphics.getHeight()
  local previewExtent = previewSize()
  local scale = previewExtent / drawable:getWidth()
  local x = (width - previewExtent) / 2
  local y = (height - previewExtent) / 2

  love.graphics.push()
  love.graphics.origin()
  love.graphics.setShader()
  love.graphics.setBlendMode("alpha")
  love.graphics.setColor(0.04, 0.05, 0.07, 0.74)
  love.graphics.rectangle("fill", x - 10, y - 10, previewExtent + 20, previewExtent + 42, 6, 6)
  love.graphics.setColor(1, 1, 1, 0.22)
  love.graphics.setLineWidth(1)
  love.graphics.rectangle("line", x - 10, y - 10, previewExtent + 20, previewExtent + 42, 6, 6)
  love.graphics.setColor(1, 1, 1, 0.72)
  local label = self.preview.baseTexture or self.preview.shape
  love.graphics.print("Shader Preview: " .. label, x - 4, y + previewExtent + 12)

  local now = love.timer and love.timer.getTime() or os.clock()
  local shouldRender = not self.preview.renderedAt or (now - self.preview.renderedAt) >= (self.preview.renderInterval or (1 / 15))
  local renderedToCanvas = self.preview.canvas and not shouldRender
  if shouldRender then
    renderedToCanvas = renderPreviewCanvas(self.preview, previewExtent)
  end
  love.graphics.setShader()
  love.graphics.setColor(1, 1, 1, 1)
  if renderedToCanvas and self.preview.canvas then
    love.graphics.draw(self.preview.canvas, x, y)
  else
    love.graphics.setShader(shader)
    love.graphics.draw(drawable, x, y, 0, scale, scale)
  end

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
    return PreviewRuntime.compileShader(params)
  end

  if action == "preview-shader" then
    return self:_previewShader(params)
  end

  if action == "clear-preview" then
    self.preview = nil
    self.previewCache = {
      shaderKey = nil,
      shader = nil,
      drawableKey = nil,
      drawable = nil,
      texturesKey = nil,
      textures = nil,
      parametersKey = nil,
    }
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
      color = self.preview.color,
      baseTexture = self.preview.baseTexture,
      active = true,
    } or nil,
  }
end

return ShaderGraphPlugin
