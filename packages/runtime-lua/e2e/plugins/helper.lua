local FeatherDebugger = require("feather")
local FeatherPluginManager = require("feather.plugin_manager")

local PluginE2EHelper = {}

local pluginSpecs = {
  {
    id = "animation-inspector",
    modulePath = "plugins.animation-inspector",
    suiteModulePath = "e2e.plugins.animation_inspector",
  },
  {
    id = "audio-debug",
    modulePath = "plugins.audio-debug",
    suiteModulePath = "e2e.plugins.audio_debug",
  },
  {
    id = "bookmark",
    modulePath = "plugins.bookmark",
    suiteModulePath = "e2e.plugins.bookmark",
  },
  {
    id = "collision-debug",
    modulePath = "plugins.collision-debug",
    suiteModulePath = "e2e.plugins.collision_debug",
  },
  {
    id = "config-tweaker",
    modulePath = "plugins.config-tweaker",
    suiteModulePath = "e2e.plugins.config_tweaker",
  },
  {
    id = "console",
    modulePath = "plugins.console",
    suiteModulePath = "e2e.plugins.console",
  },
  {
    id = "coroutine-monitor",
    modulePath = "plugins.coroutine-monitor",
    suiteModulePath = "e2e.plugins.coroutine_monitor",
  },
  {
    id = "entity-inspector",
    modulePath = "plugins.entity-inspector",
    suiteModulePath = "e2e.plugins.entity_inspector",
  },
  {
    id = "feel-inspector",
    modulePath = "plugins.feel-inspector",
    suiteModulePath = "e2e.plugins.feel_inspector",
  },
  {
    id = "golden-workflows",
    suiteModulePath = "e2e.plugins.golden_workflows",
  },
  {
    id = "filesystem",
    modulePath = "plugins.filesystem",
    suiteModulePath = "e2e.plugins.filesystem",
  },
  {
    id = "hot-reload",
    modulePath = "plugins.hot-reload",
    suiteModulePath = "e2e.plugins.hot_reload",
  },
  {
    id = "hump.signal",
    modulePath = "plugins.hump.signal",
    suiteModulePath = "e2e.plugins.hump_signal",
  },
  {
    id = "ingame-overlay",
    modulePath = "plugins.ingame-overlay",
    suiteModulePath = "e2e.plugins.ingame_overlay",
  },
  {
    id = "input-replay",
    modulePath = "plugins.input-replay",
    suiteModulePath = "e2e.plugins.input_replay",
  },
  {
    id = "lua-state-machine",
    modulePath = "plugins.lua-state-machine",
    suiteModulePath = "e2e.plugins.lua_state_machine",
  },
  {
    id = "memory-snapshot",
    modulePath = "plugins.memory-snapshot",
    suiteModulePath = "e2e.plugins.memory_snapshot",
  },
  {
    id = "network-inspector",
    modulePath = "plugins.network-inspector",
    suiteModulePath = "e2e.plugins.network_inspector",
  },
  {
    id = "particle-editor",
    modulePath = "plugins.particle-editor",
    suiteModulePath = "e2e.plugins.particle_editor",
  },
  {
    id = "particle-system-playground",
    modulePath = "plugins.particle-system-playground",
    suiteModulePath = "e2e.plugins.particle_system_playground",
  },
  {
    id = "physics-debug",
    modulePath = "plugins.physics-debug",
    suiteModulePath = "e2e.plugins.physics_debug",
  },
  {
    id = "profiler",
    suiteModulePath = "e2e.plugins.profiler",
  },
  {
    id = "runtime-impact",
    suiteModulePath = "e2e.plugins.runtime_impact",
  },
  {
    id = "runtime-snapshot",
    modulePath = "plugins.runtime-snapshot",
    suiteModulePath = "e2e.plugins.runtime_snapshot",
  },
  {
    id = "screenshots",
    modulePath = "plugins.screenshots",
    suiteModulePath = "e2e.plugins.screenshots",
  },
  {
    id = "shader-graph",
    modulePath = "plugins.shader-graph",
    suiteModulePath = "e2e.plugins.shader_graph",
  },
  {
    id = "session-replay",
    modulePath = "plugins.session-replay",
    suiteModulePath = "e2e.plugins.session_replay",
  },
  {
    id = "time-travel",
    modulePath = "plugins.time-travel",
    suiteModulePath = "e2e.plugins.time_travel",
  },
  {
    id = "timer-inspector",
    modulePath = "plugins.timer-inspector",
    suiteModulePath = "e2e.plugins.timer_inspector",
  },
}

