-- What a particle timeline costs per frame, before and after V4-PARTICLES P2.
--
--   love scripts/bench-particle-timeline
--
-- Loads the real production modules rather than copies, so the numbers move
-- when the code does. Backs the measurements in V4-PARTICLES.md §4.2 and §5.1.

local function repoRoot()
  local env = os.getenv("FEATHER_REPO")
  if env and #env > 0 then return env end
  return love.filesystem.getSourceBaseDirectory() .. "/../.."
end

local PLUGIN = repoRoot() .. "/packages/runtime-lua/plugins/particle-system-playground/"

local Core, Apply
do
  local function readAll(name)
    local handle = io.open(PLUGIN .. name .. ".lua", "r")
    if not handle then
      error("cannot find " .. name .. ".lua under " .. PLUGIN .. "\nSet FEATHER_REPO to the repo root.")
    end
    local text = handle:read("*a")
    handle:close()
    return text
  end

  Core = assert(load(readAll("core"), "core"))()

  -- apply.lua requires core; satisfy that without a package path.
  local realRequire = require
  _G.require = function(name)
    if tostring(name):match("core$") then return Core end
    return realRequire(name)
  end
  Apply = assert(load(readAll("apply"), "apply"))()
  _G.require = realRequire
end

local LANES = Core.LANES
local DURATION = 3.0
local FRAMES = 600

local function curvedLane()
  return {
    { time = 0.0, value = 0, easing = "outElastic" },
    { time = 0.8, value = 120, easing = "inOutCubic" },
    { time = 1.9, value = 40, easing = "inBack" },
    { time = 3.0, value = 0, easing = "linear" },
  }
end

local function constantLane()
  return { { time = 0, value = 42, easing = "linear" } }
end

local function mockParticleSystem()
  local ps = { calls = 0 }
  local function bump(self)
    self.calls = self.calls + 1
  end
  for _, name in ipairs({ "setEmissionRate", "setSpeed", "setSizes", "setDirection", "setSpread", "setOffset" }) do
    ps[name] = bump
  end
  return ps
end

local BASE = {
  emissionRate = 50, speedMin = 10, speedMax = 90, sizes = { 1, 0.6, 0.2 },
  direction = 0, spread = 1, offsetX = 0, offsetY = 0, emitterLifetime = -1,
}

local function buildSet(count, constant)
  local set = {}
  for index = 1, count do
    local lanes = {}
    for _, name in ipairs(LANES) do
      lanes[name] = constant and constantLane() or curvedLane()
    end
    set[index] = {
      ps = mockParticleSystem(),
      track = { lanes = lanes, clips = { { start = 0, ["end"] = DURATION } } },
    }
  end
  return set
end

local TICK = { mode = "loop", allowEmission = true }
local unpackList = table.unpack or unpack

--- Before P2: resolve the exact curve every frame, send every setter.
local function measureBefore(set)
  for _, item in ipairs(set) do
    item.out = {}
    item.sizes = {}
  end
  collectgarbage("collect")
  collectgarbage("stop")
  local before = collectgarbage("count")
  local started = os.clock()
  for frame = 1, FRAMES do
    local time = (frame / 60) % DURATION
    for _, item in ipairs(set) do
      local r = Core.resolve(item.track, time, BASE, TICK, item.out)
      local ps = item.ps
      ps:setEmissionRate(r.emissionRate)
      ps:setSpeed(r.speedMin, r.speedMax)
      local sizes, count = Core.resolveSizes(BASE, r.sizeScale, {})   -- a fresh table, as it was
      if count > 0 then ps:setSizes(unpackList(sizes, 1, count)) end
      ps:setDirection(r.direction)
      ps:setSpread(r.spread)
      ps:setOffset(r.offsetX, r.offsetY)
    end
  end
  local elapsed, allocated = os.clock() - started, collectgarbage("count") - before
  collectgarbage("restart")
  return elapsed, allocated, set[1].ps.calls
end

