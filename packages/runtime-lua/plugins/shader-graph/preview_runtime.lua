local PreviewRuntime = {}

local DEFAULT_PREVIEW_SIZE = 128
local PREVIEW_SHAPES = {
  circle = true,
  line = true,
  rectangle = true,
}

local B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local B64_LOOKUP = {}
for i = 1, #B64_CHARS do
  B64_LOOKUP[B64_CHARS:sub(i, i)] = i - 1
end

local featherBase64 = nil
if type(rawget(_G, "FEATHER_PATH")) == "string" then
  local ok, mod = pcall(require, FEATHER_PATH .. ".lib.base64")
  if ok then
    featherBase64 = mod
  end
end

function PreviewRuntime.decodeBase64(data)
  data = tostring(data or ""):gsub("%s+", "")
  if data == "" then
    return nil
  end

  if featherBase64 and type(featherBase64.decode) == "function" then
    local ok, decoded = pcall(featherBase64.decode, data)
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

function PreviewRuntime.previewColor(value)
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

function PreviewRuntime.colorFromHex(hex)
  hex = tostring(hex or ""):gsub("^#", "")
  if #hex >= 6 then
    return {
      (tonumber(hex:sub(1, 2), 16) or 255) / 255,
      (tonumber(hex:sub(3, 4), 16) or 255) / 255,
      (tonumber(hex:sub(5, 6), 16) or 255) / 255,
      1,
    }
  end
  return { 1, 1, 1, 1 }
end

function PreviewRuntime.normalizeShape(shape)
  shape = tostring(shape or "circle")
  if not PREVIEW_SHAPES[shape] then
    return "circle"
  end
  return shape
end

local function shaderUsesDerivatives(source)
  source = tostring(source or "")
  return source:find("dFdx%s*%(") ~= nil or source:find("dFdy%s*%(") ~= nil or source:find("fwidth%s*%(") ~= nil
end

local function isWebRuntime()
  if not love or not love.system or type(love.system.getOS) ~= "function" then
    return false
  end
  local ok, osName = pcall(love.system.getOS)
  return ok and tostring(osName or ""):lower() == "web"
end

function PreviewRuntime.prepareShaderSource(source)
  source = tostring(source or "")
  if isWebRuntime() and shaderUsesDerivatives(source) and not source:find("GL_OES_standard_derivatives", 1, true) then
    return "#extension GL_OES_standard_derivatives : enable\n" .. source
  end
  return source
end

function PreviewRuntime.buildShader(pixelSource, vertexSource, allowPixelFallback)
  pixelSource = PreviewRuntime.prepareShaderSource(pixelSource)
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
    if combinedOk then
      return combinedShaderOrErr
    end
    if allowPixelFallback then
      return pixelShaderOrErr, nil, tostring(combinedShaderOrErr)
    end
    return nil, nil, tostring(combinedShaderOrErr)
  end

  return pixelShaderOrErr
end

function PreviewRuntime.makePreviewImage(shape, size, color)
  size = tonumber(size) or DEFAULT_PREVIEW_SIZE
  if size < 32 then
    size = 32
  elseif size > 512 then
    size = 512
  end
  color = PreviewRuntime.previewColor(color)
  shape = PreviewRuntime.normalizeShape(shape)

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

function PreviewRuntime.imageFromUpload(upload, fallbackName)
  if type(upload) ~= "table" then
    return nil, "Texture upload is missing"
  end
  local filename = tostring(upload.filename or fallbackName or "texture.png")
  local dataBase64 = tostring(upload.dataBase64 or "")
  if dataBase64 == "" then
    return nil, "Texture data is not valid base64"
  end

  if love.data and type(love.data.decode) == "function" then
    local okDecoded, decoded = pcall(love.data.decode, "data", "base64", dataBase64)
    if okDecoded and decoded then
      local okImage, image = pcall(love.graphics.newImage, decoded)
      if okImage and image then
        pcall(image.setFilter, image, "nearest", "nearest")
        return image
      end
      if love.image and type(love.image.newImageData) == "function" then
        local okImageData, imageData = pcall(love.image.newImageData, decoded)
        if okImageData and imageData then
          local okFromData, imageFromData = pcall(love.graphics.newImage, imageData)
          if okFromData and imageFromData then
            pcall(imageFromData.setFilter, imageFromData, "nearest", "nearest")
            return imageFromData
          end
        end
      end
    end
  end

  local raw = PreviewRuntime.decodeBase64(dataBase64)
  if not raw or raw == "" then
    return nil, "Texture data is not valid base64"
  end
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

function PreviewRuntime.makeFallbackTexture(size)
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

function PreviewRuntime.sendTextureUniforms(shader, uniforms, uploads, options)
  options = options or {}
  local retained = {}
  local byUniform = {}
  if type(uploads) == "table" then
    for _, upload in ipairs(uploads) do
      if type(upload) == "table" and upload.uniform then
        byUniform[tostring(upload.uniform)] = upload
      end
    end
  end

  local entries = type(uniforms) == "table" and uniforms or {}
  if #entries == 0 and options.allowUploadListOnly and type(uploads) == "table" then
    entries = uploads
  end

  for _, info in ipairs(entries) do
    local uniform = type(info) == "table" and tostring(info.uniform or "") or ""
    if uniform ~= "" then
      local image = nil
      local imageErr = nil
      local upload = byUniform[uniform]
      if upload then
        image, imageErr = PreviewRuntime.imageFromUpload(upload, tostring(upload.filename or uniform .. ".png"))
      end
      if not image and upload and options.fallbackMissing == false and not options.ignoreErrors then
        return nil, "Could not load texture uniform `" .. uniform .. "`: " .. tostring(imageErr or "missing texture data")
      end
      if not image and options.fallbackMissing ~= false then
        image = PreviewRuntime.makeFallbackTexture(64)
      end
      if image and shader then
        local ok, err = pcall(shader.send, shader, uniform, image)
        if not ok and not options.ignoreErrors then
          return nil, "Could not bind texture uniform `" .. uniform .. "`: " .. tostring(err)
        end
        retained[#retained + 1] = image
      end
    end
  end

  return retained
end

function PreviewRuntime.cloneShaderParameterValue(value, parameterType)
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

function PreviewRuntime.sendShaderParameters(shader, parameters, options)
  options = options or {}
  if not shader then
    return true
  end
  if type(parameters) ~= "table" then
    return true
  end
  for _, parameter in ipairs(parameters) do
    if type(parameter) == "table" then
      local uniform = tostring(parameter.uniform or "")
      local parameterType = tostring(parameter.type or "")
      if uniform ~= "" and parameterType ~= "texture" then
        local value = PreviewRuntime.cloneShaderParameterValue(parameter.defaultValue, parameterType)
        local ok, err = pcall(shader.send, shader, uniform, value)
        if not ok and not options.ignoreErrors then
          return nil, "Could not bind parameter `" .. uniform .. "`: " .. tostring(err)
        end
      end
    end
  end
  return true
end

function PreviewRuntime.compileShader(params)
  local pixelSource = PreviewRuntime.prepareShaderSource(params.pixelSource)
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

return PreviewRuntime
