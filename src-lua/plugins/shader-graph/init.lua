local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")
local base64 = require(FEATHER_PATH .. ".lib.base64")

local ShaderGraphPlugin = Class({ __includes = Base })

local PREVIEW_SHAPES = {
  circle = true,
  line = true,
  rectangle = true,
}

local DEFAULT_PREVIEW_SIZE = 128
local B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local B64_LOOKUP = {}
for i = 1, #B64_CHARS do
  B64_LOOKUP[B64_CHARS:sub(i, i)] = i - 1
end

local function decodeBase64(data)
  data = tostring(data or ""):gsub("%s+", "")
  if data == "" then
    return nil
  end

  if type(base64.decode) == "function" then
    local ok, decoded = pcall(base64.decode, data)
    if ok then
      return decoded
    end
  end

  local out = {}
  local index = 1
  for i = 1, #data, 4 do
    local c1 = data:sub(i, i)
    local c2 = data:sub(i + 1, i + 1)
    local c3 = data:sub(i + 2, i + 2)
    local c4 = data:sub(i + 3, i + 3)
    local n1 = B64_LOOKUP[c1]
    local n2 = B64_LOOKUP[c2]
    local n3 = c3 ~= "=" and B64_LOOKUP[c3] or nil
    local n4 = c4 ~= "=" and B64_LOOKUP[c4] or nil

    if not n1 or not n2 then
      return nil
    end

    out[index] = string.char(n1 * 4 + math.floor(n2 / 16))
    index = index + 1
    if n3 then
      out[index] = string.char((n2 % 16) * 16 + math.floor(n3 / 4))
      index = index + 1
    end
    if n3 and n4 then
      out[index] = string.char((n3 % 4) * 64 + n4)
      index = index + 1
    end
  end

  return table.concat(out)
end

local function clamp01(value, fallback)
  value = tonumber(value)
  if value == nil then
    return fallback
  end
  if value < 0 then
    return 0
  end
  if value > 1 then
    return 1
  end
  return value
end

local function previewColor(value)
  if type(value) ~= "table" then
    return { 1, 1, 1, 1 }
  end
  return {
    clamp01(value[1] or value.r, 1),
    clamp01(value[2] or value.g, 1),
    clamp01(value[3] or value.b, 1),
    clamp01(value[4] or value.a, 1),
  }
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

local function makePreviewCanvas(shape, size, color)
  size = tonumber(size) or DEFAULT_PREVIEW_SIZE
  if size < 32 then
    size = 32
  elseif size > 512 then
    size = 512
  end

  local imageData = love.image.newImageData(size, size)
  local pad = size * 0.22
  local cx = size / 2
  local cy = size / 2
  local radius = size * 0.3
  local lineWidth = math.max(6, size * 0.12)
  local ax, ay = pad, size - pad
  local bx, by = size - pad, pad
  local abx, aby = bx - ax, by - ay
  local abLen2 = abx * abx + aby * aby

  imageData:mapPixel(function(x, y)
    local inside
    if shape == "rectangle" then
      inside = x >= pad and x <= size - pad and y >= pad and y <= size - pad
    elseif shape == "line" then
      local px, py = x - ax, y - ay
      local t = math.max(0, math.min(1, (px * abx + py * aby) / abLen2))
      local dx = x - (ax + abx * t)
      local dy = y - (ay + aby * t)
      inside = (dx * dx + dy * dy) <= (lineWidth * 0.5) * (lineWidth * 0.5)
    else
      local dx, dy = x - cx, y - cy
      inside = (dx * dx + dy * dy) <= radius * radius
    end
    if inside then
      return color[1], color[2], color[3], color[4]
    end
    return 0, 0, 0, 0
  end)

  local image = love.graphics.newImage(imageData)
  pcall(image.setFilter, image, "nearest", "nearest")
  return image
end

local function imageFromUpload(upload, fallbackName)
  if type(upload) ~= "table" then
    return nil, "Texture upload is missing"
  end
  local raw = decodeBase64(upload.dataBase64)
  if not raw then
    return nil, "Texture data is not valid base64"
  end
  local filename = tostring(upload.filename or fallbackName or "texture.png")
  local okData, fileData = pcall(love.filesystem.newFileData, raw, filename)
  if not okData or not fileData then
    return nil, "Could not create texture file data"
  end
  local okImage, image = pcall(love.graphics.newImage, fileData)
  if not okImage or not image then
    return nil, "Could not create image from uploaded texture"
  end
  pcall(image.setFilter, image, "nearest", "nearest")
  return image
