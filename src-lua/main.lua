-- Minimal WS test mode: love src-lua --test-ws
-- Auto-setup test mode: love src-lua --test-auto
for _, arg in ipairs(arg or {}) do
  if arg == "--test-ws" then
    require("test_ws")
    return
  end
  if arg == "--test-auto" then
    require("test_auto")
    return
  end
end

local utf8 = require("utf8")
local FeatherDebugger = require("feather")
local FeatherPluginManager = require("feather.plugin_manager")
local HumpSignalPlugin = require("plugins.hump.signal")
local LuaStateMachinePlugin = require("plugins.lua-state-machine")
local ScreenshotPlugin = require("plugins.screenshots")
local ConsolePlugin = require("plugins.console")
local ProfilerPlugin = require("plugins.profiler")
local EntityInspectorPlugin = require("plugins.entity-inspector")
local InputReplayPlugin = require("plugins.input-replay")
local ConfigTweakerPlugin = require("plugins.config-tweaker")
local BookmarkPlugin = require("plugins.bookmark")
local NetworkInspectorPlugin = require("plugins.network-inspector")
local MemorySnapshotPlugin = require("plugins.memory-snapshot")
local PhysicsDebugPlugin = require("plugins.physics-debug")
local ParticleEditorPlugin = require("plugins.particle-editor")
local AudioDebugPlugin = require("plugins.audio-debug")
local CoroutineMonitorPlugin = require("plugins.coroutine-monitor")
local CollisionDebugPlugin = require("plugins.collision-debug")
local AnimationInspectorPlugin = require("plugins.animation-inspector")
local TimerInspectorPlugin = require("plugins.timer-inspector")
local FilesystemPlugin = require("plugins.filesystem")
local TimeTravelPlugin = require("plugins.time-travel")

local TestPlugin = require("demo.plugin")
local test = require("demo.another.lib")
local Signal = require("demo.lib.hump.signal")
local machine = require("demo.lib.statemachine")
local Game = require("demo.tetris")

local function error_printer(msg, layer)
  print((debug.traceback("Error: " .. tostring(msg), 1 + (layer or 1)):gsub("\n[^\n]+$", "")))
end

local function customerrorhandler(msg)
  msg = tostring(msg)

  error_printer(msg, 2)

  if not love.window or not love.graphics or not love.event then
    return
  end

  if not love.window.isOpen() then
    local success, status = pcall(love.window.setMode, 800, 600)
    if not success or not status then
      return
    end
  end

  -- Reset state.
  if love.mouse then
    love.mouse.setVisible(true)
    love.mouse.setGrabbed(false)
    love.mouse.setRelativeMode(false)
    if love.mouse.isCursorSupported() then
      love.mouse.setCursor()
    end
  end
  if love.joystick then
    -- Stop all joystick vibrations.
    for _, v in ipairs(love.joystick.getJoysticks()) do
      v:setVibration()
    end
  end
  if love.audio then
    love.audio.stop()
  end

  love.graphics.reset()
  love.graphics.setNewFont(14)

  love.graphics.setColor(1, 1, 1)

  local trace = debug.traceback()

  love.graphics.origin()

  local sanitizedMsg = {}
  for char in msg:gmatch(utf8.charpattern) do
    table.insert(sanitizedMsg, char)
  end
  local sanitized = table.concat(sanitizedMsg)

  local err = {}

  table.insert(err, "Error\n")
  table.insert(err, sanitized)

  if #sanitized ~= #msg then
    table.insert(err, "Invalid UTF-8 string in error message.")
  end

  table.insert(err, "\n")

  for l in trace:gmatch("(.-)\n") do
    if not l:match("boot.lua") then
      l = l:gsub("stack traceback:", "Traceback\n")
      table.insert(err, l)
    end
  end

  local p = table.concat(err, "\n")

  p = p:gsub("\t", "")
  p = p:gsub('%[string "(.-)"%]', "%1")

  local function draw()
    if not love.graphics.isActive() then
      return
    end
    local pos = 70
    love.graphics.clear(89 / 255, 157 / 255, 220 / 255)
    love.graphics.printf(p, pos, pos, love.graphics.getWidth() - pos)
    love.graphics.present()
  end

  local fullErrorText = p
  local function copyToClipboard()
    if not love.system then
      return
    end
    love.system.setClipboardText(fullErrorText)
    p = p .. "\nCopiedsds to clipboard!"
  end

  if love.system then
    p = p .. "\n\nPress Ctrl+C or tap to copy this error"
  end

  return function()
    love.event.pump()

    for e, a, _, _ in love.event.poll() do
      if e == "quit" then
        return 1
      elseif e == "keypressed" and a == "escape" then
        return 1
      elseif e == "keypressed" and a == "c" and love.keyboard.isDown("lctrl", "rctrl") then
        copyToClipboard()
      elseif e == "touchpressed" then
        local name = love.window.getTitle()
        if #name == 0 or name == "Untitled" then
          name = "Game"
        end
        local buttons = { "OK", "Cancel" }
        if love.system then
          buttons[3] = "Copy to clipboardasdsdadsdadd"
        end
        local pressed = love.window.showMessageBox("Quit " .. name .. "?", "", buttons)
        if pressed == 1 then
          return 1
        elseif pressed == 3 then
          copyToClipboard()
        end
      end
    end

    draw()

    if love.timer then
      love.timer.sleep(0.1)
    end
  end
