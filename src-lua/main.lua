local FeatherDebugger = require("feather")
local FeatherPluginManager = require("feather.plugin_manager")
local HumpSignalPlugin = require("plugins.hump.signal")
local Signal = require("demo.lib.hump.signal")
local TestPlugin = require("demo.plugin")
local test = require("demo.another.lib")
local utf8 = require("utf8")

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

local debugger = FeatherDebugger({
  errorHandler = customerrorhandler,
  wrappedPrint = true,
  wrapPrint = true,
  defaultObservers = true,
  autoRegisterErrorHandler = true,
  baseDir = "src-lua",
  debug = true,
  plugins = {
    FeatherPluginManager.createPlugin(TestPlugin, "test", {
      test = true,
    }),
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
  },
})

local a = 0

function love.load()
  Signal.register("shoot", function(x, y, dx, dy)
    -- for every critter in the path of the bullet:
    -- try to avoid being hit
    print(x, y, dx, dy)
  end)
end

function love.draw() end

function love.update(dt)
  debugger:update(dt)
  a = a + dt

  if a > 1 then
    a = 0
    debugger:observe("awesome variable", a)
  end
end

function love.keypressed(key)
  if key == "space" then
    -- c = b.a * 2

    test()
  end
end