end

local function makeFallbackTexture(size)
  size = size or 64
  local imageData = love.image.newImageData(size, size)
  for y = 0, size - 1 do
    for x = 0, size - 1 do
      local v = ((x * 37 + y * 17) % 255) / 255
      imageData:setPixel(x, y, v, 1 - v, ((x + y) % 255) / 255, 1)
    end
  end
  local image = love.graphics.newImage(imageData)
  pcall(image.setFilter, image, "nearest", "nearest")
  return image
end

local function sendTextureUniforms(shader, uniforms, uploads)
  local retained = {}
  local byUniform = {}
  if type(uploads) == "table" then
    for _, upload in ipairs(uploads) do
      if type(upload) == "table" and upload.uniform then
        byUniform[tostring(upload.uniform)] = upload
      end
    end
  end

  if type(uniforms) == "table" then
    for _, info in ipairs(uniforms) do
      local uniform = type(info) == "table" and tostring(info.uniform or "") or ""
      if uniform ~= "" then
        local image = nil
        local upload = byUniform[uniform]
        if upload then
          image = imageFromUpload(upload, tostring(upload.filename or uniform .. ".png"))
        end
        if not image then
          image = makeFallbackTexture(64)
        end
        local ok, err = pcall(shader.send, shader, uniform, image)
        if not ok then
          return nil, "Could not bind texture uniform `" .. uniform .. "`: " .. tostring(err)
        end
        retained[#retained + 1] = image
      end
    end
  end

  return retained
end

local function cloneShaderParameterValue(value, parameterType)
  if parameterType == "boolean" then
    return value and tonumber(value) ~= 0 and 1 or 0
  end
  if parameterType == "float" then
    return tonumber(value) or 0
  end
  if parameterType == "vec2" then
    value = type(value) == "table" and value or {}
    return { tonumber(value[1]) or 0, tonumber(value[2]) or 0 }
  end
  if parameterType == "vec3" then
    value = type(value) == "table" and value or {}
    return { tonumber(value[1]) or 0, tonumber(value[2]) or 0, tonumber(value[3]) or 0 }
  end
  if parameterType == "vec4" or parameterType == "color" then
    value = type(value) == "table" and value or {}
    return { tonumber(value[1]) or 0, tonumber(value[2]) or 0, tonumber(value[3]) or 0, tonumber(value[4]) or 1 }
  end
  return value
end

local function sendShaderParameters(shader, parameters)
  if type(parameters) ~= "table" then
    return true
  end
  for _, parameter in ipairs(parameters) do
    if type(parameter) == "table" then
      local uniform = tostring(parameter.uniform or "")
      local parameterType = tostring(parameter.type or "")
      if uniform ~= "" and parameterType ~= "texture" then
        local value = cloneShaderParameterValue(parameter.defaultValue, parameterType)
        pcall(shader.send, shader, uniform, value)
      end
    end
  end
  return true
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

  local color = previewColor(params.color)
  local drawable
  local baseTexture = params.baseTexture
  if type(baseTexture) == "table" and baseTexture.dataBase64 then
    local image, imageErr = imageFromUpload(baseTexture, "preview-texture.png")
    if not image then
      return { status = "error", pixelError = imageErr }
    end
    drawable = image
  else
    local okCanvas, canvasOrErr = pcall(makePreviewCanvas, shape, params.size, color)
    if not okCanvas then
      return { status = "error", pixelError = tostring(canvasOrErr) }
    end
    drawable = canvasOrErr
  end

  local textures, textureErr = sendTextureUniforms(shader, params.textureUniforms, params.textures)
  if not textures then
    return { status = "error", pixelError = textureErr }
  end
  local parametersOk, parameterErr = sendShaderParameters(shader, params.parameters)
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
      color = self.preview.color,
      baseTexture = self.preview.baseTexture,
      active = true,
    } or nil,
  }
end

return ShaderGraphPlugin