end

--- If not set, feather will be added in default identity lovegame, which is fine but want to know identity is respected if set
love.filesystem.setIdentity("feather_dev_demo")

-- Demo config values for the config tweaker plugin
local gameConfig = {
  gravity = 800,
  playerSpeed = 150,
  spawnRate = 1.0,
  godMode = false,
  debugDraw = false,
}

-- Demo entity list for the entity inspector plugin
local gameEntities = {
  {
    name = "Player",
    x = 100,
    y = 200,
    width = 32,
    height = 48,
    rotation = 0,
    speed = 150,
    health = 100,
    active = true,
    children = {
      { name = "Sword", x = 16, y = 0, type = "weapon", active = true },
      { name = "Shield", x = -8, y = 4, type = "armor", active = true },
    },
  },
  {
    name = "Enemy Goblin",
    x = 400,
    y = 180,
    width = 24,
    height = 32,
    rotation = 0,
    speed = 80,
    health = 30,
    active = true,
    tag = "enemy",
  },
  {
    name = "Enemy Skeleton",
    x = 550,
    y = 220,
    width = 28,
    height = 40,
    rotation = 0,
    speed = 60,
    health = 50,
    active = true,
    tag = "enemy",
  },
  {
    name = "Tree",
    x = 300,
    y = 100,
    width = 48,
    height = 64,
    active = true,
    tag = "scenery",
  },
  {
    name = "Chest",
    x = 350,
    y = 300,
    width = 20,
    height = 16,
    active = false,
    tag = "pickup",
    children = {
      { name = "Gold (x50)", type = "loot" },
      { name = "Potion", type = "loot", health = 25 },
    },
  },
}

