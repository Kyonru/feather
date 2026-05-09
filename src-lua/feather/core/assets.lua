local Class = require(FEATHER_PATH .. ".lib.class")

---@class FeatherAssets
---@field textures table[]
---@field fonts table[]
---@field audio table[]
local FeatherAssets = Class({})

function FeatherAssets:init(logger)
  self.logger = logger
  self.textures = {}
  self.fonts = {}
  self.audio = {}
  self._nextId = 1
  self._nextBinaryId = 1
  self._hooks = {}
  self._drawWrapper = nil
  self._wrappedDrawTarget = nil
  self._pendingPreview = nil
  self._previewReady = nil

  self:_hookLove()
end

function FeatherAssets:_nextPreviewBinaryId()
  local id = "asset-preview-" .. tostring(self._nextBinaryId)
  self._nextBinaryId = self._nextBinaryId + 1
  return id
end

function FeatherAssets:_nextAssetId()
  local id = self._nextId
  self._nextId = self._nextId + 1
  return id
end

local function basename(path)
  return path:match("[^/\\]+$") or path
end

function FeatherAssets:_hookLove()
  local assets = self

  if love.graphics and love.graphics.newImage then
    local origNewImage = love.graphics.newImage
    self._hooks.newImage = origNewImage
    ---@diagnostic disable-next-line: duplicate-set-field
    love.graphics.newImage = function(source, ...)
      local img = origNewImage(source, ...)
      if img then
        local isFile = type(source) == "string"
        local w, h = img:getDimensions()
        assets.textures[#assets.textures + 1] = {
          id = assets:_nextAssetId(),
          name = isFile and source or tostring(source),
          path = isFile and source or nil,
          obj = img,
          width = w,
          height = h,
          format = img:getFormat() or "rgba8",
          mipmaps = img:getMipmapCount() or 1,
        }
      end
      return img
    end
  end

  if love.graphics and love.graphics.newFont then
    local origNewFont = love.graphics.newFont
    self._hooks.newFont = origNewFont
    love.graphics.newFont = function(...)
      local font = origNewFont(...)
      if font then
        local first = (...)
        local isFile = type(first) == "string"
        assets.fonts[#assets.fonts + 1] = {
          id = assets:_nextAssetId(),
          name = isFile and first or ("font@" .. font:getHeight() .. "px"),
          path = isFile and first or nil,
          obj = font,
          height = font:getHeight(),
          ascent = font:getAscent(),
          descent = font:getDescent(),
        }
      end
      return font
    end
  end

  if love.audio and love.audio.newSource then
    local origNewSource = love.audio.newSource
    self._hooks.newSource = origNewSource
    love.audio.newSource = function(source, ...)
      local src = origNewSource(source, ...)
      if src then
        assets.audio[#assets.audio + 1] = {
          id = assets:_nextAssetId(),
          name = type(source) == "string" and source or tostring(source),
          path = type(source) == "string" and source or nil,
          srcType = tostring(src:getType() or "static"),
          channels = src:getChannelCount() or 1,
          duration = src:getDuration() or 0,
        }
      end
      return src
    end
  end

  self:_hookDraw()
end

function FeatherAssets:finish()
  if self._hooks.newImage then
    love.graphics.newImage = self._hooks.newImage
  end
  if self._hooks.newFont then
    love.graphics.newFont = self._hooks.newFont
  end
  if self._hooks.newSource and love.audio then
    love.audio.newSource = self._hooks.newSource
  end
  if self._hooks.draw ~= nil then
    love.draw = self._hooks.draw or nil
  end
  self._hooks = {}
end

function FeatherAssets:_hookDraw()
  if not love then
    return
  end
  if love.draw == self._drawWrapper then
    return
  end

  local currentDraw = love.draw
  if self._hooks.draw == nil then
    self._hooks.draw = currentDraw or false
  end
  self._wrappedDrawTarget = currentDraw
  local wrappedDrawTarget = currentDraw
  self._drawWrapper = function(...)
    if wrappedDrawTarget then
      wrappedDrawTarget(...)
    end
    self:onDraw()
  end
  love.draw = self._drawWrapper
end

function FeatherAssets:update()
  self:_hookDraw()
end

function FeatherAssets:hasPreview()
  return self._previewReady ~= nil
