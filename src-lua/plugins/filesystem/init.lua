local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")

--- Filesystem Plugin — browse and inspect files the game has written via love.filesystem.
--- Lets you navigate directories, preview text file contents, and delete files from the desktop.
--- Useful for inspecting save data, configs, log files, and other game-generated files.

-- Mount point used to isolate the save directory from the merged love.filesystem root.
-- This keeps source files (visible during development) out of the browser.
local SAVE_MOUNT = "__feather_savedir__"

---@class FilesystemPlugin: FeatherPlugin
---@field currentPath string  Current directory relative to the save-directory mount
---@field selectedItem string  File or directory name to operate on
local FilesystemPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.currentPath = ""
    self.selectedItem = ""

    -- Mount the save directory at a stable internal path so we browse only
    -- files the game has actually written, not the merged source tree.
    -- mount returns false if already mounted, which is fine — not an error.
    local saveDir = love.filesystem.getSaveDirectory()
    if saveDir then
      love.filesystem.mount(saveDir, SAVE_MOUNT, false)
    end
  end,
})

--- Format bytes as a human-readable string.
local function formatSize(bytes)
  if not bytes or bytes == 0 then
    return "—"
  end
  if bytes < 1024 then
    return bytes .. " B"
  end
  if bytes < 1048576 then
    return string.format("%.1f KB", bytes / 1024)
  end
  return string.format("%.1f MB", bytes / 1048576)
end

--- Format a Unix timestamp for display.
local function formatTime(t)
  if not t or t == 0 then
    return "—"
  end
  return os.date("%Y-%m-%d %H:%M", t)
end

--- Join a base path and a child name, handling the empty-root case.
local function joinPath(base, name)
  if base == "" then
    return name
  end
  return base .. "/" .. name
end

--- Return the parent of a path, or "" for root.
local function parentPath(path)
  if path == "" then
    return ""
  end
  return path:match("^(.+)/[^/]+$") or ""
end

--- Strip leading/trailing slashes from a path string.
local function cleanPath(path)
  return (path or ""):gsub("^/+", ""):gsub("/+$", "")
end

--- Convert a user-visible relative path to the love.filesystem path under the mount.
local function mountedPath(relativePath)
  if relativePath == "" then
    return SAVE_MOUNT
  end
  return SAVE_MOUNT .. "/" .. relativePath
end

--- Read and sort the entries in a directory.
---@param fsPath string  Full love.filesystem path (already mount-prefixed)
---@return table|nil, string|nil
function FilesystemPlugin:_readDirectory(fsPath)
  local ok, items = pcall(love.filesystem.getDirectoryItems, fsPath)
  if not ok or not items then
    return nil, "Cannot read directory: " .. tostring(fsPath)
  end

  local entries = {}
  for _, name in ipairs(items) do
    local childFsPath = joinPath(fsPath, name)
    local info = love.filesystem.getInfo(childFsPath)
    if info then
      entries[#entries + 1] = {
        name = name,
        type = info.type,
        size = info.size or 0,
        modtime = info.modtime or 0,
      }
    end
  end

  -- Directories first, then files; each group sorted alphabetically.
  table.sort(entries, function(a, b)
    if a.type ~= b.type then
      return a.type == "directory"
    end
    return a.name:lower() < b.name:lower()
  end)

  return entries
end

