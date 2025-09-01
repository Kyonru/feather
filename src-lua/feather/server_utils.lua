---@diagnostic disable: invisible
local PATH = (...):gsub("%.server_utils$", "")
local Performance = require(PATH .. ".plugins.performance")
local startsWith = require(PATH .. ".utils").startsWith

local performance = Performance()
local json = require(PATH .. ".lib.json")

local server = {}

function server.allowedHeaders()
  local response = [[
HTTP/1.1 204 No Content
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS, PUT
Access-Control-Allow-Headers: x-api-key
Access-Control-Max-Age: 86400
Content-Length: 0

]]

  return response
end

---@param body string
function server.buildResponse(body)
  local response = table.concat({
    "HTTP/1.1 200 OK",
    "Content-Type: application/json",
    "Access-Control-Allow-Origin: *",
    "Access-Control-Allow-Headers: Content-Type,  x-api-key, X-Requested-With, Access-Control-Request-Headers",
    "Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS",
    "Content-Length: " .. #body,
    "",
    body,
  }, "\r\n")

  return response
end

--- @class FeatherRequest
--- @field method string
--- @field path string
--- @field params table
--- @field headers table

--- Builds a request object from a raw request string
--- @param client table
--- @return FeatherRequest
function server.buildRequest(client)
  local request = client:receive()

  local method, pathWithQuery = request:match("^(%u+)%s+([^%s]+)")
  local path, queryString = pathWithQuery:match("^([^?]+)%??(.*)$")
  local function parseQuery(qs)
    local params = {}
    for key, val in qs:gmatch("([^&=?]+)=([^&=?]+)") do
      params[key] = val
    end
    return params
  end

  local params = parseQuery(queryString)

  local line = client:receive()
  local raw_headers = line
  while line ~= "" do
    raw_headers = raw_headers .. "\n" .. line

    line = client:receive()
  end

  local headers = {}
  for header in raw_headers:gmatch("[^\r\n]+") do
    local key, value = header:match("^([^:]+):%s*(.*)$")
    if key and value then
      headers[key] = value
    end
  end

  return {
    method = method,
    path = path,
    params = params,
    headers = headers,
  }
end

--- check if the given address is in the whitelist
---@param addr string
---@param whitelist table
function server.isInWhitelist(addr, whitelist)
  for _, a in pairs(whitelist) do
    local ptn = "^" .. a:gsub("%.", "%%."):gsub("%*", "%%d*") .. "$"
    if addr:match(ptn) then
      return true
    end
  end
  return false
end

function server.unauthorizedResponse()
  local response = table.concat({
    "HTTP/1.1 401 Unauthorized",
    "Content-Type: application/json",
    "Access-Control-Allow-Origin: *",
    "Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS",
    "Content-Length: 0",
    "",
  }, "\r\n")

  return response
end

function server.createResponse(body)
  return server.buildResponse(json.encode(body))
end

--- Handle get request
local function handleGetRequest(request, feather, dt)
  local data = {}

  if request.path == "/config" then
    data = feather:__getConfig()
  end

  if request.path == "/logs" then
    local bodyData = {
      data = feather.featherLogger.logs,
      screenshotEnabled = feather.captureScreenshot,
    }
    data = bodyData
    feather.lastDelivery = os.time()
  end

  if request.path == "/performance" then
    data = performance:getResponseBody(dt)
  end

  if request.path == "/observers" then
    data = feather.featherObserver:getResponseBody()
  end

  if request.path ~= nil and startsWith(request.path, "/plugins") then
    local pluginResponse = feather.pluginManager:handleRequest(request, feather)

    data = pluginResponse
  end

  return data
end

--- Handle params update request
local function handlePutRequest(request, feather)
  local data = {}

  if request.path == "/config" then
    feather:__setConfig(request.params)
  end

  if request.path ~= nil and startsWith(request.path, "/plugins") then
    local pluginResponse = feather.pluginManager:handleParamsUpdate(request, feather)

    data = pluginResponse
  end

  return data
end

--- Handle actions request
local function handlePostRequest(request, feather)
  local data = {}
  if request.path == "/logs" then
    if request.params.action == "clear" then
      feather.featherLogger:clear()
    end

    if request.params.action == "toggle-screenshots" then
      feather:toggleScreenshots(not feather.captureScreenshot)
    end
  end

  if request.path ~= nil and startsWith(request.path, "/plugins") then
    local pluginResponse = feather.pluginManager:handleActionRequest(request, feather)

    data = pluginResponse
  end

  return data
end

-- Handle a request from a client
---@param client table
---@param feather Feather
function server.handleRequest(client, feather, dt)
  if client then
    client:settimeout(1)

    local request = server.buildRequest(client)

    local addr = client:getsockname()
    if not server.isInWhitelist(addr, feather.whitelist) then
      feather:trace("non-whitelisted connection attempt: ", addr)
      client:close()
    end

    local canProcess = true

    if request.method ~= "OPTIONS" and feather.apiKey ~= "" and request.headers["x-api-key"] ~= feather.apiKey then
      canProcess = false
      client:send(server.unauthorizedResponse())
      client:close()
    end

    if request and canProcess then
      local response = {}

      if request.method == "OPTIONS" then
        local optionsResponse = server.allowedHeaders()

        client:send(optionsResponse)
        client:close()
        return
      end

      if request.method == "GET" then
        response.data = handleGetRequest(request, feather, dt)
      end

      if request.method == "PUT" then
        response.data = handlePutRequest(request, feather)
      end

      if request.method == "POST" then
        response.data = handlePostRequest(request, feather)
      end

      client:send(server.createResponse(response.data or {}))
    end

    client:close()
  end
end

return server
