local PluginE2EHelper = require("e2e.plugins.helper")

return PluginE2EHelper.createSmokeSuite("session-replay", {
  run = function(context)
    local replay = context.pluginRecord.instance
    local assertEqual = context.assertEqual
    local assertTruthy = context.assertTruthy
    local restored = {}
    local player = { x = 1, y = 2 }

    assertTruthy(replay, "session replay plugin instance is available")

    replay:registerState("player", function()
      return { x = player.x, y = player.y }
    end, function(state)
      restored[#restored + 1] = state
      player.x = state.x
      player.y = state.y
    end)

    replay:startRecording({ id = "session-replay-e2e" })
    assertTruthy(
      love.filesystem.getInfo("feather_replays/session-replay-e2e/inputs.jsonl"),
      "session replay pre-creates the input stream when recording starts"
    )
    assertTruthy(
      love.filesystem.getInfo("feather_replays/session-replay-e2e/state-0001.jsonl"),
      "session replay pre-creates the state stream when recording starts"
    )
    assertEqual(#replay.checkpoints, 1, "session replay only creates the initial checkpoint by default")
    replay:recordState("player", { x = 1, y = 2 }, { keyframe = true })
    replay:recordState("player", { x = 1, y = 2 })
    player.x = 5
    player.y = 6
    local checkpointId = replay:recordCheckpoint("midpoint")
    assertTruthy(checkpointId, "session replay creates a manual checkpoint")
    assertTruthy(
      love.filesystem.getInfo("feather_replays/session-replay-e2e/checkpoints.jsonl"),
      "session replay pre-creates the checkpoint index"
    )
    assertTruthy(
      love.filesystem.getInfo("feather_replays/session-replay-e2e/checkpoints/" .. checkpointId .. ".json"),
      "session replay writes checkpoint state files"
    )
    player.x = 3
    player.y = 4
    replay:recordState("player", { x = 3, y = 4 })
    love.keypressed("space", "space", false)
    replay:stopRecording()

    assertEqual(#replay.stateEvents, 2, "session replay stores sparse state deltas")
    assertEqual(#replay.initialStates, 1, "session replay captures an initial baseline state")
    assertEqual(#replay.checkpoints, 2, "session replay tracks initial and manual checkpoints")
    assertEqual(#replay.inputEvents, 1, "session replay records input events")

    player.x = 99
    player.y = 99
    local ok = replay:startReplay("feather_replays/session-replay-e2e")
    assertEqual(ok, true, "session replay starts from saved files")
    assertEqual(player.x, 1, "session replay restores the initial baseline before playback")
    local blockedId = replay:startRecording({ id = "should-not-start" })
    assertEqual(blockedId, nil, "session replay does not start a new recording while replaying")
    assertEqual(replay.recording, false, "session replay stays out of recording mode during playback")
    replay:stopReplay()
    player.x = 99
    player.y = 99
    local seekOk = replay:seekReplay(checkpointId)
    assertEqual(seekOk, true, "session replay can seek to a manual checkpoint")
    assertEqual(player.x, 5, "session replay restores checkpoint state when seeking")
    seekOk = replay:seekReplay(0)
    assertEqual(seekOk, true, "session replay can seek to the initial checkpoint")
    assertEqual(player.x, 1, "session replay restores initial checkpoint when seeking to zero")
    seekOk = replay:seekReplay(999)
    assertEqual(seekOk, true, "session replay can seek forward from the nearest checkpoint")
    assertEqual(player.x, 3, "session replay fast-forwards state events after seeking")
    replay:startReplay("feather_replays/session-replay-e2e")
    replay:update(0.016, context.feather)
    replay.replayStart = replay.replayStart - 10
    replay:update(0.016, context.feather)

    assertTruthy(#restored >= 3, "session replay restores initial baseline, checkpoints, and recorded state events")
    assertEqual(player.x, 3, "session replay applies latest restored state")
  end,
})
