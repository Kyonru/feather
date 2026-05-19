local Class = require(FEATHER_PATH .. ".lib.class")
local Base = require(FEATHER_PATH .. ".core.base")

local ShaderGraphPlugin = Class({ __includes = Base })

function ShaderGraphPlugin:initialize(feather)
  Base.initialize(self, feather)
end

local function compileShader(params)
  local pixelSource = params.pixelSource or ""
  local vertexSource = params.vertexSource or ""

  local pixelError = nil
  local vertexError = nil

  local pixelOk, pixelErr = pcall(function()
    love.graphics.newShader(pixelSource)
  end)
  if not pixelOk then
    pixelError = tostring(pixelErr)
  end

  if pixelOk and vertexSource and vertexSource ~= "" then
    local vertOk, vertErr = pcall(function()
      love.graphics.newShader(pixelSource .. "\n" .. vertexSource)
    end)
    if not vertOk then
      vertexError = tostring(vertErr)
    end
  end

  if pixelError or vertexError then
    return { status = "error", pixelError = pixelError, vertexError = vertexError }
  end

  return { status = "ok" }
end

function ShaderGraphPlugin:handleActionRequest(request)
  local params = request.params or {}
  local action = params.action

  if action == "compile-shader" then
    return compileShader(params)
  end

  return { status = "error", pixelError = "Unknown shader graph action: " .. tostring(action) }
end

return ShaderGraphPlugin
