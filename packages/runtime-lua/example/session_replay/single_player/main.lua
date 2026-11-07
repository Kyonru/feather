local scenes = {
  reproducible = require("reproducible_scene"),
  divergent = require("divergent_scene"),
}

local sceneOrder = { "reproducible", "divergent" }
local sceneIndex = 1
local activeName = sceneOrder[sceneIndex]

local function activeScene()
  return scenes[activeName]
end

local function log(message)
  activeScene().log(message)
end

local function setColor(color)
  love.graphics.setColor(color[1], color[2], color[3], color[4] or 1)
end

local function captureReplaySnapshot()
  return {
    scene = activeName,
    state = activeScene().capture(),
  }
end

local function registerReplay()
  if DEBUGGER then
    DEBUGGER:replayRegister("game", captureReplaySnapshot, function(snapshot)
      if snapshot and snapshot.scene and scenes[snapshot.scene] then
        activeName = snapshot.scene
        for index, name in ipairs(sceneOrder) do
          if name == activeName then
            sceneIndex = index
            break
          end
        end
      end
      if snapshot and snapshot.state then
        activeScene().restore(snapshot.state)
      end
    end, {
      sampleInterval = 0.1,
    })
    log("Session Replay registered through CLI injection.")
  else
    log("Run with: npm run feather -- run src-lua/example/session_replay/single_player")
  end
end

local function switchScene()
  sceneIndex = sceneIndex % #sceneOrder + 1
  activeName = sceneOrder[sceneIndex]
  activeScene().reset("Scene switched")
  log("Switched to " .. activeName .. " scene")
end

function love.load()
  love.graphics.setFont(love.graphics.newFont(14))
  registerReplay()
  log("Open the Session Replay page in Feather.")
end

function love.update(dt)
  activeScene().update(dt)
end

function love.keypressed(key)
  if key == "tab" then
    switchScene()
  elseif key == "f5" and DEBUGGER then
    local id, err = DEBUGGER:startSessionReplay({
      initialStates = {
        game = captureReplaySnapshot(),
      },
    })
    log(id and "Started session replay recording" or ("Could not start recording: " .. tostring(err)))
  elseif key == "f6" and DEBUGGER then
    DEBUGGER:stopSessionReplay()
    log("Stopped recording and loaded replay")
  elseif key == "f7" and DEBUGGER then
    activeScene().reset("Replay baseline reset before playback")
    DEBUGGER:playSessionReplay()
    log("Started replay")
  elseif key == "r" then
    activeScene().reset("Manual reset")
    log("Manual reset")
  elseif key == "escape" then
    if DEBUGGER then
      DEBUGGER:finish()
    end
    love.event.quit()
  end
end

function love.draw()
  love.graphics.clear(0.08, 0.1, 0.13)

  love.graphics.setColor(0.12, 0.15, 0.19)
  love.graphics.rectangle("fill", 0, 72, love.graphics.getWidth(), love.graphics.getHeight() - 72)

  love.graphics.setColor(1, 1, 1)
  love.graphics.print("Session Replay Example", 18, 16)
  love.graphics.setColor(0.72, 0.78, 0.86)
  love.graphics.print("Tab scene   F5 record   F6 stop/load   F7 replay   R reset   Esc quit", 18, 40)
  love.graphics.print("Active scene: " .. activeName, 650, 40)

  activeScene().draw()

  local status = DEBUGGER and "connected to Feather runtime" or "DEBUGGER not available"
  setColor(DEBUGGER and { 0.35, 1, 0.58 } or { 1, 0.36, 0.36 })
  love.graphics.print(status, 18, love.graphics.getHeight() - 32)
end
