local PluginE2EHelper = require("e2e.plugins.helper")

local function countMap(map)
  local count = 0
  for _ in pairs(map or {}) do
    count = count + 1
  end
  return count
end

local function makeFakeFeel()
  local feel = {
    registry = {},
    plays = {},
    clears = {},
    updates = 0,
  }

  function feel.define(name, sequence)
    feel.registry[name] = sequence
    return sequence
  end

  function feel.get(name)
    return feel.registry[name]
  end

  function feel.play(nameOrSequence, target, opts)
    local sequence = type(nameOrSequence) == "table" and nameOrSequence or feel.registry[nameOrSequence] or {}
    local ctx = {
      target = target,
      trigger = opts and opts.trigger or "manual",
      runner = {
        sequence = sequence,
        index = 1,
        tweens = { { duration = 0.1 } },
      },
    }
    feel.plays[#feel.plays + 1] = {
      source = nameOrSequence,
      target = target,
      opts = opts,
      ctx = ctx,
    }

    if opts and opts.emit then
      opts.emit({ kind = "spark", payload = { count = 3 } }, ctx)
    end
    if opts and opts.audio then
      opts.audio({ cue = "hit" }, ctx)
    end
    if opts and opts.log then
      opts.log("played", ctx)
    end

    return ctx
  end

  function feel.update(dt)
    feel.updates = feel.updates + (dt or 0)
    for _, play in ipairs(feel.plays) do
      if play.ctx and play.ctx.runner then
        play.ctx.runner.cancelled = true
      end
    end
  end

  function feel.clear(target)
    feel.clears[#feel.clears + 1] = target or "__all"
  end

  return feel
end

return PluginE2EHelper.createSmokeSuite("feel-inspector", {
  run = function(context)
    local assertEqual = context.assertEqual
    local assertTruthy = context.assertTruthy
    local feather = context.feather
    local plugin = context.pluginRecord.instance

    local emptyPayload = plugin:handleRequest({}, feather)
    assertEqual(emptyPayload.type, "ui", "feel inspector renders without feel.lua attached")
    assertTruthy(emptyPayload.tree, "feel inspector empty state includes UI tree")

    local feel = makeFakeFeel()
    local target = { values = { scale = 1, alpha = 0.5 } }
    local emitted = 0
    local audio = 0
    local logged = 0

    plugin:attachFeel("main", feel)
    plugin:addTarget("button", function()
      return target
    end)
    plugin:attachAdapter("love", function()
      return {
        camera = { x = 4, y = 8, scale = 1.5 },
        shake = { amount = 2 },
        flash = { alpha = 0.25 },
        fade = { alpha = 0.1 },
        soundEntries = { hit = {} },
        particleEntries = { spark = {} },
        shaderEntries = { glow = {} },
        post = {
          effects = {
            bloom = { enabled = true, target = { values = { intensity = 0.7 } } },
          },
        },
      }
    end)

    feel.define("button.press", {
      { kind = "emit" },
      { kind = "wait" },
      { kind = "tween" },
    })

    feel.play("button.press", target, {
      trigger = "test",
      emit = function()
        emitted = emitted + 1
      end,
      audio = function()
        audio = audio + 1
      end,
      log = function()
        logged = logged + 1
      end,
    })

    assertEqual(countMap(plugin.feelModules.main.sequences), 1, "feel inspector records definitions after attach")
    assertEqual(countMap(plugin.feelModules.main.contexts), 1, "feel inspector records active play contexts")
    assertEqual(#plugin.events, 3, "feel inspector records emit/audio/log events")
    assertEqual(emitted, 1, "wrapped emit handler preserves user callback")
    assertEqual(audio, 1, "wrapped audio handler preserves user callback")
    assertEqual(logged, 1, "wrapped log handler preserves user callback")

    local attachedPayload = plugin:handleRequest({}, feather)
    assertEqual(attachedPayload.type, "ui", "feel inspector renders attached module UI")
    assertTruthy(attachedPayload.tree, "feel inspector attached state includes UI tree")

    feel.update(0.1)
    assertEqual(countMap(plugin.feelModules.main.contexts), 0, "feel inspector prunes finished contexts after update")

    plugin:handleActionRequest({ params = { action = "play|main|button.press|button" } })
    assertEqual(#feel.plays, 2, "feel inspector can replay a named sequence against a registered target")
    assertEqual(feel.plays[#feel.plays].opts.trigger, "feather", "feel inspector replay marks trigger")

    plugin:handleActionRequest({ params = { action = "clear-target|button" } })
    assertEqual(feel.clears[#feel.clears], target, "feel inspector clear-target uses registered target")

    plugin:handleActionRequest({ params = { action = "clear-events" } })
    assertEqual(#plugin.events, 0, "feel inspector clears event history")

    plugin:handleActionRequest({ params = { action = "clear-all" } })
    assertEqual(feel.clears[#feel.clears], "__all", "feel inspector clear-all calls feel.clear()")

    assertEqual(countMap(plugin.adapters), 1, "feel inspector tracks attached LOVE adapter")
  end,
})