DEBUGGER = FeatherDebugger({
  sessionName = "Demo Session",
  deviceId = "demo-device-001",
  errorHandler = customerrorhandler,
  wrappedPrint = true,
  wrapPrint = true,
  defaultObservers = true,
  autoRegisterErrorHandler = true,
  baseDir = "src-lua",
  apiKey = "debugger",
  captureScreenshot = false,
  debugger = true,
  debug = true,
  plugins = {
    FeatherPluginManager.createPlugin(TestPlugin, "test", {
      test = true,
    }),
    --- Should handle error gracefully
    ---@diagnostic disable-next-line: missing-fields
    FeatherPluginManager.createPlugin({ 2 }, "test2", {
      test = true,
    }),
    FeatherPluginManager.createPlugin(HumpSignalPlugin, "hump.signal", {
      signal = Signal,
      register = {
        "emit",
        "register",
        "remove",
        "emitPattern",
        "registerPattern",
        "removePattern",
        "clearPattern",
      },
    }),
    FeatherPluginManager.createPlugin(LuaStateMachinePlugin, "lua-state-machine", {
      machine = machine,
    }),
    FeatherPluginManager.createPlugin(ScreenshotPlugin, "screenshots", {
      screenshotDirectory = "screenshots",
      fps = 30,
      gifDuration = 5,
    }),
    FeatherPluginManager.createPlugin(ConsolePlugin, "console", {
      evalEnabled = true,
    }),
    FeatherPluginManager.createPlugin(ProfilerPlugin, "profiler", {}),
    FeatherPluginManager.createPlugin(EntityInspectorPlugin, "entity-inspector", {
      sources = {
        {
          name = "Game Objects",
          entities = function()
            return gameEntities
          end,
          getChildren = function(entity)
            return entity.children
          end,
        },
      },
    }),
    FeatherPluginManager.createPlugin(InputReplayPlugin, "input-replay", {}),
    FeatherPluginManager.createPlugin(BookmarkPlugin, "bookmark", {
      hotkey = "f3",
      categories = { "general", "bug", "lag", "note", "important" },
    }),
    FeatherPluginManager.createPlugin(NetworkInspectorPlugin, "network-inspector", {}),
    FeatherPluginManager.createPlugin(MemorySnapshotPlugin, "memory-snapshot", {
      autoInterval = 0,
    }),
    FeatherPluginManager.createPlugin(PhysicsDebugPlugin, "physics-debug", {
      autoHook = false, -- We'll call draw() manually in the demo
    }),
    FeatherPluginManager.createPlugin(ConfigTweakerPlugin, "config-tweaker", {
      fields = {
        {
          key = "gravity",
          label = "Gravity",
          type = "number",
          min = 0,
          max = 2000,
          step = 10,
          get = function()
            return gameConfig.gravity
          end,
          set = function(v)
            gameConfig.gravity = v
          end,
        },
        {
          key = "playerSpeed",
          label = "Player Speed",
          type = "number",
          min = 0,
          max = 1000,
          step = 5,
          get = function()
            return gameConfig.playerSpeed
          end,
          set = function(v)
            gameConfig.playerSpeed = v
          end,
        },
        {
          key = "spawnRate",
          label = "Spawn Rate",
          type = "number",
          min = 0.1,
          max = 10,
          step = 0.1,
          get = function()
            return gameConfig.spawnRate
          end,
          set = function(v)
            gameConfig.spawnRate = v
          end,
        },
        {
          key = "godMode",
          label = "God Mode",
          type = "boolean",
          get = function()
            return gameConfig.godMode
          end,
          set = function(v)
            gameConfig.godMode = v
          end,
        },
        {
          key = "debugDraw",
          label = "Debug Draw",
          type = "boolean",
          get = function()
            return gameConfig.debugDraw
          end,
          set = function(v)
            gameConfig.debugDraw = v
          end,
        },
      },
    }),
    FeatherPluginManager.createPlugin(ParticleEditorPlugin, "particle-editor", {}),
    FeatherPluginManager.createPlugin(AudioDebugPlugin, "audio-debug", {}),
    FeatherPluginManager.createPlugin(CoroutineMonitorPlugin, "coroutine-monitor", {}),
    FeatherPluginManager.createPlugin(CollisionDebugPlugin, "collision-debug", {
      autoHook = false,
    }),
    FeatherPluginManager.createPlugin(AnimationInspectorPlugin, "animation-inspector", {}),
    FeatherPluginManager.createPlugin(TimerInspectorPlugin, "timer-inspector", {}),
    FeatherPluginManager.createPlugin(FilesystemPlugin, "filesystem", {}),
    FeatherPluginManager.createPlugin(TimeTravelPlugin, "time-travel", {
      bufferSize = 500, -- max frames to keep (oldest are dropped when full)
    }),
  },
})

local a = 0
local counter = 0
local state

local time = 0

