local FeatherPlugin = require("feather.plugins.base")
local Class = require("feather.lib.class")
local Base = require("feather.plugins.base")

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
    self.tempScreenshots = {}
    self.images = {}
    self.gifTime = 0
    self.screenshots = {}
    self.persist = true

    self.width = love.graphics.getWidth()
    self.height = love.graphics.getHeight()

    love.filesystem.createDirectory(self.screenshotDirectory)
  end,
})

--- Called each frame
function ScreenshotPlugin:update(dt, feather)
  FeatherPlugin.update(self, dt, feather)

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
  local filename = string.format("%s/screenshot-%s.png", self.screenshotDirectory, timestamp)

  love.graphics.captureScreenshot(function(img)
    local fileData = img:encode("png")
    local pngBytes = fileData:getString()

    local b64 = love.data.encode("string", "base64", pngBytes)

    table.insert(self.images, {
      type = "png",
      data = b64,
      name = filename,
      fps = 1,
    })
    if self.logger then
      self.logger.logger("[ScreenshotPlugin] Saved screenshot: " .. filename)
    end
  end)

  return filename
end

--- Capture one frame for GIF
function ScreenshotPlugin:captureFrame()
  love.graphics.captureScreenshot(function(img)
    local fileData = img:encode("png")

    local pngBytes = fileData:getString()

    local b64 = love.data.encode("string", "base64", pngBytes)
    table.insert(self.tempScreenshots, b64)
  end)
end

--- Start recording GIF
function ScreenshotPlugin:startGifRecording()
  if self.isRecordingGif then
    return
  end
  self.isRecordingGif = true
  self.tempScreenshots = {}
  self.gifTime = 0
  self.lastFrameCaptured = 0

  if self.logger then
    self.logger.logger(string.format("[ScreenshotPlugin] Started GIF recording (max %ds)", self.gifDuration))
  end
end

--- Stop recording GIF and export
function ScreenshotPlugin:stopGifRecording()
  if not self.isRecordingGif then
    return
  end
  self.isRecordingGif = false

  local gifName = string.format("%s/recording-%s.gif", self.screenshotDirectory, os.date("%Y%m%d-%H%M%S"))

  table.insert(self.images, {
    name = gifName,
    data = self.tempScreenshots,
    type = "gif",
    fps = self.fps,
  })

  self.tempScreenshots = {}

  if self.logger then
    self.logger.logger(
      string.format("[ScreenshotPlugin] Stopped GIF recording, %d frames saved", #self.tempScreenshots)
    )
    self.logger.logger("[ScreenshotPlugin] Run ffmpeg/gifski to encode: " .. gifName)
  end

  return gifName
end

function ScreenshotPlugin:getResponseBody()
  local items = {}

  for _, item in ipairs(self.images) do
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

  return items
end

function ScreenshotPlugin:handleRequest()
  return {
    type = "gallery",
    data = self:getResponseBody(),
    loading = self.isRecordingGif,
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
