local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")
local json = require(FEATHER_PATH .. ".lib.json")

local unpack = unpack or table.unpack

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

local function isArray(value)
  if type(value) ~= "table" then
    return false
  end
  local count = 0
  for key in pairs(value) do
    if type(key) ~= "number" or key < 1 or key % 1 ~= 0 then
      return false
    end
    count = count + 1
  end
  return count == #value
end

local stableEncode
local function encodeString(value)
  return json.encode(value)
end

local function sortedKeys(value)
  local keys = {}
  for key in pairs(value) do
    if type(key) ~= "string" then
      error("session replay state tables must use string keys or array indexes", 3)
    end
    keys[#keys + 1] = key
  end
  table.sort(keys)
  return keys
end

stableEncode = function(value, stack)
  local kind = type(value)
  if kind == "nil" or kind == "string" or kind == "number" or kind == "boolean" then
    return json.encode(value)
  end
  if kind ~= "table" then
    error("session replay state cannot encode " .. kind, 3)
  end

  stack = stack or {}
  if stack[value] then
    error("session replay state cannot encode circular tables", 3)
  end
  stack[value] = true

  local out = {}
  if isArray(value) then
    for index = 1, #value do
      out[#out + 1] = stableEncode(value[index], stack)
    end
    stack[value] = nil
    return "[" .. table.concat(out, ",") .. "]"
  end

  for _, key in ipairs(sortedKeys(value)) do
    out[#out + 1] = encodeString(key) .. ":" .. stableEncode(value[key], stack)
  end
  stack[value] = nil
  return "{" .. table.concat(out, ",") .. "}"
end

local function nowId()
  local randomPart = math.random and math.random(100000, 999999) or os.time()
  return "session_" .. os.date("%Y%m%d_%H%M%S") .. "_" .. tostring(randomPart)
end

local function joinPath(base, child)
  if not base or base == "" then
    return child
  end
  return base .. "/" .. child
end

local function ensureDirectory(path)
  if love and love.filesystem and love.filesystem.createDirectory then
    return love.filesystem.createDirectory(path)
  end
  return false
end

local function writeFile(path, content)
  if not (love and love.filesystem and love.filesystem.write) then
    return false, "love.filesystem.write is unavailable"
  end
  return love.filesystem.write(path, content)
end

local function appendFile(path, content)
  if not (love and love.filesystem) then
    return false, "love.filesystem is unavailable"
  end
  if love.filesystem.append then
    return love.filesystem.append(path, content)
  end
  local existing = ""
  if love.filesystem.getInfo and love.filesystem.getInfo(path) then
    existing = love.filesystem.read(path) or ""
  end
  return love.filesystem.write(path, existing .. content)
end

local function readFile(path)
  if love and love.filesystem and love.filesystem.read then
    return love.filesystem.read(path)
  end
  return nil
end

local function listFiles(path)
  if love and love.filesystem and love.filesystem.getDirectoryItems then
    local ok, items = pcall(love.filesystem.getDirectoryItems, path)
    if ok and items then
      table.sort(items)
      return items
    end
  end
  return {}
end

local function readJsonLines(path)
  local content = readFile(path)
  local events = {}
  if not content then
    return events
  end
  for line in content:gmatch("[^\r\n]+") do
    if #line > 0 then
      local ok, decoded = pcall(json.decode, line)
      if ok and decoded then
        events[#events + 1] = decoded
      end
    end
  end
  return events
end

local function countStreams(streams)
  local count = 0
  if type(streams) == "table" then
    for _ in pairs(streams) do
      count = count + 1
    end
  end
  return count
end

local function clearArray(value)
  for index = #value, 1, -1 do
    value[index] = nil
  end
end

local CALLBACK_BUS_EVENTS = {
  keypressed = true,
  keyreleased = true,
  mousepressed = true,
  mousereleased = true,
  mousemoved = true,
  touchpressed = true,
  touchreleased = true,
  touchmoved = true,
  joystickpressed = true,
  joystickreleased = true,
  joystickhat = true,
  joystickaxis = true,
  gamepadpressed = true,
  gamepadreleased = true,
  gamepadaxis = true,
}

local SessionReplayPlugin = Class({
  __includes = Base,
  init = function(self, config)
    Base.init(self, config)
    self.options = config.options or {}
    self.feather = config.feather
    self.logger = config.logger
    self.recording = false
    self.replaying = false
    self.recordStart = 0
    self.replayStart = 0
    self.replayInputIndex = 1
    self.replayStateIndex = 1
    self.maxInputEvents = self.options.maxInputEvents or 20000
    self.keyframeInterval = self.options.keyframeInterval or 5
    self.chunkMaxEvents = self.options.chunkMaxEvents or 1000
    self.flushInterval = tonumber(self.options.flushInterval) or 0.2
    self.flushMaxLines = tonumber(self.options.flushMaxLines) or 128
    if self.flushInterval < 0 then
      self.flushInterval = 0
    end
    if self.flushMaxLines < 1 then
      self.flushMaxLines = 1
    end
    self.captureKeys = self.options.captureKeys ~= false
    self.captureMouse = self.options.captureMouse ~= false
    self.captureMouseMove = self.options.captureMouseMove == true
    self.captureTouch = self.options.captureTouch ~= false
    self.captureTouchMove = self.options.captureTouchMove == true
    self.captureJoystick = self.options.captureJoystick ~= false
    self.captureJoystickAxis = self.options.captureJoystickAxis == true
    self.rootDir = self.options.rootDir or "feather_replays"
    self.currentReplayId = nil
    self.currentReplayDir = nil
    self.manifest = nil
    self.inputEvents = {}
    self.stateEvents = {}
    self.initialStates = {}
    self._lastState = {}
    self._lastKeyframeAt = {}
    self._pendingInputLines = {}
    self._pendingStateLines = {}
    self._lastFlushAt = 0
    self._stateRegistrations = {}
    self._missingRestorers = {}
    self._pollOriginals = {}
    self._virtualInput = { keys = {}, scancodes = {}, mouseButtons = {}, mouseX = nil, mouseY = nil }
    self._pollHooked = false
    self._callbackDisposers = {}

    ensureDirectory(self.rootDir)
    if config.callbacks then
      self:_installCallbackBusHooks(config.callbacks)
    end
  end,
})

function SessionReplayPlugin:_log(message)
  if self.logger and self.logger.log then
    self.logger:log({ type = "trace", str = "[SessionReplay] " .. message })
  end
end

function SessionReplayPlugin:_shouldCapture(name)
  if name == "keypressed" or name == "keyreleased" then
    return self.captureKeys
  elseif name == "mousepressed" or name == "mousereleased" then
    return self.captureMouse
  elseif name == "mousemoved" then
    return self.captureMouseMove
  elseif name == "touchpressed" or name == "touchreleased" then
    return self.captureTouch
  elseif name == "touchmoved" then
    return self.captureTouchMove
  elseif
    name == "joystickpressed"
    or name == "joystickreleased"
    or name == "joystickhat"
    or name == "gamepadpressed"
    or name == "gamepadreleased"
  then
    return self.captureJoystick
  elseif name == "joystickaxis" or name == "gamepadaxis" then
    return self.captureJoystickAxis
  end
  return false
end

function SessionReplayPlugin:_inputPath()
  return joinPath(self.currentReplayDir, "inputs.jsonl")
end

function SessionReplayPlugin:_statePath()
  return joinPath(self.currentReplayDir, "state-0001.jsonl")
end

function SessionReplayPlugin:_initialPath()
  return joinPath(self.currentReplayDir, "initial.json")
end

function SessionReplayPlugin:_manifestPath()
  return joinPath(self.currentReplayDir, "manifest.json")
end

function SessionReplayPlugin:_writeManifest(status)
  if not self.manifest or not self.currentReplayDir then
    return
  end
  self.manifest.status = status or self.manifest.status
  self.manifest.updatedAt = os.date("!%Y-%m-%dT%H:%M:%SZ")
  writeFile(self:_manifestPath(), json.encode(self.manifest))
end

function SessionReplayPlugin:_queueInputLine(line)
  self._pendingInputLines[#self._pendingInputLines + 1] = line
  if #self._pendingInputLines >= self.flushMaxLines then
    self:_flushReplayWrites()
  end
end

function SessionReplayPlugin:_queueStateLine(line)
  self._pendingStateLines[#self._pendingStateLines + 1] = line
  if #self._pendingStateLines >= self.flushMaxLines then
    self:_flushReplayWrites()
  end
end

function SessionReplayPlugin:_flushReplayWrites()
  if not self.currentReplayDir then
    return
  end
  if #self._pendingInputLines > 0 then
    appendFile(self:_inputPath(), table.concat(self._pendingInputLines))
    clearArray(self._pendingInputLines)
  end
  if #self._pendingStateLines > 0 then
    appendFile(self:_statePath(), table.concat(self._pendingStateLines))
    clearArray(self._pendingStateLines)
  end
  self._lastFlushAt = gettime()
end

function SessionReplayPlugin:_recordInputEvent(name, args)
  if not self.recording or self.replaying or not self:_shouldCapture(name) then
    return
  end
  if #self.inputEvents >= self.maxInputEvents then
    return
  end
  local event = {
    time = gettime() - self.recordStart,
    type = name,
    args = args,
  }
  self.inputEvents[#self.inputEvents + 1] = event
  if self.manifest then
    self.manifest.inputCount = #self.inputEvents
    self.manifest.duration = event.time
  end
  self:_queueInputLine(json.encode(event) .. "\n")
end

function SessionReplayPlugin:_installCallbackBusHooks(callbacks)
  local function register(name, argsTransform)
    local ok, disposer = pcall(callbacks.register, name, function(...)
      self:_recordInputEvent(name, argsTransform and argsTransform(...) or { ... })
    end)
    if ok and disposer then
      self._callbackDisposers[#self._callbackDisposers + 1] = disposer
    end
  end

  local function touchArgs(id, x, y, dx, dy, pressure)
    return { tostring(id), x, y, dx, dy, pressure }
  end

  local function joystickArgs(joystick, ...)
    local id = joystick and joystick.getID and joystick:getID() or tostring(joystick)
    return { id, ... }
  end

  register("keypressed")
  register("keyreleased")
  register("mousepressed")
  register("mousereleased")
  register("mousemoved")
  register("touchpressed", touchArgs)
  register("touchreleased", touchArgs)
  register("touchmoved", touchArgs)
  register("joystickpressed", joystickArgs)
  register("joystickreleased", joystickArgs)
  register("joystickhat", joystickArgs)
  register("joystickaxis", joystickArgs)
  register("gamepadpressed", joystickArgs)
  register("gamepadreleased", joystickArgs)
  register("gamepadaxis", joystickArgs)
end

function SessionReplayPlugin:_resetVirtualInput()
  self._virtualInput = { keys = {}, scancodes = {}, mouseButtons = {}, mouseX = nil, mouseY = nil }
end

function SessionReplayPlugin:_setVirtualKey(key, scancode, down)
  if key ~= nil then
    self._virtualInput.keys[key] = down and true or nil
  end
  if scancode ~= nil then
    self._virtualInput.scancodes[scancode] = down and true or nil
  end
end

function SessionReplayPlugin:_setVirtualMouse(button, down, x, y)
  if button ~= nil then
    self._virtualInput.mouseButtons[button] = down and true or nil
  end
  if x ~= nil then
    self._virtualInput.mouseX = x
  end
  if y ~= nil then
    self._virtualInput.mouseY = y
  end
end

function SessionReplayPlugin:_installPollingHooks()
  if self._pollHooked then
    return
  end
  self._pollHooked = true

  if love.keyboard then
    if love.keyboard.isDown then
      self._pollOriginals.keyboardIsDown = love.keyboard.isDown
      love.keyboard.isDown = function(...)
        for _, key in ipairs({ ... }) do
          if self._virtualInput.keys[key] then
            return true
          end
        end
        return self._pollOriginals.keyboardIsDown(...)
      end
    end
    if love.keyboard.isScancodeDown then
      self._pollOriginals.keyboardIsScancodeDown = love.keyboard.isScancodeDown
      love.keyboard.isScancodeDown = function(...)
        for _, scancode in ipairs({ ... }) do
          if self._virtualInput.scancodes[scancode] then
            return true
          end
        end
        return self._pollOriginals.keyboardIsScancodeDown(...)
      end
    end
  end

  if love.mouse then
    if love.mouse.isDown then
      self._pollOriginals.mouseIsDown = love.mouse.isDown
      love.mouse.isDown = function(...)
        for _, button in ipairs({ ... }) do
          if self._virtualInput.mouseButtons[button] then
            return true
          end
        end
        return self._pollOriginals.mouseIsDown(...)
      end
    end
    if love.mouse.getPosition then
      self._pollOriginals.mouseGetPosition = love.mouse.getPosition
      love.mouse.getPosition = function()
        if self._virtualInput.mouseX ~= nil and self._virtualInput.mouseY ~= nil then
          return self._virtualInput.mouseX, self._virtualInput.mouseY
        end
        return self._pollOriginals.mouseGetPosition()
      end
    end
  end
end

function SessionReplayPlugin:_removePollingHooks()
  if not self._pollHooked then
    return
  end
  if love.keyboard then
    if self._pollOriginals.keyboardIsDown then
      love.keyboard.isDown = self._pollOriginals.keyboardIsDown
    end
    if self._pollOriginals.keyboardIsScancodeDown then
      love.keyboard.isScancodeDown = self._pollOriginals.keyboardIsScancodeDown
    end
  end
  if love.mouse then
    if self._pollOriginals.mouseIsDown then
      love.mouse.isDown = self._pollOriginals.mouseIsDown
    end
    if self._pollOriginals.mouseGetPosition then
      love.mouse.getPosition = self._pollOriginals.mouseGetPosition
    end
  end
  self._pollOriginals = {}
  self._pollHooked = false
end

function SessionReplayPlugin:_applyVirtualInput(event)
  local args = event.args or {}
  if event.type == "keypressed" then
    self:_setVirtualKey(args[1], args[2], true)
  elseif event.type == "keyreleased" then
    self:_setVirtualKey(args[1], args[2], false)
  elseif event.type == "mousepressed" then
    self:_setVirtualMouse(args[3], true, args[1], args[2])
  elseif event.type == "mousereleased" then
    self:_setVirtualMouse(args[3], false, args[1], args[2])
  elseif event.type == "mousemoved" then
    self:_setVirtualMouse(nil, nil, args[1], args[2])
  end
end

local function resolveJoystick(id)
  if not (love.joystick and love.joystick.getJoysticks) then
    return nil
  end
  for _, joystick in ipairs(love.joystick.getJoysticks()) do
    if joystick:getID() == id then
      return joystick
    end
  end
  return nil
end

local REPLAY_RESOLVERS = {
  joystickpressed = function(a)
    local joystick = resolveJoystick(a[1])
    return joystick and { joystick, a[2] }
  end,
  joystickreleased = function(a)
    local joystick = resolveJoystick(a[1])
    return joystick and { joystick, a[2] }
  end,
  joystickhat = function(a)
    local joystick = resolveJoystick(a[1])
    return joystick and { joystick, a[2], a[3] }
  end,
  joystickaxis = function(a)
    local joystick = resolveJoystick(a[1])
    return joystick and { joystick, a[2], a[3] }
  end,
  gamepadpressed = function(a)
    local joystick = resolveJoystick(a[1])
    return joystick and { joystick, a[2] }
  end,
  gamepadreleased = function(a)
    local joystick = resolveJoystick(a[1])
    return joystick and { joystick, a[2] }
  end,
  gamepadaxis = function(a)
    local joystick = resolveJoystick(a[1])
    return joystick and { joystick, a[2], a[3] }
  end,
}

function SessionReplayPlugin:_dispatchReplayInput(event)
  self:_applyVirtualInput(event)
  local resolver = REPLAY_RESOLVERS[event.type]
  local replayArgs = resolver and resolver(event.args or {}) or event.args or {}
  if not replayArgs then
    return
  end
  if CALLBACK_BUS_EVENTS[event.type] and love[event.type] then
    pcall(love[event.type], unpack(replayArgs))
  end
end

function SessionReplayPlugin:startRecording(opts)
  opts = opts or {}
  if self.recording then
    return self.currentReplayId
  end
  if self.replaying then
    return nil, "Cannot start session replay recording while replaying"
  end
  ensureDirectory(self.rootDir)
  self.currentReplayId = opts.id or nowId()
  self.currentReplayDir = joinPath(self.rootDir, self.currentReplayId)
  ensureDirectory(self.currentReplayDir)
  self.recordStart = gettime()
  self.inputEvents = {}
  self.stateEvents = {}
  self.initialStates = {}
  self._lastState = {}
  self._lastKeyframeAt = {}
  self._pendingInputLines = {}
  self._pendingStateLines = {}
  self._lastFlushAt = self.recordStart
  self.manifest = {
    version = 1,
    id = self.currentReplayId,
    status = "recording",
    startedAt = os.date("!%Y-%m-%dT%H:%M:%SZ"),
    duration = 0,
    inputCount = 0,
    stateCount = 0,
    initialStateCount = 0,
    keyframeCount = 0,
    streams = {},
    chunks = { "initial.json", "inputs.jsonl", "state-0001.jsonl" },
  }
  writeFile(self:_inputPath(), "")
  writeFile(self:_statePath(), "")
  writeFile(self:_initialPath(), "[]")
  self:_captureInitialStates(opts)
  writeFile(self:_initialPath(), json.encode(self.initialStates))
  self.recordStart = gettime()
  self._lastFlushAt = self.recordStart
  self:_writeManifest("recording")
  self.recording = true
  self:_log("Recording started: " .. self.currentReplayId)
  return self.currentReplayId
end

function SessionReplayPlugin:stopRecording(feather)
  if not self.recording then
    return self.currentReplayId
  end
  self:_flushReplayWrites()
  self.recording = false
  if self.manifest then
    self.manifest.duration = gettime() - self.recordStart
  end
  self:_writeManifest("stopped")
  self:_log("Recording stopped: " .. tostring(self.currentReplayId))
  if feather then
    self:sendRecording(feather)
  end
  return self.currentReplayId
end

function SessionReplayPlugin:recordState(name, state, opts)
  opts = opts or {}
  if not self.recording or not name or name == "" then
    return false
  end

  local ok, encoded = pcall(stableEncode, state)
  if not ok then
    self:_log("Could not encode state '" .. tostring(name) .. "': " .. tostring(encoded))
    return false, encoded
  end

  local elapsed = gettime() - self.recordStart
  local previous = self._lastState[name]
  local keyframeDue = self._lastKeyframeAt[name] == nil
    or (elapsed - self._lastKeyframeAt[name]) >= self.keyframeInterval
  local isKeyframe = opts.keyframe == true or keyframeDue
  if previous == encoded and not isKeyframe then
    return false
  end

  local event = {
    time = elapsed,
    name = name,
    value = state,
    keyframe = isKeyframe or nil,
  }
  self.stateEvents[#self.stateEvents + 1] = event
  self._lastState[name] = encoded
  if isKeyframe then
    self._lastKeyframeAt[name] = elapsed
  end
  if self.manifest then
    self.manifest.stateCount = #self.stateEvents
    self.manifest.duration = elapsed
    local previousStream = self.manifest.streams[name]
    self.manifest.streams[name] = {
      count = (previousStream and previousStream.count or 0) + 1,
      initial = previousStream and previousStream.initial or nil,
      hasRestore = self._stateRegistrations[name] and type(self._stateRegistrations[name].restore) == "function"
        or false,
    }
    if isKeyframe then
      self.manifest.keyframeCount = (self.manifest.keyframeCount or 0) + 1
    end
  end
  self:_queueStateLine(json.encode(event) .. "\n")
  return true
end

function SessionReplayPlugin:recordInitialState(name, state, opts)
  opts = opts or {}
  if type(name) ~= "string" or name == "" then
    return false, "state name is required"
  end
  if not self.currentReplayDir or not self.manifest then
    return false, "No active session replay baseline"
  end

  local ok, encoded = pcall(stableEncode, state)
  if not ok then
    self:_log("Could not encode initial state '" .. tostring(name) .. "': " .. tostring(encoded))
    return false, encoded
  end

  local event = {
    name = name,
    value = state,
    time = 0,
    keyframe = true,
    source = opts.source,
  }
  for index = #self.initialStates, 1, -1 do
    if self.initialStates[index].name == name then
      table.remove(self.initialStates, index)
    end
  end
  self.initialStates[#self.initialStates + 1] = event
  self._lastState[name] = encoded
  self._lastKeyframeAt[name] = 0

  if self.manifest then
    self.manifest.initialStateCount = #self.initialStates
    self.manifest.streams[name] = self.manifest.streams[name] or {}
    self.manifest.streams[name].initial = true
    self.manifest.streams[name].hasRestore = self._stateRegistrations[name]
        and type(self._stateRegistrations[name].restore) == "function"
      or false
  end
  if self.currentReplayDir then
    writeFile(self:_initialPath(), json.encode(self.initialStates))
    self:_writeManifest(self.manifest.status)
  end
  return true
end

function SessionReplayPlugin:_recordInitialMap(states, source)
  if type(states) ~= "table" then
    return
  end
  if type(states.name) == "string" and states.value ~= nil then
    self:recordInitialState(states.name, states.value, { source = source })
    return
  end
  for name, state in pairs(states) do
    if type(name) == "string" then
      self:recordInitialState(name, state, { source = source })
    elseif type(state) == "table" and type(state.name) == "string" then
      self:recordInitialState(state.name, state.value, { source = source })
    end
  end
end

function SessionReplayPlugin:_captureInitialStates(opts)
  opts = opts or {}
  self:_recordInitialMap(opts.initialState, "start")
  self:_recordInitialMap(opts.initialStates, "start")

  if opts.captureInitial == false then
    return
  end

  for name, registration in pairs(self._stateRegistrations) do
    if type(registration.capture) == "function" and not self._lastState[name] then
      local ok, state = pcall(registration.capture)
      if ok then
        self:recordInitialState(name, state, { source = "capture" })
      else
        self:_log("Initial capture failed for state '" .. tostring(name) .. "': " .. tostring(state))
      end
    end
  end
end

function SessionReplayPlugin:registerState(name, captureFn, restoreFn, opts)
  if type(name) ~= "string" or name == "" then
    return false, "state name is required"
  end
  self._stateRegistrations[name] = {
    capture = captureFn,
    restore = restoreFn,
    opts = opts or {},
    sampleInterval = opts and opts.sampleInterval or 0,
    nextSampleAt = 0,
  }
  return true
end

function SessionReplayPlugin:_captureRegisteredStates(elapsed)
  for name, registration in pairs(self._stateRegistrations) do
    if type(registration.capture) == "function" and elapsed >= (registration.nextSampleAt or 0) then
      registration.nextSampleAt = elapsed + (registration.sampleInterval or 0)
      local ok, state = pcall(registration.capture)
      if ok then
        self:recordState(name, state, registration.opts)
      else
        self:_log("Capture failed for state '" .. tostring(name) .. "': " .. tostring(state))
      end
    end
  end
end

function SessionReplayPlugin:_loadReplay(idOrPath)
  local replayId = idOrPath or self.currentReplayId
  if not replayId or replayId == "" then
    return nil, "No session replay selected"
  end
  local dir = replayId:find("/") and replayId or joinPath(self.rootDir, replayId)
  local manifestContent = readFile(joinPath(dir, "manifest.json"))
  if not manifestContent then
    return nil, "No manifest found for " .. tostring(replayId)
  end
  local ok, manifest = pcall(json.decode, manifestContent)
  if not ok or not manifest then
    return nil, "Invalid manifest for " .. tostring(replayId)
  end

  local inputEvents = readJsonLines(joinPath(dir, "inputs.jsonl"))
  local initialContent = readFile(joinPath(dir, "initial.json"))
  local initialStates = {}
  if initialContent and #initialContent > 0 then
    local initialOk, decoded = pcall(json.decode, initialContent)
    if initialOk and type(decoded) == "table" then
      initialStates = decoded
    end
  end
  local stateEvents = {}
  for _, file in ipairs(listFiles(dir)) do
    if file:match("^state%-%d+%.jsonl$") then
      local events = readJsonLines(joinPath(dir, file))
      for _, event in ipairs(events) do
        stateEvents[#stateEvents + 1] = event
      end
    end
  end
  table.sort(stateEvents, function(a, b)
    return (a.time or 0) < (b.time or 0)
  end)

  return {
    id = manifest.id or replayId,
    dir = dir,
    manifest = manifest,
    initialStates = initialStates,
    inputEvents = inputEvents,
    stateEvents = stateEvents,
  }
end

function SessionReplayPlugin:startReplay(idOrPath)
  if self.recording then
    self:stopRecording()
  end
  local replay, err = self:_loadReplay(idOrPath)
  if not replay then
    self:_log(tostring(err))
    return false, err
  end

  self.currentReplayId = replay.id
  self.currentReplayDir = replay.dir
  self.manifest = replay.manifest
  self.initialStates = replay.initialStates or {}
  self.inputEvents = replay.inputEvents
  self.stateEvents = replay.stateEvents
  self.replayInputIndex = 1
  self.replayStateIndex = 1
  self._missingRestorers = {}
  self:_resetVirtualInput()
  self:_installPollingHooks()
  self:_applyInitialStates()
  self.replaying = true
  self.replayStart = gettime()
  self:_log("Replay started: " .. tostring(replay.id))
  return true
end

function SessionReplayPlugin:stopReplay()
  self.replaying = false
  self:_resetVirtualInput()
  self:_removePollingHooks()
  self:_log("Replay stopped")
end

function SessionReplayPlugin:_applyReplayState(event)
  local registration = self._stateRegistrations[event.name]
  if registration and type(registration.restore) == "function" then
    local ok, err = pcall(registration.restore, event.value, event)
    if not ok then
      self:_log("Restore failed for state '" .. tostring(event.name) .. "': " .. tostring(err))
    end
  else
    self._missingRestorers[event.name] = true
  end
end

function SessionReplayPlugin:_applyInitialStates()
  for _, event in ipairs(self.initialStates or {}) do
    self:_applyReplayState(event)
  end
end

function SessionReplayPlugin:update(_dt, feather)
  if self.recording then
    self:_captureRegisteredStates(gettime() - self.recordStart)
    if (gettime() - self._lastFlushAt) >= self.flushInterval then
      self:_flushReplayWrites()
    end
  end

  if not self.replaying then
    return
  end

  local elapsed = gettime() - self.replayStart
  while self.replayStateIndex <= #self.stateEvents do
    local event = self.stateEvents[self.replayStateIndex]
    if (event.time or 0) > elapsed then
      break
    end
    self:_applyReplayState(event)
    self.replayStateIndex = self.replayStateIndex + 1
  end

  while self.replayInputIndex <= #self.inputEvents do
    local event = self.inputEvents[self.replayInputIndex]
    if (event.time or 0) > elapsed then
      break
    end
    self:_dispatchReplayInput(event)
    self.replayInputIndex = self.replayInputIndex + 1
  end

  if self.replayInputIndex > #self.inputEvents and self.replayStateIndex > #self.stateEvents then
    self:stopReplay()
    if feather then
      self:sendStatus(feather)
    end
  end
end

function SessionReplayPlugin:_filePayload(path, feather, dir)
  local content = readFile(joinPath(dir or self.currentReplayDir, path)) or ""
  if feather and feather.attachBinary then
    local ref = feather:attachBinary("application/json", content)
    return { path = path, content = ref.src, binary = ref.binary, bytes = #content }
  end
  return { path = path, content = content, bytes = #content }
end

function SessionReplayPlugin:sendRecording(feather, idOrPath)
  if not feather then
    return
  end
  if idOrPath and self.recording then
    return false, "Cannot load another replay while recording"
  end
  if idOrPath then
    local replay, err = self:_loadReplay(idOrPath)
    if not replay then
      return false, err
    end
    self.currentReplayId = replay.id
    self.currentReplayDir = replay.dir
    self.manifest = replay.manifest
    self.inputEvents = replay.inputEvents
    self.stateEvents = replay.stateEvents
  end
  if not self.currentReplayDir then
    return false, "No replay selected"
  end
  if self.recording and self.manifest then
    self:_flushReplayWrites()
    self:_writeManifest("recording")
  end
  local files = {
    self:_filePayload("manifest.json", feather, self.currentReplayDir),
    self:_filePayload("initial.json", feather, self.currentReplayDir),
    self:_filePayload("inputs.jsonl", feather, self.currentReplayDir),
  }
  for _, file in ipairs(listFiles(self.currentReplayDir)) do
    if file:match("^state%-%d+%.jsonl$") then
      files[#files + 1] = self:_filePayload(file, feather, self.currentReplayDir)
    end
  end
  feather:__sendWs(json.encode({
    type = "session_replay:recording",
    session = feather.sessionId,
    data = {
      manifest = self.manifest,
      files = files,
    },
  }))
  feather:__sendPendingBinaries()
  return true
end

function SessionReplayPlugin:_replaySummary(id, manifest)
  manifest = manifest or {}
  return {
    id = tostring(manifest.id or id),
    status = manifest.status or "unknown",
    startedAt = manifest.startedAt,
    updatedAt = manifest.updatedAt,
    duration = manifest.duration or 0,
    inputCount = manifest.inputCount or 0,
    stateCount = manifest.stateCount or 0,
    initialStateCount = manifest.initialStateCount or 0,
    keyframeCount = manifest.keyframeCount or 0,
    streamCount = countStreams(manifest.streams),
  }
end

function SessionReplayPlugin:listReplays()
  ensureDirectory(self.rootDir)
  local replays = {}
  for _, id in ipairs(listFiles(self.rootDir)) do
    local manifestContent = readFile(joinPath(joinPath(self.rootDir, id), "manifest.json"))
    if manifestContent then
      local ok, manifest = pcall(json.decode, manifestContent)
      if ok and type(manifest) == "table" then
        replays[#replays + 1] = self:_replaySummary(id, manifest)
      end
    end
  end
  table.sort(replays, function(a, b)
    return tostring(a.updatedAt or a.startedAt or a.id) > tostring(b.updatedAt or b.startedAt or b.id)
  end)
  return replays
end

function SessionReplayPlugin:sendReplayList(feather)
  if not feather then
    return
  end
  feather:__sendWs(json.encode({
    type = "session_replay:list",
    session = feather.sessionId,
    data = {
      replays = self:listReplays(),
      selectedId = self.currentReplayId,
    },
  }))
end

function SessionReplayPlugin:sendStatus(feather)
  if not feather then
    return
  end
  local missing = {}
  for name in pairs(self._missingRestorers) do
    missing[#missing + 1] = name
  end
  table.sort(missing)
  feather:__sendWs(json.encode({
    type = "session_replay:status",
    session = feather.sessionId,
    data = {
      recording = self.recording,
      replaying = self.replaying,
      replayId = self.currentReplayId,
      duration = self.manifest and self.manifest.duration or 0,
      inputCount = #self.inputEvents,
      stateCount = #self.stateEvents,
      initialStateCount = #self.initialStates,
      streamCount = self.manifest and countStreams(self.manifest.streams) or 0,
      missingRestorers = missing,
    },
  }))
end

function SessionReplayPlugin:importReplay(payload)
  if type(payload) ~= "table" or type(payload.files) ~= "table" then
    return false, "Replay import payload must include files"
  end
  local manifestFile
  for _, file in ipairs(payload.files) do
    if file.path == "manifest.json" then
      manifestFile = file
      break
    end
  end
  if not manifestFile or type(manifestFile.content) ~= "string" then
    return false, "Replay import is missing manifest.json"
  end
  local ok, manifest = pcall(json.decode, manifestFile.content)
  if not ok or type(manifest) ~= "table" or not manifest.id then
    return false, "Replay manifest is invalid"
  end
  local replayId = tostring(manifest.id)
  local dir = joinPath(self.rootDir, replayId)
  ensureDirectory(self.rootDir)
  ensureDirectory(dir)
  for _, file in ipairs(payload.files) do
    if type(file.path) == "string" and type(file.content) == "string" and not file.path:find("%.%.", 1, true) then
      writeFile(joinPath(dir, file.path), file.content)
    end
  end
  self.currentReplayId = replayId
  self.currentReplayDir = dir
  self.manifest = manifest
  self.initialStates = {}
  local initialContent = readFile(joinPath(dir, "initial.json"))
  if initialContent and #initialContent > 0 then
    local initialOk, decoded = pcall(json.decode, initialContent)
    if initialOk and type(decoded) == "table" then
      self.initialStates = decoded
    end
  end
  return true
end

function SessionReplayPlugin:deleteReplay(id)
  id = id or self.currentReplayId
  if not id then
    return false, "No replay selected"
  end
  if not (love and love.filesystem and love.filesystem.remove) then
    return false, "love.filesystem.remove is unavailable"
  end
  local dir = id:find("/") and id or joinPath(self.rootDir, id)
  for _, file in ipairs(listFiles(dir)) do
    love.filesystem.remove(joinPath(dir, file))
  end
  love.filesystem.remove(dir)
  if self.currentReplayId == id then
    self.currentReplayId = nil
    self.currentReplayDir = nil
    self.manifest = nil
    self.inputEvents = {}
    self.stateEvents = {}
    self.initialStates = {}
    self._pendingInputLines = {}
    self._pendingStateLines = {}
  end
  return true
end

function SessionReplayPlugin:handleSessionReplayCommand(msg, feather)
  if msg.type == "cmd:session_replay:start" then
    local id, err = self:startRecording(msg.data or {})
    self:sendStatus(feather)
    self:sendReplayList(feather)
    return id ~= nil, err
  elseif msg.type == "cmd:session_replay:stop" then
    self:stopRecording(feather)
    self:sendStatus(feather)
    self:sendReplayList(feather)
    return true
  elseif msg.type == "cmd:session_replay:request" then
    local ok, err = self:sendRecording(feather, msg.data and (msg.data.id or msg.data.path) or nil)
    self:sendStatus(feather)
    self:sendReplayList(feather)
    return ok, err
  elseif msg.type == "cmd:session_replay:list" then
    self:sendReplayList(feather)
    self:sendStatus(feather)
    return true
  elseif msg.type == "cmd:session_replay:play" then
    local ok, err = self:startReplay(msg.data and (msg.data.id or msg.data.path) or nil)
    self:sendStatus(feather)
    return ok, err
  elseif msg.type == "cmd:session_replay:stop_replay" then
    self:stopReplay()
    self:sendStatus(feather)
    return true
  elseif msg.type == "cmd:session_replay:import" then
    local ok, err = self:importReplay(msg.data or {})
    self:sendStatus(feather)
    self:sendReplayList(feather)
    return ok, err
  elseif msg.type == "cmd:session_replay:delete" then
    local ok, err = self:deleteReplay(msg.data and msg.data.id or nil)
    self:sendStatus(feather)
    self:sendReplayList(feather)
    return ok, err
  end
  return false, "Unknown session replay command"
end

function SessionReplayPlugin:handleActionRequest(request, feather)
  local action = request.params and request.params.action
  if action == "record" then
    if self.recording then
      self:stopRecording(feather)
    else
      local id, err = self:startRecording()
      if not id then
        return false, err
      end
    end
    self:sendStatus(feather)
    self:sendReplayList(feather)
    return true
  elseif action == "replay" then
    if self.replaying then
      self:stopReplay()
    else
      self:startReplay()
    end
    self:sendStatus(feather)
    return true
  elseif action == "load" then
    self:sendRecording(feather)
    self:sendReplayList(feather)
    return true
  elseif action == "clear" then
    self.inputEvents = {}
    self.stateEvents = {}
    self.initialStates = {}
    self._lastState = {}
    self._pendingInputLines = {}
    self._pendingStateLines = {}
    self._missingRestorers = {}
    self:sendStatus(feather)
    return true
  end
end

function SessionReplayPlugin:handleRequest(_request, _feather)
  local status = self.recording and "recording" or self.replaying and "replaying" or "idle"
  return {
    type = "table",
    loading = self.recording or self.replaying,
    columns = {
      { key = "field", label = "Field" },
      { key = "value", label = "Value" },
    },
    data = {
      { field = "Status", value = status },
      { field = "Replay", value = self.currentReplayId or "none" },
      { field = "Inputs", value = tostring(#self.inputEvents) },
      { field = "States", value = tostring(#self.stateEvents) },
      { field = "Initial states", value = tostring(#self.initialStates) },
    },
    _status = status,
    _replayId = self.currentReplayId,
    _inputCount = #self.inputEvents,
    _stateCount = #self.stateEvents,
    _initialStateCount = #self.initialStates,
  }
end

function SessionReplayPlugin:finish()
  self:_flushReplayWrites()
  self.recording = false
  self.replaying = false
  self:_removePollingHooks()
  for _, dispose in ipairs(self._callbackDisposers) do
    pcall(dispose)
  end
  self._callbackDisposers = {}
end

function SessionReplayPlugin:getConfig()
  return {
    type = "session-replay",
    icon = "repeat",
    tabName = "Session Replay",
    docs = "https://github.com/Kyonru/feather/tree/main/src-lua/plugins/session-replay",
    recording = self.recording,
    replaying = self.replaying,
    replayId = self.currentReplayId,
    actions = {
      {
        label = self.recording and "Stop Recording" or "Record",
        key = "record",
        icon = self.recording and "square" or "circle",
        type = "button",
      },
      {
        label = self.replaying and "Stop Replay" or "Replay",
        key = "replay",
        icon = self.replaying and "square" or "play",
        type = "button",
      },
      { label = "Load", key = "load", icon = "download", type = "button" },
      { label = "Clear", key = "clear", icon = "trash-2", type = "button" },
    },
  }
end

return SessionReplayPlugin
