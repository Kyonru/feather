local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".plugins.base")
local json = require(FEATHER_PATH .. ".lib.json")
local base64encode = require(FEATHER_PATH .. ".lib.base64").encode

local gettime
do
  local ok, socket = pcall(require, "socket")
  if ok and socket and socket.gettime then
    gettime = socket.gettime
  elseif love and love.timer then
    gettime = love.timer.getTime
  else
    gettime = os.clock
  end
end

---@class Bookmark
---@field id number      Unique auto-incrementing ID
---@field label string   User-provided label
---@field category string  Category/tag for color coding
---@field time number    Wall-clock timestamp (same scale as performance data)
---@field gameTime number  Game time (seconds since start via love.timer)
---@field screenshot string|nil  Base64 data URI of screenshot at bookmark time

---@class BookmarkPlugin: FeatherPlugin
---@field bookmarks Bookmark[]
---@field nextId number
---@field hotkey string        Key that adds a quick bookmark in-game
---@field defaultCategory string
---@field categories string[]  Available category names
---@field maxBookmarks number
---@field gameStartTime number
---@field _lastSentCount number
---@field categoryColors table<string, string>
---@field captureScreenshot boolean
local BookmarkPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.bookmarks = {}
    self.nextId = 1
    self.hotkey = self.options.hotkey or "f3"
    self.defaultCategory = self.options.defaultCategory or "general"
    self.categories = self.options.categories or { "general", "bug", "lag", "note", "important" }
    self.categoryColors = self.options.categoryColors
      or {
        general = "info",
        bug = "error",
        lag = "warning",
        note = "success",
        important = "accent",
      }
    self.maxBookmarks = self.options.maxBookmarks or 500
    self.captureScreenshot = self.options.captureScreenshot ~= false
    self.gameStartTime = 0
    self._lastSentCount = 0
  end,
})

--- Add a bookmark at the current moment.
---@param label string
---@param category? string
---@return Bookmark
function BookmarkPlugin:add(label, category)
  local bookmark = {
    id = self.nextId,
    label = label or "Bookmark #" .. self.nextId,
    category = category or self.defaultCategory,
    time = os.time(),
    gameTime = love and love.timer and love.timer.getTime() or gettime() - self.gameStartTime,
    screenshot = nil,
  }
  self.nextId = self.nextId + 1

  table.insert(self.bookmarks, bookmark)

  -- Capture screenshot if enabled and love.graphics is available
  if self.captureScreenshot and love and love.graphics and love.graphics.captureScreenshot then
    local bk = bookmark
    love.graphics.captureScreenshot(function(imageData)
      local ok, fileData = pcall(imageData.encode, imageData, "png")
      if ok and fileData then
        local pngBytes = fileData:getString()
        bk.screenshot = "data:image/png;base64," .. base64encode(pngBytes)
      end
    end)
  end

  -- Trim oldest if over limit
  while #self.bookmarks > self.maxBookmarks do
    table.remove(self.bookmarks, 1)
  end

  return bookmark
end

function BookmarkPlugin:init(config)
  self.options = config.options or {}
  self.logger = config.logger
  self.observer = config.observer
  self.bookmarks = {}
  self.nextId = 1
  self.hotkey = self.options.hotkey or "f3"
  self.defaultCategory = self.options.defaultCategory or "general"
  self.categories = self.options.categories or { "general", "bug", "lag", "note", "important" }
  self.categoryColors = self.options.categoryColors
    or {
      general = "info",
      bug = "error",
      lag = "warning",
      note = "success",
      important = "accent",
    }
  self.maxBookmarks = self.options.maxBookmarks or 500
  self.captureScreenshot = self.options.captureScreenshot ~= false
  self.gameStartTime = gettime()
  self._lastSentCount = 0

  -- Hook love.keypressed if hotkey is set
  if self.hotkey and love and love.keypressed then
    local origKeypressed = love.keypressed
    local plugin = self
    love.keypressed = function(key, scancode, isrepeat)
      if key == plugin.hotkey then
        plugin:add("Quick bookmark")
      end
      if origKeypressed then
        return origKeypressed(key, scancode, isrepeat)
      end
    end
  end
end

