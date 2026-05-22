local game = require("game_state")

local M = {}

local STREAM = "adapter_demo"

function M.register(debugger)
  debugger = debugger or rawget(_G, "DEBUGGER")
  if not (debugger and debugger.replayRegister) then
    return false
  end

  debugger:replayRegister(STREAM, game.captureReplayState, game.restoreReplayState, {
    sampleInterval = 0.1,
  })
  return true
end

function M.start(debugger, opts)
  debugger = debugger or rawget(_G, "DEBUGGER")
  if not (debugger and debugger.startSessionReplay) then
    return nil, "DEBUGGER is not available"
  end

  opts = opts or {}
  opts.initialStates = opts.initialStates or {}
  opts.initialStates[STREAM] = opts.initialStates[STREAM] or game.captureReplayState()
  return debugger:startSessionReplay(opts)
end

function M.stop(debugger)
  debugger = debugger or rawget(_G, "DEBUGGER")
  if not (debugger and debugger.stopSessionReplay) then
    return nil
  end
  return debugger:stopSessionReplay()
end

function M.play(debugger, idOrPath)
  debugger = debugger or rawget(_G, "DEBUGGER")
  if not (debugger and debugger.playSessionReplay) then
    return nil
  end
  return debugger:playSessionReplay(idOrPath)
end

M.capture = game.captureReplayState
M.restore = game.restoreReplayState

return M
