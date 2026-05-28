local PluginE2EHelper = require("e2e.plugins.helper")

local function contains(haystack, needle)
  return haystack:find(needle, 1, true) ~= nil
end

return PluginE2EHelper.createSmokeSuite("particle-system-playground", {
  run = function(context)
    local plugin = context.pluginRecord.instance
    local assertEqual = context.assertEqual
    local assertTruthy = context.assertTruthy

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
    assertTruthy(contains(code, "local function emit(payload)"), "particle playground export includes payload emit lifecycle")
    assertTruthy(contains(code, "release = function()"), "particle playground export includes release lifecycle")
    assertTruthy(contains(code, "local timeline = {"), "particle playground export includes timeline data")
    assertTruthy(contains(code, "local timelineState = { time = 0, playing = false }"), "particle playground export includes timeline state")
    assertTruthy(contains(code, "local function applyTimeline(time)"), "particle playground export includes timeline evaluator")
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
    local resumedX, resumedY = system1:getPosition()
    assertEqual(resumedX, 123, "particle playground preview resume updates emitter x")
    assertEqual(resumedY, 234, "particle playground preview resume updates emitter y")

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
                  { id = "alpha-a", time = 0, value = 1 },
                  { id = "alpha-b", time = 1, value = 0 },
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
    assertEqual(timelineSystem.system:getEmissionRate(), 15, "particle timeline seek evaluates keyframes")
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
    assertEqual(project.version, 2, "particle project export includes version")
    assertEqual(project.name, "Project Save", "particle project export includes composite name")
    assertEqual(project.composite.x, 321, "particle project export includes composite x")
    assertEqual(project.composite.y, 432, "particle project export includes composite y")
    assertEqual(project.composite.previewEnabled, false, "particle project export includes preview pause")
    assertEqual(project.composite.movement.pattern, "circle", "particle project export includes movement")
    assertEqual(#project.composite.systems, 3, "particle project export includes every emitter")
    assertEqual(project.composite.timeline.duration, 3, "particle project export includes timeline duration")
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