-- Wrap demo functions with the profiler
local profiler = DEBUGGER.pluginManager:getPlugin("profiler")
if profiler then
  Game.update = profiler.instance:wrap("Game.update", Game.update)
  Game.draw = profiler.instance:wrap("Game.draw", Game.draw)
  Game.load = profiler.instance:wrap("Game.load", Game.load)
end

-- Demo: track tables for the memory snapshot plugin
local memSnapshot = DEBUGGER.pluginManager:getPlugin("memory-snapshot")
if memSnapshot then
  memSnapshot.instance:trackTable("gameEntities", function()
    return gameEntities
  end)
  memSnapshot.instance:trackTable("gameConfig", function()
    return gameConfig
  end)
end

-- Demo: simulate network traffic for the network inspector
local netInspector = DEBUGGER.pluginManager:getPlugin("network-inspector")
local netDemoTimer = 0

-- Demo: physics world for the physics debug plugin
local physicsWorld
local physicsDebug = DEBUGGER.pluginManager:getPlugin("physics-debug")
if physicsDebug and love.physics then
  love.physics.setMeter(64)
  physicsWorld = love.physics.newWorld(0, 9.81 * 64, true)

  -- Ground
  local ground = love.physics.newBody(physicsWorld, 400, 550, "static")
  love.physics.newFixture(ground, love.physics.newRectangleShape(600, 20))

  -- A few dynamic bodies
  local ball = love.physics.newBody(physicsWorld, 300, 100, "dynamic")
  love.physics.newFixture(ball, love.physics.newCircleShape(20), 1)
  ball:setLinearVelocity(50, 0)

  local box = love.physics.newBody(physicsWorld, 400, 200, "dynamic")
  love.physics.newFixture(box, love.physics.newRectangleShape(40, 40), 1)

  -- Register with the plugin
  physicsDebug.instance:addWorld("demo", function()
    return physicsWorld
  end)
end

-- Demo: particle system for the particle editor plugin
local particleImage
local firePS
local particleEditor = DEBUGGER.pluginManager:getPlugin("particle-editor")
if particleEditor then
  -- Create a small white pixel as the particle texture
  local imageData = love.image.newImageData(4, 4)
  for y = 0, 3 do
    for x = 0, 3 do
      imageData:setPixel(x, y, 1, 1, 1, 1)
    end
  end
  particleImage = love.graphics.newImage(imageData)

  -- Fire-like particle system
  firePS = love.graphics.newParticleSystem(particleImage, 500)
  firePS:setEmissionRate(80)
  firePS:setParticleLifetime(0.3, 0.8)
  firePS:setSpeed(20, 60)
  firePS:setDirection(-math.pi / 2) -- upward
  firePS:setSpread(0.4)
  firePS:setLinearAcceleration(-10, -80, 10, -20)
  firePS:setSizes(1.5, 1.0, 0.3)
  firePS:setSizeVariation(0.5)
  firePS:setColors(
    1,
    0.6,
    0,
    1, -- orange start
    1,
    0.2,
    0,
    0.8, -- red middle
    0.3,
    0.1,
    0,
    0 -- dark fade out
  )
  firePS:setSpinVariation(0.5)
  firePS:start()

  particleEditor.instance:addSystem("Fire", function()
    return firePS
  end, 'love.graphics.newImage("particle.png")')
end

-- Demo: coroutines for the coroutine monitor plugin
local demoCoroutines = {}
local coMonitor = DEBUGGER.pluginManager:getPlugin("coroutine-monitor")

-- A "cutscene" coroutine that yields periodically
local cutsceneCo = coroutine.create(function()
  while true do
    coroutine.yield("waiting")
  end
end)
table.insert(demoCoroutines, cutsceneCo)
if coMonitor then
  coMonitor.instance:addCoroutine(cutsceneCo, "demo-cutscene")
end

-- An async loader that finishes after a few resumes
local loaderCo = coroutine.create(function()
  for i = 1, 5 do
    coroutine.yield("loading " .. i .. "/5")
  end
  return "done"
end)
table.insert(demoCoroutines, loaderCo)
if coMonitor then
  coMonitor.instance:addCoroutine(loaderCo, "asset-loader")