--- Push the directory listing as a table.
function FilesystemPlugin:handleRequest(_request, _feather)
  local entries, err = self:_readDirectory(mountedPath(self.currentPath))

  if not entries then
    return {
      type = "table",
      loading = false,
      columns = {
        { key = "name", label = "Name" },
        { key = "info", label = "" },
      },
      data = { { name = "Error", info = tostring(err) } },
    }
  end

  local rows = {}
  for _, e in ipairs(entries) do
    rows[#rows + 1] = {
      name = (e.type == "directory" and "📁 " or "📄 ") .. e.name,
      type = e.type == "directory" and "Dir" or "File",
      size = e.type == "file" and formatSize(e.size) or "—",
      modified = formatTime(e.modtime),
    }
  end

  if #rows == 0 then
    rows[#rows + 1] = { name = "(empty)", type = "", size = "", modified = "" }
  end

  return {
    type = "table",
    loading = false,
    columns = {
      { key = "name", label = "Name" },
      { key = "type", label = "Type" },
      { key = "size", label = "Size" },
      { key = "modified", label = "Modified" },
    },
    data = rows,
  }
end

--- Sync path and selected item from desktop params.
function FilesystemPlugin:handleParamsUpdate(request, _feather)
  local params = request.params or {}
  if params.currentPath ~= nil then
    self.currentPath = cleanPath(tostring(params.currentPath))
  end
  if params.selectedItem ~= nil then
    self.selectedItem = tostring(params.selectedItem)
  end
end

--- Handle navigation and file operations.
function FilesystemPlugin:handleActionRequest(request, _feather)
  local action = request.params and request.params.action
  local params = request.params or {}

  -- Navigate to parent directory.
  if action == "up" then
    self.currentPath = parentPath(self.currentPath)
    self.selectedItem = ""
    return true

  -- Navigate to an arbitrary path typed in the Path input.
  elseif action == "navigate" then
    local target = cleanPath(params.currentPath or self.currentPath)
    if target == "" then
      self.currentPath = ""
      self.selectedItem = ""
      return true
    end
    local info = love.filesystem.getInfo(mountedPath(target))
    if info and info.type == "directory" then
      self.currentPath = target
      self.selectedItem = ""
      return true
    end
    return nil, "Not a valid directory: " .. target

  -- Open an item: navigate into directories, or read files to the clipboard.
  elseif action == "open" then
    local name = params.selectedItem or self.selectedItem
    if not name or name == "" then
      return nil, "No item specified"
    end
    local relPath = joinPath(self.currentPath, name)
    local fsPath = mountedPath(relPath)
    local info = love.filesystem.getInfo(fsPath)
    if not info then
      return nil, "Not found: " .. relPath
    end

    if info.type == "directory" then
      self.currentPath = relPath
      self.selectedItem = ""
      return true
    end

    -- Read file content, cap preview at 50 KB.
    local ok, content = pcall(love.filesystem.read, fsPath)
    if not ok or content == nil then
      return nil, "Cannot read: " .. relPath
    end
    local MAX = 50000
    if #content > MAX then
      return {
        clipboard = content:sub(1, MAX)
          .. "\n\n-- [truncated — showing first "
          .. formatSize(MAX)
          .. " of "
          .. formatSize(#content)
          .. " total]",
      }
    end
    return { clipboard = content }

  -- Delete a file or empty directory.
  elseif action == "delete" then
    local name = params.selectedItem or self.selectedItem
    if not name or name == "" then
      return nil, "No item specified"
    end
    local relPath = joinPath(self.currentPath, name)
    local ok, err = love.filesystem.remove(mountedPath(relPath))
    if not ok then
      return nil, "Cannot delete '" .. relPath .. "': " .. tostring(err)
    end
    if self.selectedItem == name then
      self.selectedItem = ""
    end
    return true
  elseif action == "refresh" then
    return true
  end

  return nil, "Unknown action: " .. tostring(action)
end

--- Build the desktop UI config.
function FilesystemPlugin:getConfig()
  local saveDir = ""
  local ok, sd = pcall(love.filesystem.getSaveDirectory)
  if ok and sd then
    saveDir = sd
  end

  return {
    type = "filesystem",
    icon = "folder",
    tabName = "Filesystem",
    docs = "https://github.com/Kyonru/feather/tree/main/src-lua/plugins/filesystem",
    actions = {
      -- Navigation bar
      { label = "Up", key = "up", icon = "folder-up", type = "button" },
      { label = "Refresh", key = "refresh", icon = "refresh-cw", type = "button" },
      {
        label = "Path",
        key = "currentPath",
        icon = "folder",
        type = "input",
        value = self.currentPath,
        props = { type = "text", placeholder = "directory path (empty = root)" },
      },
      { label = "Go", key = "navigate", icon = "arrow-right", type = "button" },
      -- File operations
      {
        label = "Item",
        key = "selectedItem",
        icon = "file",
        type = "input",
        value = self.selectedItem,
        props = { type = "text", placeholder = "file or folder name" },
      },
      {
        label = "Open / Read",
        key = "open",
        icon = "file-text",
        type = "button",
        props = { title = "Directories: navigate into. Files: read content to clipboard." },
      },
      { label = "Delete", key = "delete", icon = "trash-2", type = "button" },
    },
    -- Metadata shown in plugin footer / info area
    _saveDir = saveDir,
    _currentPath = self.currentPath == "" and "/" or self.currentPath,
  }
end

return FilesystemPlugin
