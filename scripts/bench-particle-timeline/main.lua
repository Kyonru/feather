-- What a particle timeline lane costs per frame, and what baking it saves.
--
-- Run from the repository root:   love scripts/bench-particle-timeline
--
-- Loads the real production evaluator rather than a copy, so the numbers move
-- when the code does. Backs the measurements in V4-PARTICLES.md §4.2 and §5.1.

local REPO = (...) and "" or ""
local function repoRoot()
  local env = os.getenv("FEATHER_REPO")
  if env and #env > 0 then return env end
  return love.filesystem.getSourceBaseDirectory() .. "/../.."
end

local function loadProductionRuntime()
  local path = repoRoot() .. "/packages/runtime-lua/plugins/particle-system-playground/timeline_runtime.lua"
  local handle = io.open(path, "r")
  if not handle then
    error("cannot find timeline_runtime.lua at " .. path .. "\nSet FEATHER_REPO to the repository root.")
  end
  local text = handle:read("*a")
  handle:close()
  local source = text:match("M%.source = %[=%[(.-)%]=%]")
  assert(source, "timeline_runtime.lua no longer wraps its runtime in M.source")
  return assert(load(source, "timeline_runtime"))()
end

local Runtime = loadProductionRuntime()

local LANES = { "opacity", "emissionRate", "speedScale", "sizeScale", "direction", "spread", "offsetX", "offsetY" }
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
  local function bump(self) self.calls = self.calls + 1 end
  for _, name in ipairs({ "setEmissionRate", "setSpeed", "setSizes", "setDirection", "setSpread", "setOffset" }) do
    ps[name] = bump
  end
  return ps
end

local function buildSet(count, constant)
  local set = {}
  for index = 1, count do
    local lanes = {}
    for _, name in ipairs(LANES) do
      lanes[name] = constant and constantLane() or curvedLane()
    end
    set[index] = {
      emitter = {
        system = mockParticleSystem(),
        base = {
          emissionRate = 50, speedMin = 10, speedMax = 90, sizes = { 1, 0.6, 0.2 },
          direction = 0, spread = 1, offsetX = 0, offsetY = 0, emitterLifetime = -1,
        },
      },
      track = { lanes = lanes, clips = { { start = 0, ["end"] = DURATION } } },
    }
  end
  return set
end

local function bakeLane(points, resolution)
  local lut = { n = resolution }
  for i = 0, resolution do
    lut[i] = Runtime.evaluateKeyframes(points, (i / resolution) * DURATION, 0)
  end
  return lut
end

local function sampleLane(lut, time)
  local x = (time / DURATION) * lut.n
  local i = math.floor(x)
  if i < 0 then return lut[0] end
  if i >= lut.n then return lut[lut.n] end
  local a = lut[i]
  return a + (lut[i + 1] - a) * (x - i)
end

local function measureCurrent(set)
  -- GC is stopped for the measurement so the number is total bytes allocated,
  -- not whatever happened to survive a collection that ran mid-loop. With GC
  -- on, this figure swung 14x between runs and meant nothing.
  collectgarbage("collect")
  collectgarbage("stop")
  local before = collectgarbage("count")
  local started = os.clock()
  for frame = 1, FRAMES do
    local time = (frame / 60) % DURATION
    for _, item in ipairs(set) do
      Runtime.applyTimelineToEmitter(item.emitter, item.track, time, true, { mode = "loop" })
    end
  end
  local elapsed, allocated = os.clock() - started, collectgarbage("count") - before
  collectgarbage("restart")
  return elapsed, allocated, set[1].emitter.system.calls
end

local EPSILON = 1e-4

