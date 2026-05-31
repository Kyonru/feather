local PluginE2EHelper = require("e2e.plugins.helper")

local function contains(haystack, needle)
  return haystack:find(needle, 1, true) ~= nil
end

return PluginE2EHelper.createSmokeSuite("particle-system-playground", {
  run = function(context)
    local plugin = context.pluginRecord.instance
    local feather = context.feather
    local assertEqual = context.assertEqual
    local assertTruthy = context.assertTruthy

    assertTruthy(
      feather:__isSuspendedCommandAllowed({
        type = "cmd:plugin:action",
        plugin = "particle-system-playground",
        action = "runtime-preview",
        params = { active = false },
      }),
      "particle playground runtime preview clear is allowed while Feather is suspended"
    )
    assertTruthy(
      feather:__isSuspendedCommandAllowed({
        type = "cmd:plugin:action",
        plugin = "shader-graph",
        action = "clear-preview",
        params = {},
      }),
      "shader graph clear preview is allowed while Feather is suspended"
    )
    assertTruthy(
      not feather:__isSuspendedCommandAllowed({
        type = "cmd:plugin:action",
        plugin = "particle-system-playground",
        action = "runtime-preview",
        params = { active = true },
      }),
      "particle playground runtime preview start is blocked while Feather is suspended"
    )

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Export Format",
        template = "fire",
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-shader",
        composite = "Export Format",
        systemIndex = 1,
        filename = "test-particle-shader.glsl",
        shaderSource = "vec4 effect(vec4 color, Image tex, vec2 texture_coords, vec2 screen_coords) { return Texel(tex, texture_coords) * color; }",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Export Format",
        systemIndex = 1,
        enabled = false,
      },
    })

    local result = plugin:handleActionRequest({
      params = {
        action = "export-code",
        composite = "Export Format",
      },
    })
    local code = result and result.exportCode or ""

    assertTruthy(contains(code, "local function init()"), "particle playground export includes init lifecycle")
    assertTruthy(contains(code, "local function update(dt)"), "particle playground export includes update lifecycle")
    assertTruthy(contains(code, "local function draw()"), "particle playground export includes draw lifecycle")
    assertTruthy(contains(code, "local function play(payload)"), "particle playground export includes payload play lifecycle")
    assertTruthy(contains(code, "local function emit(payload)"), "particle playground export includes payload emit lifecycle")
    assertTruthy(contains(code, "local function pause()"), "particle playground export includes pause lifecycle")
    assertTruthy(contains(code, "local function stop(resetParticles)"), "particle playground export includes stop lifecycle")
    assertTruthy(contains(code, "local function setMode(mode)"), "particle playground export includes mode override helper")
    assertTruthy(contains(code, "local function getMode()"), "particle playground export includes mode getter")
    assertTruthy(contains(code, "local function setLoop(loop)"), "particle playground export includes loop override helper")
    assertTruthy(contains(code, "release = function()"), "particle playground export includes release lifecycle")
    assertTruthy(contains(code, "local activeInstances = {}"), "particle playground export supports overlapping timeline instances")
    assertTruthy(contains(code, "local pooledInstances = {}"), "particle playground export pools finished timeline instances")
    assertTruthy(contains(code, "local function createInstance()"), "particle playground export clones particle systems per play")
    assertTruthy(contains(code, "local function checkoutInstance(payload)"), "particle playground export checks out a timeline instance per play")
    assertTruthy(contains(code, "pooledInstances[#pooledInstances + 1] = instance"), "particle playground export prewarms the first pooled instance")
    assertTruthy(contains(code, "local timeline = {"), "particle playground export includes timeline data")
    assertTruthy(contains(code, "easing = "), "particle playground export preserves keyframe easing names")
    assertTruthy(
      contains(code, "local timelineState = { time = 0, playing = false, mode = nil, loop = nil, directionOffset = 0 }"),
      "particle playground export includes timeline play state"
    )
    assertTruthy(contains(code, "local function applyTimeline(instance, time, allowEmission)"), "particle playground export includes timeline evaluator")
    assertTruthy(contains(code, "local TimelineRuntime = (function()"), "particle playground export embeds shared timeline runtime")
    assertTruthy(contains(code, "function Runtime.easeTimelineValue"), "particle playground export includes shared easing evaluator")
    assertTruthy(contains(code, "function Runtime.clipAllowsEmission"), "particle playground export includes lifetime-aware clip emission")
    assertTruthy(contains(code, "local function clipBurstCount"), "particle playground export includes authored clip bursts")
    assertTruthy(contains(code, "TimelineRuntime.applyTimelineToEmitter"), "particle playground export applies timeline through shared runtime")
    assertTruthy(contains(code, "local function emitTimelineStartsForAdvance"), "particle playground export preserves timeline tails across loop wraps")
    assertTruthy(contains(code, "timelineShouldLoop(instance)"), "particle playground export supports per-play loop overrides")
    assertTruthy(contains(code, "validMode(payload.mode)"), "particle playground export lets mode override saved behavior")
    assertTruthy(contains(code, "if type(payload.loop) == \"boolean\" then"), "particle playground export preserves explicit false loop overrides")
    assertTruthy(contains(code, "instance.mode = payload.loop and \"loop\" or \"one-shot\""), "particle playground export maps legacy loop payloads to modes")
    assertTruthy(not contains(code, "timelineState.amount"), "particle playground export does not scale authored timeline bursts from payload")
    assertTruthy(not contains(code, "payload.amount"), "particle playground export payload does not define timeline intensity")
    assertTruthy(contains(code, "instance.directionOffset = tonumber(payload.r) or 0"), "particle playground export supports payload direction offset")
    assertTruthy(not contains(code, "emitter.system:setDirection(r)"), "particle playground export does not overwrite authored emitter directions")
    assertTruthy(contains(code, "return checkoutInstance(payload)"), "particle playground export plays independent timeline instances")
    assertTruthy(contains(code, "return play(payload)"), "particle playground export keeps emit as a play alias")
    assertTruthy(contains(code, "setMode = setMode"), "particle playground export exposes mode override helper")
    assertTruthy(contains(code, "getMode = getMode"), "particle playground export exposes resolved mode")
    assertTruthy(contains(code, "setLoop = setLoop"), "particle playground export exposes loop override helper")
    assertTruthy(contains(code, "isLooping = timelineShouldLoop"), "particle playground export exposes resolved loop state")
    assertTruthy(contains(code, "emitter.system:start()"), "particle playground export restarts delayed timeline clips")
    assertTruthy(contains(code, "base.emitterLifetime"), "particle playground export preserves emitter lifetime during timeline playback")
    assertTruthy(
      not contains(code, "      emitter.system:setEmitterLifetime(-1)"),
      "particle playground export no longer forces timeline emitter lifetime to infinite"
    )
    assertTruthy(contains(code, "---@class ParticlePayload"), "particle playground export documents ParticlePayload")
    assertTruthy(contains(code, "LG.newImage("), "particle playground export loads texture assets")
    assertTruthy(contains(code, ':setFilter("linear", "linear")'), "particle playground export uses linear texture filtering")
    assertTruthy(contains(code, "local function compileShader(name, source)"), "particle playground export compiles embedded shaders through helper")
    assertTruthy(contains(code, "local shader1Raw = ["), "particle playground export embeds shader source")
    assertTruthy(contains(code, "vec4 effect(vec4 color"), "particle playground export includes shader source body")
    assertTruthy(contains(code, "local shader1 = compileShader("), "particle playground export assigns shader from embedded source")
    assertTruthy(not contains(code, "love.filesystem.read"), "particle playground export avoids runtime shader file reads")
    assertTruthy(contains(code, "enabled = false"), "particle playground export includes disabled emitter state")
    assertTruthy(contains(code, "if emitter.enabled and emitter.system"), "particle playground export skips disabled emitters")
    assertTruthy(
      not contains(code, "LG.newShader(love.filesystem.read("),
      "particle playground export avoids direct multi-return shader reads"
    )
    assertTruthy(contains(code, ":setParticleLifetime("), "particle playground export includes particle setters")
    assertTruthy(not contains(code, "particles[1] = {system = "), "particle playground export avoids old table-only shape")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Export Timeline Base",
        template = "fire",
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-timeline",
        composite = "Export Timeline Base",
        timeline = {
          duration = 1,
          loop = false,
          tracks = {
            {
              systemIndex = 1,
              clips = { { id = "clip", start = 0, ["end"] = 1, emit = 0 } },
              lanes = {},
            },
          },
        },
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Export Timeline Base",
        command = "seek",
        time = 0.5,
      },
    })
    local mutedSystem = plugin:_getSystemEntry("Export Timeline Base", 1).system
    assertEqual(mutedSystem:getEmissionRate(), 0, "particle timeline seek mutes the live system before export")
    local mutedResult = plugin:handleActionRequest({
      params = {
        action = "export-code",
        composite = "Export Timeline Base",
      },
    })
    local mutedCode = mutedResult and mutedResult.exportCode or ""
    assertTruthy(
      contains(mutedCode, ":setEmissionRate(100)"),
      "particle playground export uses saved base emission rate instead of muted timeline state"
    )
    assertTruthy(
      contains(mutedCode, "base = { emissionRate = 100"),
      "particle playground export base metadata uses saved timeline base rate"
    )

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Composite Controls",
        template = "explosion",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Composite Controls",
        systemIndex = 2,
        enabled = false,
      },
    })

    local system1 = plugin:_getSystemEntry("Composite Controls", 1).system
    local system2 = plugin:_getSystemEntry("Composite Controls", 2).system
    system1:emit(5)
    system2:emit(5)
    local disabledBeforeReset = system2:getCount()

    plugin:handleActionRequest({
      params = {
        action = "reset",
        composite = "Composite Controls",
      },
    })
    assertEqual(system1:getCount(), 0, "particle playground reset affects enabled emitters")
    assertEqual(system2:getCount(), disabledBeforeReset, "particle playground reset skips disabled emitters")

    plugin:handleActionRequest({
      params = {
        action = "emit",
        composite = "Composite Controls",
        count = 7,
      },
    })
    assertEqual(system1:getCount(), 7, "particle playground emit replays enabled emitters from fresh state")
    assertEqual(system2:getCount(), disabledBeforeReset, "particle playground emit skips disabled emitters")

    local beforeX, beforeY = system1:getPosition()
    plugin:handleParamsUpdate({
      params = {
        composite = "Composite Controls",
        previewEnabled = false,
        compositeX = 123,
        compositeY = 234,
      },
    })
    plugin:update(1 / 60)
    local pausedX, pausedY = system1:getPosition()
    assertEqual(pausedX, beforeX, "particle playground preview pause keeps emitter x unchanged")
    assertEqual(pausedY, beforeY, "particle playground preview pause keeps emitter y unchanged")

    plugin:handleParamsUpdate({
      params = {
        composite = "Composite Controls",
        previewEnabled = true,
      },
    })
    plugin:update(1 / 60)
    local idleX, idleY = system1:getPosition()
    assertEqual(idleX, beforeX, "particle playground preview stays dormant until the page activates it")
    assertEqual(idleY, beforeY, "particle playground preview dormant state keeps emitter y unchanged")

    plugin:handleActionRequest({
      params = {
        action = "runtime-preview",
        composite = "Composite Controls",
        active = true,
      },
    })
    plugin:update(1 / 60)
    local resumedX, resumedY = system1:getPosition()
    assertEqual(resumedX, 123, "particle playground active runtime preview updates emitter x")
    assertEqual(resumedY, 234, "particle playground active runtime preview updates emitter y")

    plugin:handleActionRequest({
      params = {
        action = "runtime-preview",
        composite = "Composite Controls",
        active = false,
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Composite Controls",
        compositeX = 345,
        compositeY = 456,
      },
    })
    plugin:update(1 / 60)
    local stoppedX, stoppedY = system1:getPosition()
    assertEqual(stoppedX, resumedX, "particle playground runtime preview inactive stops scratch updates")
    assertEqual(stoppedY, resumedY, "particle playground runtime preview inactive stops scratch y updates")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Suspended Preview",
        template = "fire",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Suspended Preview",
        previewEnabled = true,
        compositeX = 211,
        compositeY = 322,
        systemIndex = 1,
        emitAtStart = 6,
        particleLifetimeMin = 1,
        particleLifetimeMax = 1,
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "runtime-preview",
        composite = "Suspended Preview",
        active = true,
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Suspended Preview",
        command = "play",
      },
    })
    local suspendedSystem = plugin:_getSystemEntry("Suspended Preview", 1).system
    feather.runtimeSuspended = true
    feather.pluginManager:updateSuspended(0.1, feather)
    local suspendedX, suspendedY = suspendedSystem:getPosition()
    assertEqual(suspendedX, 211, "particle active preview updates x from the suspended runtime lane")
    assertEqual(suspendedY, 322, "particle active preview updates y from the suspended runtime lane")
    assertTruthy(suspendedSystem:getCount() > 0, "particle active preview keeps emitting while Feather is suspended")
    assertTruthy(
      plugin.composites["Suspended Preview"].timelineState.time > 0,
      "particle active preview timeline advances while Feather is suspended"
    )

    plugin:handleActionRequest({
      params = {
        action = "runtime-preview",
        composite = "Suspended Preview",
        active = false,
      },
    })
    local suspendedCount = suspendedSystem:getCount()
    feather.pluginManager:updateSuspended(0.1, feather)
    assertEqual(
      suspendedSystem:getCount(),
      suspendedCount,
      "particle inactive preview does no suspended-lane particle update work"
    )
    feather.runtimeSuspended = false

    plugin:handleParamsUpdate({
      params = {
        composite = "Composite Controls",
        systemIndex = 1,
        spinMin = 0.1,
      },
    })
    local snapshot = plugin:handleRequest()
    assertEqual(
      snapshot.data.systems[1].properties.spinMin,
      0.1,
      "particle playground snapshots round float precision noise"
    )

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Timeline Playback",
        template = "fire",
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-timeline",
        composite = "Timeline Playback",
        timeline = {
          duration = 1,
          loop = true,
          tracks = {
            {
              systemIndex = 1,
              clips = { { id = "clip", start = 0, ["end"] = 1, emit = 4 } },
              lanes = {
                emissionRate = {
                  { id = "rate-a", time = 0, value = 10 },
                  { id = "rate-b", time = 1, value = 20 },
                },
                opacity = {
                  { id = "alpha-a", time = 0, value = 0, easing = "outQuad" },
                  { id = "alpha-b", time = 1, value = 1 },
                },
              },
            },
          },
        },
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Timeline Playback",
        command = "seek",
        time = 0.5,
      },
    })
    local timelineSystem = plugin:_getSystemEntry("Timeline Playback", 1)
    assertEqual(timelineSystem.system:getEmissionRate(), 0, "particle timeline seek mutes paused continuous emission")
    assertEqual(timelineSystem._timelineOpacity, 0.75, "particle timeline seek evaluates eased non-emission keyframes")
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Timeline Playback",
        command = "play",
      },
    })
    plugin:update(0.75)
    local timelineSnapshot = plugin:handleRequest()
    assertTruthy(
      timelineSnapshot.data.timelineState.time < 1,
      "particle timeline looping wraps preview time"
    )

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Timeline Restart",
        template = "fire",
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-timeline",
        composite = "Timeline Restart",
        timeline = {
          duration = 1,
          loop = false,
          tracks = {
            {
              systemIndex = 1,
              clips = { { id = "restart", start = 0, ["end"] = 0.3, emit = 0 } },
              lanes = {},
            },
          },
        },
      },
    })
    local restartSystem = plugin:_getSystemEntry("Timeline Restart", 1).system
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Timeline Restart",
        command = "play",
      },
    })
    plugin:update(0.5)
    assertEqual(restartSystem:getEmissionRate(), 0, "particle timeline clip stop mutes continuous emission")
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Timeline Restart",
        command = "stop",
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Timeline Restart",
        command = "play",
      },
    })
    plugin:update(0.1)
    assertEqual(restartSystem:getEmissionRate(), 100, "particle timeline stop then play restores base emission rate")
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Timeline Restart",
        command = "seek",
        time = 0,
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Timeline Restart",
        command = "play",
      },
    })
    plugin:update(0.1)
    assertEqual(restartSystem:getEmissionRate(), 100, "particle timeline reset playhead then play restores base emission rate")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Preset Playback",
        template = "fire",
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "runtime-preview",
        composite = "Preset Playback",
        active = true,
      },
    })
    local presetSystem = plugin:_getSystemEntry("Preset Playback", 1).system
    assertEqual(presetSystem:getEmissionRate(), 0, "particle timeline preview mutes paused continuous emission")
    plugin:handleParamsUpdate({
      params = {
        composite = "Preset Playback",
        systemIndex = 1,
        direction = 4.712,
        spread = 6.283,
        speedMin = 200,
        speedMax = 700,
        radialAccelMin = 100,
        radialAccelMax = 300,
        tangentialAccelMin = 0,
        tangentialAccelMax = 30,
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Preset Playback",
        command = "play",
      },
    })
    plugin:update(0.1)
    assertEqual(
      presetSystem:getEmissionRate(),
      100,
      "particle timeline preserves base emission after applying a motion preset while paused"
    )

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Emitter Lifetime Clip",
        template = "fire",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Emitter Lifetime Clip",
        systemIndex = 1,
        emissionRate = 120,
        emitterLifetime = 0.2,
        particleLifetimeMin = 1.5,
        particleLifetimeMax = 1.5,
        emitAtStart = 12,
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-timeline",
        composite = "Emitter Lifetime Clip",
        timeline = {
          duration = 1,
          loop = false,
          tracks = {
            {
              systemIndex = 1,
              clips = { { id = "lifetime", start = 0, ["end"] = 0.8, emit = 12 } },
              lanes = {},
            },
          },
        },
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Emitter Lifetime Clip",
        command = "seek",
        time = 0,
      },
    })
    local lifetimeSystem = plugin:_getSystemEntry("Emitter Lifetime Clip", 1).system
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Emitter Lifetime Clip",
        command = "play",
      },
    })
    plugin:update(0.05)
    assertEqual(lifetimeSystem:getEmissionRate(), 120, "particle timeline emits while finite emitter lifetime is active")
    plugin:update(0.2)
    assertEqual(lifetimeSystem:getEmissionRate(), 0, "particle timeline finite emitter lifetime stops emission before Stop At")
    assertTruthy(lifetimeSystem:getCount() > 0, "particle timeline finite emitter lifetime preserves particle-life tails")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Infinite Lifetime Clip",
        template = "fire",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Infinite Lifetime Clip",
        systemIndex = 1,
        emissionRate = 80,
        emitterLifetime = -1,
        particleLifetimeMin = 1.2,
        particleLifetimeMax = 1.2,
        emitAtStart = 8,
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-timeline",
        composite = "Infinite Lifetime Clip",
        timeline = {
          duration = 1,
          loop = false,
          tracks = {
            {
              systemIndex = 1,
              clips = { { id = "infinite", start = 0, ["end"] = 0.6, emit = 8 } },
              lanes = {},
            },
          },
        },
      },
    })
    local infiniteSystem = plugin:_getSystemEntry("Infinite Lifetime Clip", 1).system
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Infinite Lifetime Clip",
        command = "play",
      },
    })
    plugin:update(0.45)
    assertEqual(infiniteSystem:getEmissionRate(), 80, "particle timeline infinite emitter lifetime emits through the clip")
    plugin:update(0.2)
    assertEqual(infiniteSystem:getEmissionRate(), 0, "particle timeline Stop At still stops infinite emitter lifetime clips")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Stop At Wins",
        template = "fire",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Stop At Wins",
        systemIndex = 1,
        emissionRate = 90,
        emitterLifetime = 2,
        particleLifetimeMin = 1.1,
        particleLifetimeMax = 1.1,
        emitAtStart = 9,
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-timeline",
        composite = "Stop At Wins",
        timeline = {
          duration = 1,
          loop = false,
          tracks = {
            {
              systemIndex = 1,
              clips = { { id = "stop", start = 0, ["end"] = 0.15, emit = 9 } },
              lanes = {},
            },
          },
        },
      },
    })
    local stopWinsSystem = plugin:_getSystemEntry("Stop At Wins", 1).system
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Stop At Wins",
        command = "play",
      },
    })
    plugin:update(0.05)
    assertEqual(stopWinsSystem:getEmissionRate(), 90, "particle timeline emits before Stop At with long emitter lifetime")
    plugin:update(0.2)
    assertEqual(stopWinsSystem:getEmissionRate(), 0, "particle timeline Stop At caps emission before long emitter lifetime")
    assertTruthy(stopWinsSystem:getCount() > 0, "particle timeline Stop At preserves particle-life tails")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Loop Tail",
        template = "fire",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Loop Tail",
        systemIndex = 1,
        emitterLifetime = 0.08,
        particleLifetimeMin = 2.5,
        particleLifetimeMax = 2.5,
        emitAtStart = 8,
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-timeline",
        composite = "Loop Tail",
        timeline = {
          duration = 1,
          loop = true,
          tracks = {
            {
              systemIndex = 1,
              clips = { { id = "tail", start = 0.8, ["end"] = 0.9, emit = 8 } },
              lanes = {},
            },
          },
        },
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Loop Tail",
        command = "seek",
        time = 0,
      },
    })
    local tailSystem = plugin:_getSystemEntry("Loop Tail", 1).system
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Loop Tail",
        command = "play",
      },
    })
    plugin:update(0.81)
    assertTruthy(tailSystem:getCount() > 0, "particle loop tail emits near the cycle end")
    plugin:update(0.25)
    local tailCountAfterWrap = tailSystem:getCount()
    assertTruthy(tailCountAfterWrap > 0, "particle loop tail survives across wrap")
    plugin:update(0.74)
    assertTruthy(tailSystem:getCount() > tailCountAfterWrap, "particle loop tail overlaps the next cycle emission")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Delayed Loop Clip",
        template = "muzzle-flash",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Delayed Loop Clip",
        systemIndex = 1,
        emitterLifetime = 0.05,
        emitAtStart = 6,
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-timeline",
        composite = "Delayed Loop Clip",
        timeline = {
          duration = 1,
          loop = true,
          tracks = {
            {
              systemIndex = 1,
              clips = { { id = "delayed", start = 0.5, ["end"] = 0.8, emit = 6 } },
              lanes = {},
            },
          },
        },
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Delayed Loop Clip",
        command = "seek",
        time = 0,
      },
    })
    local delayedSystem = plugin:_getSystemEntry("Delayed Loop Clip", 1).system
    assertEqual(delayedSystem:getCount(), 0, "particle delayed timeline clip starts empty after seek")
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Delayed Loop Clip",
        command = "play",
      },
    })
    plugin:update(0.49)
    assertEqual(delayedSystem:getCount(), 0, "particle delayed timeline clip does not emit before its offset")
    plugin:update(0.02)
    assertTruthy(delayedSystem:getCount() > 0, "particle delayed timeline clip emits at its offset")
    plugin:update(0.51)
    assertEqual(delayedSystem:getCount(), 0, "particle delayed timeline clip naturally expires after its short particle life")
    plugin:update(0.5)
    assertTruthy(delayedSystem:getCount() > 0, "particle delayed timeline clip emits again after loop wrap")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Ambient Continuous",
        template = "snowfall",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Ambient Continuous",
        systemIndex = 1,
        emissionRate = 80,
        emitterLifetime = -1,
        particleLifetimeMin = 2,
        particleLifetimeMax = 2,
        emitAtStart = 0,
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-timeline",
        composite = "Ambient Continuous",
        timeline = {
          duration = 0.25,
          mode = "ambient",
          loop = false,
          tracks = {
            {
              systemIndex = 1,
              clips = { { id = "ambient", start = 0, ["end"] = 0.08, emit = 0 } },
              lanes = {},
            },
          },
        },
      },
    })
    local ambientSystem = plugin:_getSystemEntry("Ambient Continuous", 1).system
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Ambient Continuous",
        command = "play",
      },
    })
    plugin:update(0.3)
    local ambientSnapshot = plugin:handleRequest()
    assertEqual(ambientSnapshot.data.timeline.mode, "ambient", "particle ambient timeline keeps its mode")
    assertEqual(ambientSnapshot.data.timeline.loop, false, "particle ambient timeline keeps loop compatibility false")
    assertEqual(ambientSnapshot.data.timelineState.time, 0.25, "particle ambient timeline holds at duration")
    assertEqual(ambientSnapshot.data.timelineState.playing, true, "particle ambient timeline keeps playing while held")
    assertEqual(ambientSystem:getEmissionRate(), 80, "particle ambient infinite lifetime keeps continuous emission after duration")
    assertTruthy(ambientSystem:getCount() > 0, "particle ambient infinite lifetime continues emitting particles")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Ambient Burst Once",
        template = "snowfall",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Ambient Burst Once",
        systemIndex = 1,
        emissionRate = 0,
        emitterLifetime = -1,
        particleLifetimeMin = 2,
        particleLifetimeMax = 2,
        emitAtStart = 7,
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-timeline",
        composite = "Ambient Burst Once",
        timeline = {
          duration = 0.2,
          mode = "ambient",
          tracks = {
            {
              systemIndex = 1,
              clips = { { id = "burst-once", start = 0, ["end"] = 0.05, emit = 7 } },
              lanes = {},
            },
          },
        },
      },
    })
    local ambientBurstSystem = plugin:_getSystemEntry("Ambient Burst Once", 1).system
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Ambient Burst Once",
        command = "play",
      },
    })
    plugin:update(0.25)
    local ambientBurstCount = ambientBurstSystem:getCount()
    plugin:update(0.25)
    assertEqual(ambientBurstCount, 7, "particle ambient timeline fires clip bursts once")
    assertEqual(ambientBurstSystem:getCount(), ambientBurstCount, "particle ambient timeline does not reschedule bursts at duration")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Ambient Finite",
        template = "snowfall",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Ambient Finite",
        systemIndex = 1,
        emissionRate = 70,
        emitterLifetime = 0.08,
        particleLifetimeMin = 1.5,
        particleLifetimeMax = 1.5,
        emitAtStart = 0,
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-timeline",
        composite = "Ambient Finite",
        timeline = {
          duration = 0.3,
          mode = "ambient",
          tracks = {
            {
              systemIndex = 1,
              clips = { { id = "ambient-finite", start = 0, ["end"] = 0.25, emit = 0 } },
              lanes = {},
            },
          },
        },
      },
    })
    local ambientFiniteSystem = plugin:_getSystemEntry("Ambient Finite", 1).system
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Ambient Finite",
        command = "play",
      },
    })
    plugin:update(0.05)
    assertEqual(ambientFiniteSystem:getEmissionRate(), 70, "particle ambient finite lifetime starts continuous emission")
    plugin:update(0.12)
    assertEqual(ambientFiniteSystem:getEmissionRate(), 0, "particle ambient finite lifetime stops continuous emission")
    assertTruthy(ambientFiniteSystem:getCount() > 0, "particle ambient finite lifetime keeps particle tails alive")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Complex Template",
        template = "complex-composite",
      },
    })
    local complex = plugin:handleRequest()
    assertEqual(#complex.data.systems, 5, "particle complex composite template creates five emitters")
    assertEqual(complex.data.systems[1].title, "Core Pulse", "particle complex composite names the core emitter")
    assertEqual(complex.data.systems[2].title, "Shock Ring", "particle complex composite names the ring emitter")
    assertEqual(complex.data.systems[3].title, "Smoke Bloom", "particle complex composite names the smoke emitter")
    assertEqual(complex.data.systems[4].title, "Spark Trails", "particle complex composite names the spark emitter")
    assertEqual(complex.data.systems[5].title, "Dust Wake", "particle complex composite names the dust emitter")
    assertEqual(complex.data.timeline.duration, 3, "particle complex composite uses the standard three second timeline")
    assertEqual(complex.data.timeline.mode, "one-shot", "particle complex composite is saved as one-shot mode")
    assertEqual(complex.data.timeline.loop, false, "particle complex composite is a one-shot timeline")
    assertEqual(#complex.data.timeline.tracks, 5, "particle complex composite authors one timeline track per emitter")
    assertEqual(complex.data.timeline.tracks[1].clips[1].emit, 140, "particle complex composite starts with a strong core burst")
    assertEqual(complex.data.timeline.tracks[4].clips[1].emit, 180, "particle complex composite adds a spark-trail burst")
    assertEqual(complex.data.timeline.tracks[5].clips[1].start, 0.28, "particle complex composite staggers the dust wake")
    assertEqual(
      complex.data.timeline.tracks[3].lanes.offsetY[2].value,
      -42,
      "particle complex composite lifts the smoke bloom over time"
    )

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Rain Template",
        template = "rainfall",
      },
    })
    local rain = plugin:handleRequest()
    assertEqual(rain.data.timeline.mode, "ambient", "particle rainfall template uses ambient mode")
    assertEqual(rain.data.systems[1].title, "Rain Sheet", "particle rainfall template names the emitter")

    local pausedComplexSystem = plugin:_getSystemEntry("Complex Template", 1).system
    pausedComplexSystem:reset()
    plugin:update(0.2)
    assertEqual(
      pausedComplexSystem:getCount(),
      0,
      "particle paused timeline does not continuously emit from a clip at the playhead"
    )
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Complex Template",
        command = "play",
      },
    })
    plugin:update(0.02)
    assertTruthy(pausedComplexSystem:getCount() > 0, "particle paused timeline resumes emission when played")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Inactive Preview",
        template = "complex-composite",
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "timeline-control",
        composite = "Inactive Preview",
        command = "play",
      },
    })
    local inactiveSystem = plugin:_getSystemEntry("Inactive Preview", 1).system
    inactiveSystem:reset()
    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Active Preview",
        template = "fire",
      },
    })
    plugin:update(0.2)
    assertEqual(inactiveSystem:getCount(), 0, "particle inactive scratch previews do not keep updating in the game loop")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Reorder Timeline",
        template = "explosion",
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-timeline",
        composite = "Reorder Timeline",
        timeline = {
          duration = 3,
          loop = false,
          tracks = {
            {
              systemIndex = 1,
              clips = { { id = "core", start = 0, ["end"] = 0.4, emit = 101 } },
              lanes = {
                opacity = { { id = "core-opacity", time = 0, value = 0.11 } },
              },
            },
            {
              systemIndex = 2,
              clips = { { id = "smoke", start = 0.2, ["end"] = 2.6, emit = 202 } },
              lanes = {
                opacity = { { id = "smoke-opacity", time = 0.2, value = 0.22 } },
              },
            },
            {
              systemIndex = 3,
              clips = { { id = "sparks", start = 0.1, ["end"] = 1.2, emit = 303 } },
              lanes = {
                opacity = { { id = "sparks-opacity", time = 0.1, value = 0.33 } },
              },
            },
          },
        },
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "reorder-system",
        composite = "Reorder Timeline",
        fromIndex = 1,
        toIndex = 3,
      },
    })
    local reordered = plugin:handleRequest()
    assertEqual(reordered.data.systems[3].title, "Core Blast", "particle reorder moves the emitter to the target slot")
    assertEqual(reordered.data.timeline.tracks[1].clips[1].emit, 202, "particle reorder keeps slot 1 timeline with moved smoke emitter")
    assertEqual(reordered.data.timeline.tracks[2].clips[1].emit, 303, "particle reorder keeps slot 2 timeline with moved sparks emitter")
    assertEqual(reordered.data.timeline.tracks[3].clips[1].emit, 101, "particle reorder carries timeline clips with the moved emitter")
    assertEqual(
      reordered.data.timeline.tracks[3].lanes.opacity[1].value,
      0.11,
      "particle reorder carries keyframe lanes with the moved emitter"
    )

    plugin:handleActionRequest({
      params = {
        action = "remove-system",
        composite = "Reorder Timeline",
        systemIndex = 1,
      },
    })
    local removed = plugin:handleRequest()
    assertEqual(removed.data.systems[1].title, "Sparks", "particle remove renumbers remaining emitters")
    assertEqual(removed.data.timeline.tracks[1].clips[1].emit, 303, "particle remove keeps timeline on the surviving emitter")
    assertEqual(removed.data.timeline.tracks[2].clips[1].emit, 101, "particle remove preserves later emitter timeline data")

    plugin:handleActionRequest({
      params = {
        action = "new-composite",
        name = "Project Save",
        template = "explosion",
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Project Save",
        previewEnabled = false,
        compositeX = 321,
        compositeY = 432,
        ["movement.pattern"] = "circle",
        ["movement.radius"] = 88,
      },
    })
    plugin:handleParamsUpdate({
      params = {
        composite = "Project Save",
        systemIndex = 1,
        enabled = false,
        title = "Saved Core",
        blendMode = "add",
        emitterOffsetX = -12,
        particleLifetimeMin = 0.2,
        particleLifetimeMax = 0.4,
        spinMin = -0.1,
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-texture",
        composite = "Project Save",
        systemIndex = 1,
        preset = "star",
      },
    })
    plugin:handleActionRequest({
      params = {
        action = "set-shader",
        composite = "Project Save",
        systemIndex = 1,
        filename = "saved-particle-shader.glsl",
        shaderSource = "vec4 effect(vec4 color, Image tex, vec2 texture_coords, vec2 screen_coords) { return color; }",
      },
    })

    local projectResult = plugin:handleActionRequest({
      params = {
        action = "export-project",
        composite = "Project Save",
      },
    })
    local project = projectResult and projectResult.project
    assertEqual(project.type, "feather.particle-system-playground", "particle project export includes type")
    assertEqual(project.version, 3, "particle project export includes version")
    assertEqual(project.name, "Project Save", "particle project export includes composite name")
    assertEqual(project.composite.x, 321, "particle project export includes composite x")
    assertEqual(project.composite.y, 432, "particle project export includes composite y")
    assertEqual(project.composite.previewEnabled, false, "particle project export includes preview pause")
    assertEqual(project.composite.movement.pattern, "circle", "particle project export includes movement")
    assertEqual(#project.composite.systems, 3, "particle project export includes every emitter")
    assertEqual(project.composite.timeline.duration, 3, "particle project export includes timeline duration")
    assertEqual(project.composite.timeline.mode, "one-shot", "particle project export includes timeline mode")
    assertEqual(#project.composite.timeline.tracks, 3, "particle project export includes emitter tracks")
    assertEqual(project.composite.systems[1].enabled, false, "particle project export includes enabled state")
    assertEqual(project.composite.systems[1].title, "Saved Core", "particle project export includes title")
    assertEqual(project.composite.systems[1].blendMode, "add", "particle project export includes blend mode")
    assertEqual(project.composite.systems[1].x, -12, "particle project export includes emitter offset")
    assertEqual(project.composite.systems[1].texturePreset, "star", "particle project export includes texture preset")
    assertTruthy(
      type(project.composite.systems[1].textureAssetBase64) == "string"
        and #project.composite.systems[1].textureAssetBase64 > 0,
      "particle project export embeds generated texture data"
    )
    assertEqual(
      project.composite.systems[1].shaderSource:find("vec4 effect", 1, true) ~= nil,
      true,
      "particle project export embeds shader source"
    )
    assertEqual(project.composite.systems[1].properties.spinMin, -0.1, "particle project export includes properties")
    assertTruthy(
      projectResult.download and contains(projectResult.download.filename, ".featherparticles"),
      "particle project export includes download metadata"
    )

    local importedResult = plugin:handleActionRequest({
      params = {
        action = "import-project",
        project = project,
      },
    })
    assertEqual(importedResult.composite, "Project Save 2", "particle project import creates deduped scratch composite")
    local imported = plugin:handleRequest()
    assertEqual(imported.activeComposite, "Project Save 2", "particle project import selects imported composite")
    assertEqual(imported.data.compositeType, "scratch", "particle project import creates scratch composite")
    assertEqual(imported.data.x, 321, "particle project import restores composite x")
    assertEqual(imported.data.y, 432, "particle project import restores composite y")
    assertEqual(imported.data.previewEnabled, false, "particle project import restores preview pause")
    assertEqual(#imported.data.systems, 3, "particle project import restores emitter count")
    assertEqual(#imported.data.timeline.tracks, 3, "particle project import restores timeline tracks")
    assertEqual(imported.data.systems[1].enabled, false, "particle project import restores enabled state")
    assertEqual(imported.data.systems[1].title, "Saved Core", "particle project import restores title")
    assertEqual(imported.data.systems[1].blendMode, "add", "particle project import restores blend mode")
    assertEqual(imported.data.systems[1].x, -12, "particle project import restores emitter offset")
    assertEqual(imported.data.systems[1].texturePreset, "star", "particle project import restores texture preset")
    assertEqual(imported.data.systems[1].shaderFilename, "saved-particle-shader.glsl", "particle project import restores shader metadata")
    assertEqual(imported.data.systems[1].properties.spinMin, -0.1, "particle project import restores particle properties")

    local legacyV2Project = {
      type = "feather.particle-system-playground",
      version = 2,
      name = "Legacy Loop Particles",
      composite = {
        x = 12,
        y = 34,
        previewEnabled = true,
        movement = { pattern = "none" },
        systems = { project.composite.systems[1] },
        timeline = {
          duration = 1,
          loop = true,
          tracks = {
            {
              systemIndex = 1,
              clips = { { id = "legacy-loop", start = 0, ["end"] = 1, emit = 0 } },
              lanes = {},
            },
          },
        },
      },
    }
    plugin:handleActionRequest({
      params = {
        action = "import-project",
        project = legacyV2Project,
      },
    })
    local legacyV2 = plugin:handleRequest()
    assertEqual(legacyV2.data.timeline.mode, "loop", "particle project v2 import migrates loop boolean to loop mode")
    assertEqual(legacyV2.data.timeline.loop, true, "particle project v2 import preserves loop compatibility")

    local legacyProject = {
      type = "feather.particle-system-playground",
      version = 1,
      name = "Legacy Particles",
      composite = {
        x = 12,
        y = 34,
        previewEnabled = true,
        movement = { pattern = "none" },
        systems = { project.composite.systems[1] },
      },
    }
    local legacyResult = plugin:handleActionRequest({
      params = {
        action = "import-project",
        project = legacyProject,
      },
    })
    assertEqual(legacyResult.composite, "Legacy Particles", "particle project v1 import creates scratch composite")
    local legacy = plugin:handleRequest()
    assertEqual(legacy.data.timeline.duration, 3, "particle project v1 import migrates a default timeline")
    assertEqual(legacy.data.timeline.mode, "one-shot", "particle project v1 import keeps default timeline mode")
    assertEqual(#legacy.data.timeline.tracks, 1, "particle project v1 import creates one clip track per emitter")

    local invalid, invalidErr = plugin:handleActionRequest({
      params = {
        action = "import-project",
        project = { type = "nope", version = 1 },
      },
    })
    assertEqual(invalid, nil, "particle project import rejects unsupported project")
    assertTruthy(contains(invalidErr or "", "Unsupported particle project file"), "particle project import returns clear error")
  end,
})
