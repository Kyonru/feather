local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".plugins.base")
local base64encode = require(FEATHER_PATH .. ".lib.base64").encode

---@class ScreenshotPlugin: FeatherPlugin
---@field type string
---@field screenshotDirectory string
---@field fps number
---@field gifDuration number
---@field isRecordingGif boolean
---@field frameTime number
---@field persist boolean
---@field lastFrameCaptured number
---@field tempScreenshots string[]
---@field screenshots string[]
---@field images table[]
---@field gifTime number
---@field width number
---@field height number
local ScreenshotPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.type = "screenshots"
    self.screenshotDirectory = config.options.screenshotDirectory or "screenshots"
    self.logger = config.logger
    self.observer = config.observer

    self.fps = config.options.fps or 30
    self.frameTime = 1 / self.fps
    self.gifDuration = config.options.gifDuration or 5 -- seconds

    self.isRecordingGif = false
    self.lastFrameCaptured = 0
    self.currentGif = nil
    self.tempScreenshots = {}
    self.images = {}
    self.gifTime = 0
    self.screenshots = {}
    self.persist = true

    self.width = love.graphics.getWidth()
    self.height = love.graphics.getHeight()
    self._pendingCapture = false
    self._lastSentIndex = 0

    love.filesystem.createDirectory(self.screenshotDirectory)
  end,
})

--- Called each frame
function ScreenshotPlugin:update(dt, feather)
  Base.update(self, dt, feather)

  -- Batch-encode GIF frames after recording stops (N frames per update to stay smooth)
  if self._encodingFrames then
    local BATCH = 3
    for _ = 1, BATCH do
      local idx = self._encodeIndex
      if idx > #self._encodingFrames then
        -- All frames encoded — add completed GIF to images
        local frameCount = #self._encodedFrames
        table.insert(self.images, {
          name = self._encodingGifName,
          data = self._encodedFrames,
          type = "gif",
          fps = self.fps,
        })
        self._encodingFrames = nil
        self._encodedFrames = nil
        self._encodeIndex = nil
        self._encodingGifName = nil
        if self.logger then
          self.logger:logger(string.format("[ScreenshotPlugin] GIF ready, %d frames encoded", frameCount))
        end
        break
      end

      local path = self._encodingFrames[idx]
      local contents = love.filesystem.read(path)
      if contents then
        self._encodedFrames[idx] = "data:image/png;base64," .. base64encode(contents)
      end
      -- Free file now that it's encoded
      love.filesystem.remove(path)
      self._encodeIndex = idx + 1
    end
    return -- skip recording logic while encoding
  end

  if self.isRecordingGif then
    self.lastFrameCaptured = self.lastFrameCaptured + dt
    self.gifTime = self.gifTime + dt

    if self.lastFrameCaptured >= self.frameTime then
      self.lastFrameCaptured = 0
      self:captureFrame()
    end

    -- Auto stop after gifDuration
    if self.gifTime >= self.gifDuration then
      self:stopGifRecording()
    end
  end
end

--- Capture a single screenshot
function ScreenshotPlugin:captureScreenshot()
  local timestamp = os.date("%Y%m%d-%H%M%S")
  local filename = string.format("screenshot-%s.png", timestamp)

  self._pendingCapture = true
  local selfRef = self
  love.graphics.captureScreenshot(function(imageData)
    local fileData = imageData:encode("png")
    local pngBytes = fileData:getString()
    local dataUri = "data:image/png;base64," .. base64encode(pngBytes)

    table.insert(selfRef.images, {
      type = "png",
      name = filename,
      data = dataUri,
      fps = 1,
    })

    selfRef._pendingCapture = false
    if selfRef.logger then
      selfRef.logger:logger("[ScreenshotPlugin] Captured screenshot: " .. filename)
    end
  end)

  return filename
end

--- Capture one frame for GIF — uses fast file-based path (C-side I/O, no Lua encoding)
function ScreenshotPlugin:captureFrame()
  local idx = #self.tempScreenshots + 1
  local path = self.screenshotDirectory .. "/" .. self.currentGif .. "/" .. tostring(idx) .. ".png"
  love.graphics.captureScreenshot(path)
  table.insert(self.tempScreenshots, path)
end

