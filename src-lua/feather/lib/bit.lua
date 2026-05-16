--- Small bit-operation compatibility layer for Feather.
--- Uses LuaJIT's bit module when available, then bit32, then a Lua 5.1 fallback.

local ok, native = pcall(require, "bit")
if ok and native then
  return native
end

local ok32, native32 = pcall(require, "bit32")
if ok32 and native32 then
  return native32
end

local floor = math.floor
local TWO_32 = 4294967296

local function normalize(n)
  return (n or 0) % TWO_32
end

local function bitop(a, b, predicate)
  a = normalize(a)
  b = normalize(b)

  local result = 0
  local place = 1

  while a > 0 or b > 0 do
    local abit = a % 2
    local bbit = b % 2

    if predicate(abit, bbit) then
      result = result + place
    end

    a = (a - abit) / 2
    b = (b - bbit) / 2
    place = place * 2
  end

  return result
end

local function apply(predicate, a, b, ...)
  if b == nil then
    return normalize(a)
  end

  local result = bitop(a, b, predicate)
  for i = 1, select("#", ...) do
    result = bitop(result, select(i, ...), predicate)
  end
  return result
end

local function band(a, b, ...)
  return apply(function(abit, bbit)
    return abit == 1 and bbit == 1
  end, a, b, ...)
end

local function bor(a, b, ...)
  return apply(function(abit, bbit)
    return abit == 1 or bbit == 1
  end, a, b, ...)
end

local function bxor(a, b, ...)
  return apply(function(abit, bbit)
    return abit ~= bbit
  end, a, b, ...)
end

local function lshift(n, bits)
  return floor(normalize(n) * (2 ^ bits)) % TWO_32
end

local function rshift(n, bits)
  return floor(normalize(n) / (2 ^ bits))
end

return {
  band = band,
  bor = bor,
  bxor = bxor,
  lshift = lshift,
  rshift = rshift,
}