end

local coResumeTimer = 0

function love.load()
  Signal.register("shoot", function(x, y, dx, dy)
    -- for every critter in the path of the bullet:
    -- try to avoid being hit
    print(x, y, dx, dy)
  end)

  state = machine.create({
    initial = "green",
    events = {
      { name = "warn", from = "green", to = "yellow" },
      { name = "panic", from = "yellow", to = "red" },
      { name = "calm", from = "red", to = "yellow" },
      { name = "clear", from = "yellow", to = "green" },
    },
  })
  Game.load()
end

function love.draw()
  Game.draw()
  -- Draw physics debug overlay
  if physicsDebug then
    physicsDebug.instance:draw()
  end
  -- Draw demo particle system
  if firePS then
    love.graphics.draw(firePS, 600, 400)
  end
end

function love.update(dt)
  DEBUGGER:update(dt)
  a = a + dt
  counter = counter + dt
  time = time + dt

  -- Resume demo coroutines periodically
  coResumeTimer = coResumeTimer + dt
  if coResumeTimer >= 0.5 then
    coResumeTimer = 0
    for _, co in ipairs(demoCoroutines) do
      if coroutine.status(co) == "suspended" then
        coroutine.resume(co)
      end
    end
  end

  -- Update physics world
  if physicsWorld then
    physicsWorld:update(dt)
  end

  -- Update demo particle system
  if firePS then
    firePS:update(dt)
  end

  if a > 1 then
    a = 0
    -- DEBUGGER:observe("awesome variable", a)
    -- print(a)
    print(math.random(1, 2))

    local original_file = DEBUGGER.featherLogger.outfile
    local new_file = love.filesystem.getWorkingDirectory() .. "/public/example.log"

    os.rename(original_file, new_file)
  end

  if counter < 5 then
    state:warn()
  elseif counter < 10 then
    state:panic()
  elseif counter < 15 then
    state:calm()
  elseif counter < 20 then
    state:clear()
  else
    counter = 0
  end
  Game.update(dt)

  -- Animate demo entities so the inspector shows changing values
  if gameEntities[1] then
    gameEntities[1].x = 100 + math.sin(time * 2) * 50
    gameEntities[1].y = 200 + math.cos(time * 1.5) * 20
    gameEntities[1].rotation = time * 0.5
  end
  if gameEntities[2] then
    gameEntities[2].x = 400 + math.sin(time) * 30
    gameEntities[2].health = math.max(0, 30 - math.floor(time) % 31)
  end

  -- Simulate network traffic every 2 seconds
  if netInspector then
    netDemoTimer = netDemoTimer + dt
    if netDemoTimer >= 2 then
      netDemoTimer = 0
      local msgs = {
        {
          dir = "out",
          ep = "game-server",
          data = '{"action":"move","x":'
            .. math.floor(gameEntities[1].x)
            .. ',"y":'
            .. math.floor(gameEntities[1].y)
            .. "}",
        },
        { dir = "in", ep = "game-server", data = '{"ack":true,"tick":' .. math.floor(time) .. "}" },
        { dir = "out", ep = "lobby", data = '{"type":"heartbeat"}' },
      }
      local pick = msgs[math.random(#msgs)]
      netInspector.instance:_record(pick.dir, pick.ep, pick.data, "ok")
    end
  end

  -- DEBUGGER.featherLogger.outfile

  -- Debug logs to dev log files
end

function love.keypressed(key)
  if key == "space" then
    print(a)
  end

  if key == "escape" then
    -- c = b.a * 2

    test()
  end

  if key == "f" then
    DEBUGGER:toggleScreenshots(not DEBUGGER.captureScreenshot)
  end

  if key == "f1" then
    DEBUGGER:action("screenshots", "screenshot", {})
  elseif key == "f2" then
    DEBUGGER:action("screenshots", "gif", { duration = 3, fps = 60 })
  end
  Game.keypressed(key)
end
