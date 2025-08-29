local PATH = (...):gsub("%.server_utils$", "")
local json = require(PATH .. ".lib.json")

local server = {}

---@param body string
function server.buildResponse(body)
  local response = table.concat({
    "HTTP/1.1 200 OK",
    "Content-Type: application/json",
    "Access-Control-Allow-Origin: *",
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

--- Builds a request object from a raw request string
--- @param request string
--- @return FeatherRequest
function server.buildRequest(request)
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

  return {
    method = method,
    path = path,
    params = params,
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

function server.createResponse(body)
  return server.buildResponse(json.encode(body))
end

return server
