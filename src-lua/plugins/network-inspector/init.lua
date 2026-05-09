local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")
local json = require(FEATHER_PATH .. ".lib.json")

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

---@class NetworkPacket
---@field id number
---@field direction string    "out" | "in"
---@field endpoint string     Label for the source/destination
---@field size number         Payload size in bytes
---@field payload string      Truncated payload preview
---@field time number         Wall-clock timestamp
---@field gameTime number     Game time (seconds)
---@field status string       "ok" | "error"
---@field error string|nil    Error message if failed

---@class NetworkInspectorPlugin: FeatherPlugin
---@field packets NetworkPacket[]
---@field nextId number
---@field maxPackets number
---@field maxPayloadPreview number
---@field paused boolean
---@field filter string
---@field _origSend table       Original send functions saved for unwrap
---@field _origReceive table    Original receive functions saved for unwrap
---@field _startTime number
---@field _hookSocket boolean
---@field _socketHooked boolean
local NetworkInspectorPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.observer = config.observer
    self.packets = {}
    self.nextId = 1
    self.maxPackets = self.options.maxPackets or 1000
    self.maxPayloadPreview = self.options.maxPayloadPreview or 200
    self.paused = false
    self.filter = ""
    self._origSend = {}
    self._origReceive = {}
    self._startTime = gettime()
    self._hookSocket = self.options.hookSocket == true
    self._socketHooked = false
  end,
})

--- Record a packet.
---@param direction string "out" | "in"
---@param endpoint string
---@param data string|nil
---@param status string "ok" | "error"
---@param errMsg string|nil
function NetworkInspectorPlugin:_record(direction, endpoint, data, status, errMsg)
  if self.paused then
    return
  end

  local payload = ""
  local size = 0
  if data then
    size = #data
    if size > self.maxPayloadPreview then
      payload = string.sub(data, 1, self.maxPayloadPreview) .. "..."
    else
      payload = data
    end
  end

  local packet = {
    id = self.nextId,
    direction = direction,
    endpoint = endpoint,
    size = size,
    payload = payload,
    time = os.time(),
    gameTime = love and love.timer and love.timer.getTime() or gettime() - self._startTime,
    status = status or "ok",
    error = errMsg,
  }
  self.nextId = self.nextId + 1
  table.insert(self.packets, packet)

  -- Trim oldest if over limit
  while #self.packets > self.maxPackets do
    table.remove(self.packets, 1)
  end
end

--- Wrap a send function to log outgoing packets.
--- Returns the wrapped function; the original is called transparently.
---@param endpoint string   Label for this connection (e.g. "game-server", "lobby")
---@param fn function       The original send function: fn(data, ...) -> result, err
---@return function wrappedFn
function NetworkInspectorPlugin:wrapSend(endpoint, fn)
  local plugin = self
  self._origSend[endpoint] = fn
  return function(...)
    local args = { ... }
    local data = args[1]
    local results = { fn(...) }
    -- Detect errors: LuaSocket returns nil, err
    local firstResult = results[1]
    if firstResult == nil then
      local err = results[2]
      plugin:_record("out", endpoint, tostring(data), "error", tostring(err))
    else
      plugin:_record("out", endpoint, tostring(data), "ok")
    end
    return unpack(results)
  end
end

--- Wrap a receive function to log incoming packets.
--- Returns the wrapped function; the original is called transparently.
---@param endpoint string   Label for this connection
---@param fn function       The original receive function: fn(...) -> data, err
---@return function wrappedFn
function NetworkInspectorPlugin:wrapReceive(endpoint, fn)
  local plugin = self
  self._origReceive[endpoint] = fn
  return function(...)
    local results = { fn(...) }
    local data = results[1]
    if data == nil then
      local err = results[2]
      if err and err ~= "timeout" then
        plugin:_record("in", endpoint, nil, "error", tostring(err))
      end
      -- Don't log timeouts — too noisy for non-blocking sockets
    else
      plugin:_record("in", endpoint, tostring(data), "ok")
    end
    return unpack(results)
  end
end

--- Hook LuaSocket TCP metatable to intercept all send/receive globally.
--- Only called if hookSocket = true.
function NetworkInspectorPlugin:_hookLuaSocket()
  if self._socketHooked then
    return
  end

  local ok, socket = pcall(require, "socket")
  if not ok then
    return
  end

  -- Get the TCP metatable via a dummy connection
  local tmp = socket.tcp()
  if not tmp then
    return
  end
  local mt = getmetatable(tmp)
  if not mt or not mt.__index then
    tmp:close()
    return
  end

  local tcpMethods = mt.__index
  local plugin = self

  -- Hook send
  if tcpMethods.send and not self._origSocketSend then
    self._origSocketSend = tcpMethods.send
    tcpMethods.send = function(sock, data, ...)
      local results = { self._origSocketSend(sock, data, ...) }
      local peer = tostring(sock):gsub("tcp{.*}", "tcp")
      if results[1] == nil then
        plugin:_record("out", peer, tostring(data), "error", tostring(results[2]))
      else
        plugin:_record("out", peer, tostring(data), "ok")
      end
      return unpack(results)
    end
  end

  -- Hook receive
  if tcpMethods.receive and not self._origSocketReceive then
    self._origSocketReceive = tcpMethods.receive
    tcpMethods.receive = function(sock, pattern, ...)
      local results = { self._origSocketReceive(sock, pattern, ...) }
      local peer = tostring(sock):gsub("tcp{.*}", "tcp")
      if results[1] == nil then
        local err = results[2]
        if err and err ~= "timeout" then
          plugin:_record("in", peer, nil, "error", tostring(err))
        end
      else
        plugin:_record("in", peer, tostring(results[1]), "ok")
      end
      return unpack(results)
    end
  end

  tmp:close()
  self._socketHooked = true