--- Start recording GIF
function ScreenshotPlugin:startGifRecording()
  if self.isRecordingGif then
    return
  end
  self.currentGif = tostring(os.time())
  love.filesystem.createDirectory(self.screenshotDirectory .. "/" .. self.currentGif)
  self.isRecordingGif = true
  self.tempScreenshots = {}
  self.gifTime = 0
  self.lastFrameCaptured = 0

  if self.logger then
    self.logger:logger(string.format("[ScreenshotPlugin] Started GIF recording (max %ds)", self.gifDuration))
  end
end

--- Stop recording GIF — kicks off gradual base64 encoding across subsequent update() calls
function ScreenshotPlugin:stopGifRecording()
  if not self.isRecordingGif then
    return
  end
  self.isRecordingGif = false

  local frameCount = #self.tempScreenshots
  local gifName = self.screenshotDirectory .. "/" .. self.currentGif .. ".gif"

  -- Start batch encoding: update() will process N frames per tick
  self._encodingFrames = self.tempScreenshots -- file paths
  self._encodedFrames = {} -- will hold base64 data URIs
  self._encodeIndex = 1
  self._encodingGifName = gifName

  self.tempScreenshots = {}
  self.currentGif = nil

  if self.logger then
    self.logger:logger(string.format("[ScreenshotPlugin] Stopped GIF recording, encoding %d frames...", frameCount))
  end

  return gifName
end

function ScreenshotPlugin:getResponseBody()
  local items = {}

  -- Only return images that haven't been sent yet to avoid
  -- re-sending massive GIF payloads every push cycle
  for i = self._lastSentIndex + 1, #self.images do
    local item = self.images[i]
    table.insert(items, {
      type = "image",
      metadata = {
        type = item.type,
        src = item.data,
        width = self.width,
        height = self.height,
        fps = item.fps,
      },
      downloadable = true,
      name = item.name,
    })
  end

  self._lastSentIndex = #self.images

  return items
end

function ScreenshotPlugin:handleRequest()
  return {
    type = "gallery",
    data = self:getResponseBody(),
    loading = self.isRecordingGif or (self._encodingFrames ~= nil),
    persist = self.persist,
  }
end

function ScreenshotPlugin:handleActionRequest(request)
  local params = request.params or {}

  if params.action == "gif" then
    self.gifDuration = tonumber(params.duration) or self.gifDuration
    self.fps = tonumber(params.fps) or self.fps
    self.frameTime = 1 / self.fps
    return self:startGifRecording()
  end

  if params.action == "screenshot" then
    return self:captureScreenshot()
  end
end

function ScreenshotPlugin:handleActionCancel()
  if self.isRecordingGif then
    self.isRecordingGif = false
    -- Clean up temp frame files
    for _, path in ipairs(self.tempScreenshots) do
      love.filesystem.remove(path)
    end
    self.tempScreenshots = {}
    self.currentGif = nil
    if self.logger then
      self.logger:logger("[ScreenshotPlugin] GIF recording cancelled")
    end
  end
  -- Also cancel any in-progress encoding
  if self._encodingFrames then
    for i = self._encodeIndex, #self._encodingFrames do
      love.filesystem.remove(self._encodingFrames[i])
    end
    self._encodingFrames = nil
    self._encodedFrames = nil
    self._encodeIndex = nil
    self._encodingGifName = nil
  end
end

function ScreenshotPlugin:handleParamsUpdate(request)
  local params = request.params or {}

  if params.persist then
    self.persist = params.persist == "true"
  end

  if params.fps then
    self.fps = tonumber(params.fps) or self.fps
    self.frameTime = 1 / self.fps
  end

  if params.duration then
    self.gifDuration = tonumber(params.duration) or self.gifDuration
  end
end

function ScreenshotPlugin:getConfig()
  return {
    type = self.type,
    color = "#003366",
    icon = "camera",
    tabName = "Screenshots",
    actions = {
      {
        label = "Capture GIF",
        key = "gif",
        icon = "film",
        type = "button",
      },
      {
        label = "Capture Screenshot",
        key = "screenshot",
        icon = "camera",
        type = "button",
      },
      {
        label = "Duration",
        key = "duration",
        icon = "clock",
        type = "input",
        props = {
          type = "number",
          min = 1,
          max = 60,
        },
        value = self.gifDuration,
      },
      {
        label = "FPS",
        key = "fps",
        icon = "gauge",
        type = "input",
        props = {
          type = "number",
          min = 5,
          max = 60,
        },
        value = self.fps,
      },
      {
        label = "Persist",
        key = "persist",
        icon = "save",
        type = "checkbox",
        value = self.persist,
      },
    },
  }
end

return ScreenshotPlugin