local specsById = {}
for _, spec in ipairs(pluginSpecs) do
  specsById[spec.id] = spec
end

local function copyTable(source)
  local target = {}
  for key, value in pairs(source or {}) do
    target[key] = value
  end
  return target
end

function PluginE2EHelper.getPluginSpecs()
  return pluginSpecs
end

function PluginE2EHelper.getPluginSpec(pluginId)
  local spec = specsById[pluginId]
  if not spec then
    error("Unknown plugin E2E suite: " .. tostring(pluginId), 2)
  end
  return spec
end

function PluginE2EHelper.getSuiteModulePaths()
  local modulePaths = {}

  for _, spec in ipairs(pluginSpecs) do
    modulePaths[#modulePaths + 1] = spec.suiteModulePath
  end

  return modulePaths
end

function PluginE2EHelper.loadPluginDefinition(pluginId)
  local spec = PluginE2EHelper.getPluginSpec(pluginId)
  local manifest = require(spec.modulePath .. ".manifest")
  local plugin = require(spec.modulePath)

  return {
    spec = spec,
    manifest = manifest,
    plugin = plugin,
  }
end

function PluginE2EHelper.createPluginRecord(definition, optionOverrides, disabledOverride)
  local manifest = definition.manifest
  local pluginOptions = copyTable(manifest.opts or {})

  for key, value in pairs(optionOverrides or {}) do
    pluginOptions[key] = value
  end

  return FeatherPluginManager.createPlugin(
    definition.plugin,
    manifest.id,
    pluginOptions,
    disabledOverride == nil and manifest.disabled or disabledOverride,
    manifest.capabilities or {},
    {
      api = manifest.api,
      minApi = manifest.minApi,
      maxApi = manifest.maxApi,
      name = manifest.name,
      version = manifest.version,
    },
    manifest.runtime or {}
  )
end

function PluginE2EHelper.createFeather(config)
  return FeatherDebugger({
    debug = true,
    mode = "disk",
    sessionName = config.sessionName,
    deviceId = config.deviceId,
    assetPreview = config.assetPreview == true,
    capabilities = config.capabilities,
    plugins = config.plugins,
    debugger = {
      enabled = false,
    },
  })
end

function PluginE2EHelper.assertSmoke(context)
  local feather = context.feather
  local definition = context.definition
  local assertEqual = context.assertEqual
  local assertTruthy = context.assertTruthy
  local pluginId = definition.manifest.id
  local pluginRecord = feather.pluginManager:getPlugin(pluginId)
  local config = feather:__getConfig()

  assertTruthy(pluginRecord, "plugin smoke suite registers " .. pluginId)
  assertTruthy(pluginRecord.instance, "plugin smoke suite instantiates " .. pluginId)
  assertTruthy(config.plugins[pluginId], "plugin smoke suite exposes " .. pluginId .. " in config")
  assertEqual(pluginRecord.identifier, pluginId, "plugin smoke suite keeps identifier for " .. pluginId)

  return pluginRecord
end

function PluginE2EHelper.createSmokeSuite(pluginId, options)
  options = options or {}

  return {
    id = pluginId,
    run = function(assertEqual, assertTruthy)
      local definition = PluginE2EHelper.loadPluginDefinition(pluginId)
      local feather = PluginE2EHelper.createFeather({
        sessionName = options.sessionName or ("Plugin " .. pluginId .. " E2E"),
        deviceId = options.deviceId or (("plugin-" .. pluginId .. "-e2e"):gsub("[^%w%-]", "-")),
        assetPreview = options.assetPreview,
        plugins = {
          PluginE2EHelper.createPluginRecord(definition, options.pluginOptions, options.disabled ~= nil and options.disabled or false),
        },
      })

      local ok, result = xpcall(function()
        local pluginRecord = PluginE2EHelper.assertSmoke({
          feather = feather,
          definition = definition,
          assertEqual = assertEqual,
          assertTruthy = assertTruthy,
        })

        if options.run then
          options.run({
            feather = feather,
            definition = definition,
            pluginRecord = pluginRecord,
            assertEqual = assertEqual,
            assertTruthy = assertTruthy,
          })
        end
      end, debug.traceback)

      feather:finish()

      if not ok then
        error(result, 0)
      end
    end,
  }
end

return PluginE2EHelper