end

function FeatherAssets:onDraw()
  if not self._pendingPreview then
    return
  end
  local pending = self._pendingPreview
  self._pendingPreview = nil

  local ok, err = pcall(function()
    if pending.kind == "texture" then
      local obj = pending.obj
      if not obj then
        return
      end

      local w, h = obj:getDimensions()
      local scale = math.min(1, 512 / math.max(w, h, 1))
      local cw = math.max(1, math.ceil(w * scale))
      local ch = math.max(1, math.ceil(h * scale))

      local canvas = love.graphics.newCanvas(cw, ch)
      love.graphics.push("all")
      love.graphics.setCanvas(canvas)
      love.graphics.clear(0, 0, 0, 0)
      love.graphics.setColor(1, 1, 1, 1)
      love.graphics.draw(obj, 0, 0, 0, scale, scale)
      love.graphics.pop()

      local binaryId = self:_nextPreviewBinaryId()
      local pngBytes = canvas:newImageData():encode("png"):getString()
      self._previewReady = {
        id = pending.id,
        name = pending.name,
        type = "png",
        src = "feather-binary:" .. binaryId,
        binary = { id = binaryId, mime = "image/png" },
        _binaryData = pngBytes,
        width = cw,
        height = ch,
      }
    elseif pending.kind == "font" then
      local obj = pending.obj
      if not obj then
        return
      end

      local sample = "Aa Bb Cc 123 !?"
      local tw = math.max(obj:getWidth(sample) + 16, 160)
      local th = obj:getHeight() + 16

      local canvas = love.graphics.newCanvas(tw, th)
      love.graphics.push("all")
      love.graphics.setCanvas(canvas)
      love.graphics.clear(0.08, 0.08, 0.08, 1)
      love.graphics.setFont(obj)
      love.graphics.setColor(1, 1, 1, 1)
      love.graphics.print(sample, 8, 8)
      love.graphics.pop()

      local binaryId = self:_nextPreviewBinaryId()
      local pngBytes = canvas:newImageData():encode("png"):getString()
      self._previewReady = {
        id = pending.id,
        name = pending.name,
        type = "png",
        src = "feather-binary:" .. binaryId,
        binary = { id = binaryId, mime = "image/png" },
        _binaryData = pngBytes,
        width = tw,
        height = th,
      }
    end
  end)

  if not ok and self.logger then
    self.logger:log({ type = "error", str = "[Assets] preview failed: " .. tostring(err) })
  end
end

function FeatherAssets:preview(kind, id)
  id = tonumber(id)
  if not id then
    return nil, "Missing asset id"
  end

  if kind == "texture" then
    for _, asset in ipairs(self.textures) do
      if asset.id == id then
        if asset.path then
          self._previewReady = {
            id = asset.id,
            name = basename(asset.name),
            type = "png",
            src = asset.path,
            width = asset.width,
            height = asset.height,
          }
        else
          self._pendingPreview = { kind = "texture", id = asset.id, name = basename(asset.name), obj = asset.obj }
        end
        return true
      end
    end
    return nil, "Texture not found"
  end

  if kind == "font" then
    for _, asset in ipairs(self.fonts) do
      if asset.id == id then
        self._pendingPreview = { kind = "font", id = asset.id, name = basename(asset.name), obj = asset.obj }
        return true
      end
    end
    return nil, "Font not found"
  end

  return nil, "Preview is only available for textures and fonts"
end

local function publicAsset(asset)
  local out = {}
  for key, value in pairs(asset) do
    if key ~= "obj" then
      out[key] = value
    end
  end
  out.displayName = basename(asset.name)
  return out
end

function FeatherAssets:getResponseBody()
  local textures, fonts, audio = {}, {}, {}
  for _, asset in ipairs(self.textures) do
    textures[#textures + 1] = publicAsset(asset)
  end
  for _, asset in ipairs(self.fonts) do
    fonts[#fonts + 1] = publicAsset(asset)
  end
  for _, asset in ipairs(self.audio) do
    audio[#audio + 1] = publicAsset(asset)
  end

  local preview = self._previewReady
  self._previewReady = nil

  return {
    enabled = false,
    textures = textures,
    fonts = fonts,
    audio = audio,
    preview = preview,
  }
end

return FeatherAssets