end

function NetworkInspectorPlugin:init(config)
  self.options = config.options or {}
  self.logger = config.logger
  self.observer = config.observer
  self.packets = {}
  self.nextId = 1
  self.maxPackets = self.options.maxPackets or 1000
  self.maxPayloadPreview = self.options.maxPayloadPreview or 200
  self.paused = false
  self.filter = ""
  self._origSend = {}
  self._origReceive = {}
  self._startTime = gettime()
  self._hookSocket = self.options.hookSocket == true
  self._socketHooked = false

  if self._hookSocket then
    self:_hookLuaSocket()
  end
end

--- Format bytes for display.
---@param bytes number
---@return string
local function formatSize(bytes)
  if bytes < 1024 then
    return bytes .. " B"
  elseif bytes < 1024 * 1024 then
    return string.format("%.1f KB", bytes / 1024)
  else
    return string.format("%.1f MB", bytes / (1024 * 1024))
  end
end

function NetworkInspectorPlugin:update()
  local rows = {}
  local filter = self.filter or ""
  local filterLower = filter:lower()

  -- Build rows, newest first
  for i = #self.packets, 1, -1 do
    local p = self.packets[i]
    -- Apply filter
    if filter ~= "" then
      local matchEndpoint = p.endpoint:lower():find(filterLower, 1, true)
      local matchPayload = p.payload:lower():find(filterLower, 1, true)
      local matchDir = p.direction:lower():find(filterLower, 1, true)
      if not matchEndpoint and not matchPayload and not matchDir then
        goto continue
      end
    end

    rows[#rows + 1] = {
      id = tostring(p.id),
      direction = p.direction == "out" and "→ OUT" or "← IN",
      endpoint = p.endpoint,
      size = formatSize(p.size),
      payload = p.payload,
      gameTime = string.format("%.2f", p.gameTime),
      status = p.status == "error" and ("✗ " .. (p.error or "error")) or "✓",
    }

    ::continue::
  end

  return {
    type = "table",
    loading = false,
    columns = {
      { key = "id", label = "#" },
      { key = "direction", label = "Dir" },
      { key = "endpoint", label = "Endpoint" },
      { key = "size", label = "Size" },
      { key = "status", label = "Status" },
      { key = "gameTime", label = "Time (s)" },
      { key = "payload", label = "Payload" },
    },
    data = rows,
  }
end

function NetworkInspectorPlugin:handleRequest()
  return self:update()
end

function NetworkInspectorPlugin:handleActionRequest(request)
  local action = request.params and request.params.action

  if action == "clear" then
    self.packets = {}
    self.nextId = 1
    return { data = "Cleared all packets" }
  end

  if action == "pause" then
    self.paused = not self.paused
    return { data = self.paused and "Paused" or "Resumed" }
  end

  if action == "export" then
    local exportData = {}
    for _, p in ipairs(self.packets) do
      exportData[#exportData + 1] = {
        id = p.id,
        direction = p.direction,
        endpoint = p.endpoint,
        size = p.size,
        payload = p.payload,
        time = p.time,
        gameTime = p.gameTime,
        status = p.status,
        error = p.error,
      }
    end
    local filename = "network_" .. os.time() .. ".json"
    local content = json.encode(exportData)
    return {
      data = "Export ready",
      download = { filename = filename, content = content },
    }
  end

  return nil, "Unknown action: " .. tostring(action)
end

function NetworkInspectorPlugin:handleParamsUpdate(request)
  local params = request.params or {}
  if params.filter ~= nil then
    self.filter = params.filter
  end
end

function NetworkInspectorPlugin:getConfig()
  return {
    type = "network",
    icon = "wifi",
    tabName = "Network",
    docs = "https://github.com/Kyonru/feather/tree/main/src-lua/plugins/network-inspector",
    actions = {
      {
        label = "Filter",
        key = "filter",
        icon = "search",
        type = "input",
        value = "",
        props = { placeholder = "Filter by endpoint, payload..." },
      },
      {
        label = self.paused and "Resume" or "Pause",
        key = "pause",
        icon = self.paused and "play" or "pause",
        type = "button",
      },
      {
        label = "Clear",
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
    },
  }
end

return NetworkInspectorPlugin
