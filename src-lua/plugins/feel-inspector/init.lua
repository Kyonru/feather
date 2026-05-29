local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")

local FeelInspectorPlugin = Class({
  __includes = Base,
  init = function(self, config)
    self.options = config.options or {}
    self.logger = config.logger
    self.feelModules = {}
    self.moduleOrder = {}
    self.adapters = {}
    self.adapterOrder = {}
    self.targets = {}
    self.targetOrder = {}
    self.events = {}
    self.nextContextId = 1
    self.maxEvents = tonumber(self.options.maxEvents) or 80
    self.maxEvents = math.max(10, math.min(500, self.maxEvents))
  end,
})

local function sortedKeys(map)
  local keys = {}
  for key in pairs(map or {}) do
    keys[#keys + 1] = key
  end
  table.sort(keys, function(a, b)
    return tostring(a) < tostring(b)
  end)
  return keys
end

local function shallowCopy(source)
  local result = {}
  for key, value in pairs(source or {}) do
    result[key] = value
  end
  return result
end

local function safeString(value)
  local kind = type(value)
  if kind == "nil" then
    return "-"
  end
  if kind == "string" then
    return value
  end
  if kind == "number" or kind == "boolean" then
    return tostring(value)
  end
  return kind
end

local function compactValue(value, depth)
  depth = depth or 0
  local kind = type(value)
  if kind == "nil" then
    return nil
  end
  if kind == "string" or kind == "number" or kind == "boolean" then
    return value
  end
  if kind ~= "table" then
    return kind
  end
  if depth >= 1 then
    return "table"
  end
  local result = {}
  local count = 0
  for key, child in pairs(value) do
    count = count + 1
    if count > 8 then
      result["..."] = "truncated"
      break
    end
    result[tostring(key)] = compactValue(child, depth + 1)
  end
  return result
end

local function valueText(value)
  if type(value) ~= "table" then
    return safeString(value)
  end
  local parts = {}
  for _, key in ipairs(sortedKeys(value)) do
    parts[#parts + 1] = tostring(key) .. "=" .. safeString(value[key])
    if #parts >= 8 then
      break
    end
  end
  if #parts == 0 then
    return "{}"
  end
  return table.concat(parts, ", ")
end

local function countMap(map)
  local count = 0
  for _ in pairs(map or {}) do
    count = count + 1
  end
  return count
end

local function sequenceStepCount(sequence)
  if type(sequence) == "table" then
    return #sequence
  end
  return 0
end

local function runnerStepKind(runner)
  if type(runner) ~= "table" or type(runner.sequence) ~= "table" then
    return "-"
  end
  local step = runner.sequence[runner.index]
  if type(step) == "table" then
    return safeString(step.kind or "step")
  end
  return safeString(step)
end

local function runnerStatus(runner)
  if type(runner) ~= "table" then
    return "unknown"
  end
  if runner.cancelled then
    return "done"
  end
  if runner.wait then
    return "waiting"
  end
  if type(runner.tweens) == "table" and #runner.tweens > 0 then
    return "tweening"
  end
  return "running"
end

local function targetValues(target)
  if type(target) == "table" and type(target.values) == "table" then
    return target.values
  end
  return {}
end

local function getterValue(entry)
  if not entry then
    return nil
  end
  if type(entry.getter) == "function" then
    local ok, value = pcall(entry.getter)
    if ok then
      return value
    end
    return nil
  end
  return entry.value
end

function FeelInspectorPlugin:_targetLabel(target)
  if target == nil then
    return "-"
  end
  for _, label in ipairs(self.targetOrder) do
    local registered = getterValue(self.targets[label])
    if registered == target then
      return label
    end
  end
  return tostring(target)
end

function FeelInspectorPlugin:_recordSequence(entry, name, sequence)
  if type(name) ~= "string" or name == "" then
    return
  end
  entry.sequences[name] = {
    name = name,
    steps = sequenceStepCount(sequence),
  }
end

function FeelInspectorPlugin:_recordEvent(moduleLabel, kind, event, ctx)
  local item = {
    index = #self.events + 1,
    module = moduleLabel,
    kind = kind,
    event = type(event) == "table" and safeString(event.kind or event.name or event.cue or kind) or kind,
    trigger = type(ctx) == "table" and safeString(ctx.trigger) or "-",
    target = type(ctx) == "table" and self:_targetLabel(ctx.target) or "-",
    payload = type(event) == "table" and valueText(compactValue(event.payload)) or "-",
  }
  self.events[#self.events + 1] = item
  while #self.events > self.maxEvents do
    table.remove(self.events, 1)
  end
end

function FeelInspectorPlugin:_recordContext(entry, nameOrSequence, target, opts, ctx)
  if type(ctx) ~= "table" then
    return ctx
  end
  local id = self.nextContextId
  self.nextContextId = self.nextContextId + 1
  local source = type(nameOrSequence) == "string" and nameOrSequence or "(inline)"
  entry.contexts[id] = {
    id = id,
    module = entry.label,
    source = source,
    target = target,
    targetLabel = self:_targetLabel(target),
    trigger = safeString(opts and opts.trigger or ctx.trigger or "manual"),
    ctx = ctx,
  }
  if type(nameOrSequence) == "string" and entry.feel and type(entry.feel.get) == "function" then
    local ok, sequence = pcall(entry.feel.get, nameOrSequence)
    if ok then
      self:_recordSequence(entry, nameOrSequence, sequence)
    end
  end
  return ctx
end

function FeelInspectorPlugin:_pruneContexts(entry)
  for id, active in pairs(entry.contexts or {}) do
    if type(active.ctx) ~= "table" or type(active.ctx.runner) ~= "table" or active.ctx.runner.cancelled then
      entry.contexts[id] = nil
    end
  end
end

local function wrappedHandlers(self, moduleLabel, opts)
  local wrapped = shallowCopy(opts)
  local originalEmit = opts and opts.emit
  local originalAudio = opts and opts.audio
  local originalLog = opts and opts.log
  wrapped.emit = function(event, ctx)
    self:_recordEvent(moduleLabel, "emit", event, ctx)
    if type(originalEmit) == "function" then
      return originalEmit(event, ctx)
    end
  end
  wrapped.audio = function(event, ctx)
    self:_recordEvent(moduleLabel, "audio", event, ctx)
    if type(originalAudio) == "function" then
      return originalAudio(event, ctx)
    end
  end
  wrapped.log = function(message, ctx)
    self:_recordEvent(moduleLabel, "log", { kind = "log", payload = { message = message } }, ctx)
    if type(originalLog) == "function" then
      return originalLog(message, ctx)
    end
  end
  return wrapped
end

function FeelInspectorPlugin:attachFeel(label, feelModule)
  label = tostring(label or "main")
  if type(feelModule) ~= "table" then
    return nil, "feel module must be a table"
  end

  local entry = self.feelModules[label]
  if entry and entry.feel == feelModule then
    return entry
  end

  entry = {
    label = label,
    feel = feelModule,
    sequences = {},
    contexts = {},
    original = {
      define = feelModule.define,
      play = feelModule.play,
      update = feelModule.update,
      clear = feelModule.clear,
    },
  }
  self.feelModules[label] = entry

  local exists = false
  for _, existing in ipairs(self.moduleOrder) do
    if existing == label then
      exists = true
      break
    end
  end
  if not exists then
    self.moduleOrder[#self.moduleOrder + 1] = label
  end

  local plugin = self
  if type(entry.original.define) == "function" then
    feelModule.define = function(name, sequence)
      local result = entry.original.define(name, sequence)
      plugin:_recordSequence(entry, name, result or sequence)
      return result
    end
  end
  if type(entry.original.play) == "function" then
    feelModule.play = function(nameOrSequence, target, opts)
      local playOpts = wrappedHandlers(plugin, label, opts or {})
      local ctx = entry.original.play(nameOrSequence, target, playOpts)
      return plugin:_recordContext(entry, nameOrSequence, target, playOpts, ctx)
    end
  end
  if type(entry.original.update) == "function" then
    feelModule.update = function(dt)
      local result = entry.original.update(dt)
      plugin:_pruneContexts(entry)
      return result
    end
  end
  if type(entry.original.clear) == "function" then
    feelModule.clear = function(target)
      local result = entry.original.clear(target)
      if target == nil then
        entry.contexts = {}
        entry.sequences = {}
      else
        for id, active in pairs(entry.contexts) do
          if active.target == target then
            entry.contexts[id] = nil
          end
        end
      end
      return result
    end
  end

  return entry
end

function FeelInspectorPlugin:attachAdapter(label, adapterOrGetter)
  label = tostring(label or "love")
  if adapterOrGetter == nil then
    return nil, "adapter is required"
  end
  self.adapters[label] = {
    label = label,
    getter = type(adapterOrGetter) == "function" and adapterOrGetter or nil,
    value = type(adapterOrGetter) ~= "function" and adapterOrGetter or nil,
  }
  local exists = false
  for _, existing in ipairs(self.adapterOrder) do
    if existing == label then
      exists = true
      break
    end
  end
  if not exists then
    self.adapterOrder[#self.adapterOrder + 1] = label
  end
  return self.adapters[label]
end

function FeelInspectorPlugin:addTarget(label, targetOrGetter)
  label = tostring(label or "target")
  if targetOrGetter == nil then
    return nil, "target is required"
  end
  self.targets[label] = {
    label = label,
    getter = type(targetOrGetter) == "function" and targetOrGetter or nil,
    value = type(targetOrGetter) ~= "function" and targetOrGetter or nil,
  }
  local exists = false
  for _, existing in ipairs(self.targetOrder) do
    if existing == label then
      exists = true
      break
    end
  end
  if not exists then
    self.targetOrder[#self.targetOrder + 1] = label
  end
  return self.targets[label]
end

local function makeSequenceRows(self)
  local rows = {}
  for _, moduleLabel in ipairs(self.moduleOrder) do
    local entry = self.feelModules[moduleLabel]
    for _, name in ipairs(sortedKeys(entry and entry.sequences or {})) do
      local sequence = entry.sequences[name]
      rows[#rows + 1] = {
        module = moduleLabel,
        name = name,
        steps = tostring(sequence.steps or 0),
      }
    end
  end
  return rows
end

local function makeActiveRows(self)
  local rows = {}
  for _, moduleLabel in ipairs(self.moduleOrder) do
    local entry = self.feelModules[moduleLabel]
    self:_pruneContexts(entry)
    for _, id in ipairs(sortedKeys(entry and entry.contexts or {})) do
      local active = entry.contexts[id]
      local runner = active.ctx and active.ctx.runner
      rows[#rows + 1] = {
        id = tostring(id),
        module = moduleLabel,
        source = active.source,
        trigger = active.trigger,
        target = active.targetLabel,
        status = runnerStatus(runner),
        step = runnerStepKind(runner),
        index = type(runner) == "table" and tostring(runner.index or 0) or "-",
      }
    end
  end
  return rows
end

local function makeTargetRows(self)
  local rows = {}
  for _, label in ipairs(self.targetOrder) do
    local target = getterValue(self.targets[label])
    rows[#rows + 1] = {
      label = label,
      values = valueText(targetValues(target)),
    }
  end
  return rows
end

local function makeAdapterRows(self)
  local rows = {}
  for _, label in ipairs(self.adapterOrder) do
    local adapter = getterValue(self.adapters[label])
    rows[#rows + 1] = {
      adapter = label,
      camera = valueText(adapter and adapter.camera),
      shake = valueText(adapter and adapter.shake),
      flash = valueText(adapter and adapter.flash),
      fade = valueText(adapter and adapter.fade),
      sounds = tostring(countMap(adapter and adapter.soundEntries)),
      particles = tostring(countMap(adapter and adapter.particleEntries)),
      shaders = tostring(countMap(adapter and adapter.shaderEntries)),
      post = tostring(countMap(adapter and adapter.post and adapter.post.effects)),
    }
  end
  return rows
end

local function makePostRows(self)
  local rows = {}
  for _, label in ipairs(self.adapterOrder) do
    local adapter = getterValue(self.adapters[label])
    local effects = adapter and adapter.post and adapter.post.effects
    for _, name in ipairs(sortedKeys(effects or {})) do
      local effect = effects[name]
      rows[#rows + 1] = {
        adapter = label,
        effect = name,
        enabled = effect.enabled and "yes" or "no",
        values = valueText(effect.target and effect.target.values),
      }
    end
  end
  return rows
end

local function columns(...)
  local result = {}
  for _, key in ipairs({ ... }) do
    result[#result + 1] = { key = key, label = key:gsub("^%l", string.upper) }
  end
  return result
end

local function emptyMessage(ui)
  return ui.panel({
    title = "Feel Inspector",
    ui.alert({
      title = "No feel.lua module attached",
      value = "Install feel with `feather package install feel`, then call plugin.instance:attachFeel(\"main\", feel) from your game.",
      variant = "default",
    }),
    ui.code({
      value = table.concat({
        "local feel = require(\"lib.feel\")",
        "local plugin = DEBUGGER.pluginManager:getPlugin(\"feel-inspector\")",
        "if plugin then",
        "  plugin.instance:attachFeel(\"main\", feel)",
        "end",
      }, "\n"),
    }),
  })
end

function FeelInspectorPlugin:handleRequest(_request, feather)
  local ui = feather.ui
  if #self.moduleOrder == 0 and #self.adapterOrder == 0 and #self.targetOrder == 0 then
    return ui.render(emptyMessage(ui))
  end

  local sequenceRows = makeSequenceRows(self)
  local activeRows = makeActiveRows(self)
  local targetRows = makeTargetRows(self)
  local adapterRows = makeAdapterRows(self)
  local postRows = makePostRows(self)

  local replayRows = {}
  for _, moduleLabel in ipairs(self.moduleOrder) do
    local entry = self.feelModules[moduleLabel]
    for _, name in ipairs(sortedKeys(entry and entry.sequences or {})) do
      for _, targetLabel in ipairs(self.targetOrder) do
        replayRows[#replayRows + 1] = ui.button({
          label = moduleLabel .. ":" .. name .. " -> " .. targetLabel,
          action = "play|" .. moduleLabel .. "|" .. name .. "|" .. targetLabel,
          variant = "outline",
        })
      end
    end
  end

  return ui.render(ui.panel({
    title = "Feel Inspector",
    ui.row({
      ui.button({ label = "Clear Events", action = "clear-events", variant = "outline" }),
      ui.button({ label = "Clear All Feel State", action = "clear-all", variant = "destructive" }),
    }),
    ui.tabs({
      ui.tab({
        id = "overview",
        title = "Overview",
        ui.row({
          ui.stat({ label = "Modules", value = tostring(#self.moduleOrder), description = "Attached feel.lua modules" }),
          ui.stat({ label = "Adapters", value = tostring(#self.adapterOrder), description = "Observed feel.love adapters" }),
          ui.stat({ label = "Sequences", value = tostring(#sequenceRows), description = "Definitions seen after attach" }),
          ui.stat({ label = "Active", value = tostring(#activeRows), description = "Running feel contexts" }),
          ui.stat({ label = "Targets", value = tostring(#targetRows), description = "Registered replay targets" }),
          ui.stat({ label = "Events", value = tostring(#self.events), description = "Recent emit/audio/log events" }),
        }),
        ui.table({ columns = columns("label", "values"), data = targetRows }),
      }),
      ui.tab({
        id = "sequences",
        title = "Sequences",
        ui.table({ columns = columns("module", "name", "steps"), data = sequenceRows }),
        #replayRows > 0 and ui.column(replayRows) or ui.text({ value = "Register a target to replay sequences from Feather." }),
      }),
      ui.tab({
        id = "active",
        title = "Active",
        ui.table({ columns = columns("id", "module", "source", "trigger", "target", "status", "step", "index"), data = activeRows }),
      }),
      ui.tab({
        id = "targets",
        title = "Targets",
        ui.table({ columns = columns("label", "values"), data = targetRows }),
        ui.column((function()
          local buttons = {}
          for _, label in ipairs(self.targetOrder) do
            buttons[#buttons + 1] = ui.button({
              label = "Clear " .. label,
              action = "clear-target|" .. label,
              variant = "outline",
            })
          end
          return buttons
        end)()),
      }),
      ui.tab({
        id = "events",
        title = "Events",
        ui.table({ columns = columns("module", "kind", "event", "trigger", "target", "payload"), data = self.events }),
      }),
      ui.tab({
        id = "adapter",
        title = "LOVE Adapter",
        ui.table({
          columns = columns("adapter", "camera", "shake", "flash", "fade", "sounds", "particles", "shaders", "post"),
          data = adapterRows,
        }),
        ui.table({ columns = columns("adapter", "effect", "enabled", "values"), data = postRows }),
      }),
    }),
  }))
end

function FeelInspectorPlugin:handleActionRequest(request)
  local action = request.params and request.params.action
  if action == "clear-events" then
    self.events = {}
    return true
  end
  if action == "clear-all" then
    for _, moduleLabel in ipairs(self.moduleOrder) do
      local entry = self.feelModules[moduleLabel]
      if entry and entry.feel and type(entry.feel.clear) == "function" then
        entry.feel.clear()
      end
    end
    return true
  end

  local targetLabel = type(action) == "string" and action:match("^clear%-target|(.+)$")
  if targetLabel then
    local target = getterValue(self.targets[targetLabel])
    for _, moduleLabel in ipairs(self.moduleOrder) do
      local entry = self.feelModules[moduleLabel]
      if entry and entry.feel and type(entry.feel.clear) == "function" then
        entry.feel.clear(target)
      end
    end
    return true
  end

  local moduleLabel, sequenceName, replayTarget
  if type(action) == "string" then
    moduleLabel, sequenceName, replayTarget = action:match("^play|([^|]+)|([^|]+)|([^|]+)$")
  end
  if moduleLabel then
    local entry = self.feelModules[moduleLabel]
    local target = getterValue(self.targets[replayTarget])
    if not entry or not entry.feel or type(entry.feel.play) ~= "function" then
      return nil, "Unknown feel module: " .. tostring(moduleLabel)
    end
    if not target then
      return nil, "Unknown target: " .. tostring(replayTarget)
    end
    entry.feel.play(sequenceName, target, { restart = true, trigger = "feather" })
    return true
  end

  return nil, "Unknown action: " .. tostring(action)
end

function FeelInspectorPlugin:getConfig()
  return {
    type = "feel-inspector",
    icon = "sparkles",
    tabName = "Feel",
    docs = "https://github.com/Kyonru/feather/tree/main/src-lua/plugins/feel-inspector",
    actions = {},
  }
end

return FeelInspectorPlugin