--- After P2: compile once, sample the baked lane, send only what moved.
local function measureAfter(set)
  local compileStart = os.clock()
  for _, item in ipairs(set) do
    item.compiled = Core.compileTrack(item.track, DURATION)
    item.state = Apply.newState()
  end
  local compileTime = os.clock() - compileStart

  collectgarbage("collect")
  collectgarbage("stop")
  local before = collectgarbage("count")
  local started = os.clock()
  for frame = 1, FRAMES do
    local time = (frame / 60) % DURATION
    for _, item in ipairs(set) do
      Apply.tick(item.state, item.ps, item.compiled, time, BASE, TICK)
    end
  end
  local elapsed, allocated = os.clock() - started, collectgarbage("count") - before
  collectgarbage("restart")
  return elapsed, allocated, set[1].ps.calls, compileTime
end

local ACCURACY_CURVES = {
  { name = "hold step", points = {
    { time = 0, value = 0, easing = "hold" },
    { time = 1.5, value = 100, easing = "hold" },
    { time = 3, value = 0, easing = "linear" } } },
  { name = "elastic", points = {
    { time = 0, value = 0, easing = "outElastic" },
    { time = 1.2, value = 80, easing = "inElastic" },
    { time = 3, value = 10, easing = "linear" } } },
  { name = "inOutCubic", points = {
    { time = 0, value = 0, easing = "inOutCubic" },
    { time = 1.5, value = 90, easing = "inOutCubic" },
    { time = 3, value = 0, easing = "linear" } } },
}

function love.load()
  print(string.format("LuaJIT JIT compiler: %s   (%s %s)",
    jit.status() and "ON" or "OFF - interpreted", jit.os, jit.arch))
  print("Frame budget at 60fps: 16.667 ms\n")

  print("PER-FRAME COST - before P2 (resolve + send everything) vs after (compiled + change detection)")
  print(string.format("%-26s %-34s %s", "", "before", "after"))
  for _, scene in ipairs({
    { label = "6 emitters, curved", count = 6, constant = false },
    { label = "6 emitters, constant", count = 6, constant = true },
    { label = "20 emitters, curved", count = 20, constant = false },
    { label = "50 emitters, curved", count = 50, constant = false },
  }) do
    local beforeTime, beforeKb, beforeCalls = measureBefore(buildSet(scene.count, scene.constant))
    local afterTime, afterKb, afterCalls, compileTime = measureAfter(buildSet(scene.count, scene.constant))
    print(string.format("%-26s %6.3f ms/f %7.0f KB %5d calls | %6.3f ms/f %5.1f KB %5d calls  %4.1fx  (compile %.1f ms)",
      scene.label,
      (beforeTime / FRAMES) * 1000, beforeKb, beforeCalls,
      (afterTime / FRAMES) * 1000, afterKb, afterCalls,
      beforeTime / afterTime, compileTime * 1000))
  end

  print("\nACCURACY - baked vs exact, sampled at real 60fps frame times")
  print(string.format("%-12s %9s %13s %12s %11s", "curve", "samples", "LUT step", "max error", "max err %"))
  for _, curve in ipairs(ACCURACY_CURVES) do
    for _, resolution in ipairs({ 64, 180, 360 }) do
      local lut = Core.bakeLane(curve.points, DURATION, resolution)
      local worst, peak = 0, 0
      for frame = 0, 180 do
        local time = (frame / 60) % DURATION
        local exact = Core.evaluate(curve.points, time, 0)
        peak = math.max(peak, math.abs(exact))
        worst = math.max(worst, math.abs(Core.sampleLane(lut, time) - exact))
      end
      print(string.format("%-12s %9d %10.2f ms %12.4f %10.3f%%",
        curve.name, resolution, (DURATION / resolution) * 1000, worst, worst / math.max(1e-9, peak) * 100))
    end
  end

  print(string.format("\nShipping resolution for a %gs timeline: %d samples (ceil(duration * %d)).",
    DURATION, Core.bakeResolution(DURATION), Core.SAMPLES_PER_SECOND))
  love.event.quit()
end