local function measureBaked(set, resolution)
  for _, item in ipairs(set) do
    local baked = {}
    for _, name in ipairs(LANES) do baked[name] = bakeLane(item.track.lanes[name], resolution) end
    item.baked, item.previous, item.sizeBuffer = baked, {}, { 0, 0, 0 }
  end

  collectgarbage("collect")
  collectgarbage("stop")
  local before = collectgarbage("count")
  local started = os.clock()
  for frame = 1, FRAMES do
    local time = (frame / 60) % DURATION
    for _, item in ipairs(set) do
      local ps, base, baked, previous = item.emitter.system, item.emitter.base, item.baked, item.previous

      local rate = sampleLane(baked.emissionRate, time)
      if rate < 0 then rate = 0 end
      if not previous.rate or math.abs(rate - previous.rate) > EPSILON then
        previous.rate = rate
        ps:setEmissionRate(rate)
      end

      local speed = sampleLane(baked.speedScale, time)
      if speed < 0 then speed = 0 end
      if not previous.speed or math.abs(speed - previous.speed) > EPSILON then
        previous.speed = speed
        ps:setSpeed(base.speedMin * speed, base.speedMax * speed)
      end

      local size = sampleLane(baked.sizeScale, time)
      if size < 0 then size = 0 end
      if not previous.size or math.abs(size - previous.size) > EPSILON then
        previous.size = size
        local buffer = item.sizeBuffer
        for i = 1, #base.sizes do buffer[i] = base.sizes[i] * size end
        ps:setSizes(buffer[1], buffer[2], buffer[3])
      end

      local direction = sampleLane(baked.direction, time)
      if not previous.direction or math.abs(direction - previous.direction) > EPSILON then
        previous.direction = direction
        ps:setDirection(direction)
      end

      local spread = sampleLane(baked.spread, time)
      if not previous.spread or math.abs(spread - previous.spread) > EPSILON then
        previous.spread = spread
        ps:setSpread(spread)
      end

      local ox, oy = sampleLane(baked.offsetX, time), sampleLane(baked.offsetY, time)
      if not previous.ox or math.abs(ox - previous.ox) > EPSILON or math.abs(oy - previous.oy) > EPSILON then
        previous.ox, previous.oy = ox, oy
        ps:setOffset(ox, oy)
      end

      local opacity = sampleLane(baked.opacity, time)
      if opacity < 0 then opacity = 0 elseif opacity > 1 then opacity = 1 end
      item.emitter.opacity = opacity
    end
  end
  local elapsed, allocated = os.clock() - started, collectgarbage("count") - before
  collectgarbage("restart")
  return elapsed, allocated, set[1].emitter.system.calls
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
  print(string.format("Frame budget at 60fps: 16.667 ms\n"))

  print("PER-FRAME COST — the real applyTimelineToEmitter vs a baked lookup table")
  print(string.format("%-28s %-32s %s", "", "current", "baked + change detection"))
  for _, scene in ipairs({
    { label = "6 emitters, curved", count = 6, constant = false },
    { label = "6 emitters, constant", count = 6, constant = true },
    { label = "20 emitters, curved", count = 20, constant = false },
    { label = "50 emitters, curved", count = 50, constant = false },
  }) do
    local currentTime, currentKb, currentCalls = measureCurrent(buildSet(scene.count, scene.constant))
    local bakedTime, bakedKb, bakedCalls = measureBaked(buildSet(scene.count, scene.constant), 360)
    print(string.format("%-28s %6.3f ms/f %6.0f KB %5d calls | %6.3f ms/f %5.0f KB %5d calls  %4.1fx",
      scene.label,
      (currentTime / FRAMES) * 1000, currentKb, currentCalls,
      (bakedTime / FRAMES) * 1000, bakedKb, bakedCalls,
      currentTime / bakedTime))
  end

  print("\nACCURACY — baked vs exact, sampled at real 60fps frame times")
  print(string.format("%-12s %9s %13s %12s %11s", "curve", "samples", "LUT step", "max error", "max err %"))
  for _, curve in ipairs(ACCURACY_CURVES) do
    for _, resolution in ipairs({ 64, 180, 360 }) do
      local lut = bakeLane(curve.points, resolution)
      local worst, peak = 0, 0
      for frame = 0, 180 do
        local time = (frame / 60) % DURATION
        local exact = Runtime.evaluateKeyframes(curve.points, time, 0)
        peak = math.max(peak, math.abs(exact))
        worst = math.max(worst, math.abs(sampleLane(lut, time) - exact))
      end
      print(string.format("%-12s %9d %10.2f ms %12.4f %10.3f%%",
        curve.name, resolution, (DURATION / resolution) * 1000, worst, worst / math.max(1e-9, peak) * 100))
    end
  end

  print("\nRule: resolution = ceil(duration * 120) — two samples per frame at 60fps.")
  print(string.format("Cost: %.1f KB per baked lane at 360 samples. Constant lanes need no table at all.",
    361 * 8 / 1024))
  love.event.quit()
end
