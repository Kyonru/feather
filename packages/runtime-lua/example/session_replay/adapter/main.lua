local game = require("game_state")
local replay = require("dev.replay")

function love.load()
  love.graphics.setFont(love.graphics.newFont(14))
  game.reset("Adapter demo ready", game.world.seed)
  replay.register()
  game.addEvent("Replay adapter registered from dev/replay.lua")
end

function love.update(dt)
  game.update(dt)
end

function love.keypressed(key)
  if key == "f5" then
    local id, err = replay.start()
    game.addEvent(id and "Recording started with adapter baseline" or ("Could not start recording: " .. tostring(err)))
  elseif key == "f6" then
    replay.stop()
    game.addEvent("Recording stopped and loaded")
  elseif key == "f7" then
    game.reset("Replay baseline changed before playback")
    replay.play()
    game.addEvent("Replay started through adapter")
  elseif key == "r" then
    game.reset("New seeded run")
    game.addEvent("Manual reset")
  elseif key == "escape" then
    if DEBUGGER then
      DEBUGGER:finish()
    end
    love.event.quit()
  end
end

function love.draw()
  game.draw()
end
