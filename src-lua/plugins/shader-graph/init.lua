local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")
local PreviewRuntime = require((FEATHER_PLUGIN_PATH or "") .. "plugins.shader-graph.preview_runtime")

local ShaderGraphPlugin = Class({ __includes = Base })

function ShaderGraphPlugin:init(config)
  Base.init(self, config)
  self.preview = nil
end

function ShaderGraphPlugin:_previewShader(params)
  if not love or not love.graphics then
    return { status = "error", pixelError = "Shader preview requires love.graphics." }
  end

  local shape = PreviewRuntime.normalizeShape(params.shape)

  local shader, pixelError, vertexError = PreviewRuntime.buildShader(params.pixelSource, params.vertexSource)
  if not shader then
    return { status = "error", pixelError = pixelError, vertexError = vertexError }
  end

  local color = PreviewRuntime.previewColor(params.color)
  local drawable
  local baseTexture = params.baseTexture
  if type(baseTexture) == "table" and baseTexture.dataBase64 then
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

  local textures, textureErr = PreviewRuntime.sendTextureUniforms(shader, params.textureUniforms, params.textures)
  if not textures then
    return { status = "error", pixelError = textureErr }
  end
  local parametersOk, parameterErr = PreviewRuntime.sendShaderParameters(shader, params.parameters)
  if not parametersOk then
    return { status = "error", pixelError = parameterErr }
  end

  self.preview = {
    shader = shader,
    drawable = drawable,
    shape = shape,
    color = color,
    baseTexture = type(baseTexture) == "table" and baseTexture.filename or nil,
    textures = textures,
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
  local previewSize = math.min(280, math.max(128, math.min(width, height) * 0.42))
  local scale = previewSize / drawable:getWidth()
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
  local label = self.preview.baseTexture or self.preview.shape
  love.graphics.print("Shader Preview: " .. label, x - 4, y + previewSize + 12)

  if shader.send and love.timer then
    pcall(shader.send, shader, "u_time", love.timer.getTime())
  end
  love.graphics.setShader(shader)
  love.graphics.setColor(1, 1, 1, 1)
  love.graphics.draw(drawable, x, y, 0, scale, scale)

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