function BookmarkPlugin:update()
  -- Build the timeline data for the desktop
  local items = {}
  for _, b in ipairs(self.bookmarks) do
    items[#items + 1] = {
      id = b.id,
      label = b.label,
      category = b.category,
      color = self.categoryColors[b.category] or "info",
      time = b.time,
      gameTime = string.format("%.1f", b.gameTime),
      screenshot = b.screenshot,
    }
  end

  return {
    type = "timeline",
    items = items,
    categories = self.categories,
    loading = false,
  }
end

function BookmarkPlugin:handleRequest()
  return self:update()
end

--- Desktop actions: add bookmark with label/category, clear all, export
function BookmarkPlugin:handleActionRequest(request)
  local action = request.params and request.params.action

  if action == "add" then
    local label = request.params.label
    local category = request.params.category
    if not label or label == "" then
      label = "Bookmark #" .. self.nextId
    end
    local b = self:add(label, category ~= "" and category or nil)
    return { data = { id = b.id, label = b.label, category = b.category } }
  end

  if action == "clear" then
    self.bookmarks = {}
    self.nextId = 1
    self._lastSentCount = 0
    return { data = "Cleared all bookmarks" }
  end

  if action == "export" then
    -- Strip screenshots from exported data to keep file size small
    local exportData = {}
    for _, b in ipairs(self.bookmarks) do
      exportData[#exportData + 1] = {
        id = b.id,
        label = b.label,
        category = b.category,
        time = b.time,
        gameTime = b.gameTime,
        screenshot = b.screenshot,
      }
    end
    local filename = "bookmarks_" .. os.time() .. ".json"
    local content = json.encode(exportData)
    return {
      data = "Export ready",
      download = { filename = filename, content = content, extension = "json" },
    }
  end

  if action == "import" then
    -- Desktop sends file contents via fileContent param (file picker)
    local contents = request.params.fileContent
    if not contents or contents == "" then
      return nil, "No file content received"
    end
    local ok, imported = pcall(json.decode, contents)
    if not ok or type(imported) ~= "table" then
      return nil, "Invalid bookmark file"
    end
    -- Merge imported bookmarks, reassigning IDs
    local count = 0
    for _, b in ipairs(imported) do
      if type(b) == "table" and b.label then
        b.id = self.nextId
        self.nextId = self.nextId + 1
        table.insert(self.bookmarks, b)
        count = count + 1
      end
    end
    -- Trim if over limit
    while #self.bookmarks > self.maxBookmarks do
      table.remove(self.bookmarks, 1)
    end
    return { data = "Imported " .. count .. " bookmarks" }
  end

  return nil, "Unknown action: " .. tostring(action)
end

function BookmarkPlugin:handleParamsUpdate(request)
  if request.params and request.params.category then
    self.defaultCategory = request.params.category
  end
  if request.params and request.params.screenshot ~= nil then
    self.captureScreenshot = request.params.screenshot == "true" or request.params.screenshot == true
  end
end

function BookmarkPlugin:getConfig()
  return {
    type = "bookmark",
    icon = "bookmark",
    tabName = "Bookmarks",
    docs = "https://github.com/Kyonru/feather/tree/main/src-lua/plugins/bookmark",
    actions = {
      {
        label = "Label",
        key = "label",
        icon = "text",
        type = "input",
        value = "",
        props = { placeholder = "Bug here, feels laggy..." },
      },
      {
        label = "Category",
        key = "category",
        icon = "tag",
        type = "select",
        value = self.defaultCategory,
        props = { options = self.categories },
      },
      {
        label = "Add Bookmark",
        key = "add",
        icon = "bookmark-plus",
        type = "button",
      },
      {
        label = "Screenshot",
        key = "screenshot",
        icon = "camera",
        type = "checkbox",
        value = self.captureScreenshot and "true" or "false",
      },
      {
        label = "Clear All",
        key = "clear",
        icon = "trash-2",
        type = "button",
      },
      {
        label = "Export",
        key = "export",
        icon = "download",
        type = "button",
      },
      {
        label = "Import",
        key = "import",
        icon = "upload",
        type = "file",
        props = { filters = { { name = "JSON", extensions = { "json" } } } },
      },
    },
  }
end

return BookmarkPlugin
