# NetworkInspectorPlugin

The `NetworkInspectorPlugin` is a plugin for the [Feather Debugger](https://github.com/Kyonru/feather) that lets you **inspect network traffic** in your LÖVE game. It logs outgoing and incoming packets with timestamps, sizes, and decoded payloads — similar to the browser DevTools Network tab.

## Installation

```lua
local NetworkInspectorPlugin = require("plugins.network-inspector")
```

## Configuration

```lua
FeatherPluginManager.createPlugin(NetworkInspectorPlugin, "network-inspector", {
  maxPackets = 1000,          -- max stored packets (oldest trimmed)
  maxPayloadPreview = 200,    -- max chars shown per payload
  hookSocket = false,         -- true = auto-hook LuaSocket TCP globally
})
```

## Options

| Option              | Type    | Default | Description                                              |
| ------------------- | ------- | ------- | -------------------------------------------------------- |
| `maxPackets`        | number  | `1000`  | Maximum packets stored (FIFO overflow).                  |
| `maxPayloadPreview` | number  | `200`   | Max characters of payload shown in the table.            |
| `hookSocket`        | boolean | `false` | Auto-hook LuaSocket TCP send/receive at metatable level. |

## How It Works

### Manual wrapping (recommended)

Wrap your send/receive functions to log packets under a named endpoint:

```lua
local net = DEBUGGER.pluginManager:getPlugin("network-inspector")
if net then
  -- Wrap your send function
  mySendFn = net.instance:wrapSend("game-server", mySendFn)

  -- Wrap your receive function
  myRecvFn = net.instance:wrapReceive("game-server", myRecvFn)
end
```

The wrapped functions are transparent — they call the original and log the packet.

### Method wrapping on objects

For OOP-style network objects, wrap the methods directly:

```lua
if net then
  local client = myNetworkClient
  client.send = net.instance:wrapSend("lobby", client.send)
  client.receive = net.instance:wrapReceive("lobby", client.receive)
end
```

### HTTP requests (LuaSocket HTTP)

Wrap `socket.http.request` to log all HTTP traffic:

```lua
local http = require("socket.http")
local ltn12 = require("ltn12")
local net = DEBUGGER.pluginManager:getPlugin("network-inspector")

if net then
  local originalRequest = http.request

  http.request = function(url, body)
    -- Simple form: http.request(url)
    if type(url) == "string" then
      local endpoint = url:match("https?://([^/]+)") or url
      net.instance:_record("out", endpoint, body or ("GET " .. url), "ok")

      local result, code, headers, status = originalRequest(url, body)

      if code and code >= 200 and code < 400 then
        net.instance:_record("in", endpoint, tostring(code) .. " " .. (status or ""), "ok")
      else
        net.instance:_record("in", endpoint, tostring(status), "error", "HTTP " .. tostring(code))
      end

      return result, code, headers, status
    end

    -- Table form: http.request{ url = ..., sink = ..., ... }
    local reqTable = url
    local endpoint = reqTable.url and reqTable.url:match("https?://([^/]+)") or "http"
    local method = reqTable.method or (reqTable.source and "POST" or "GET")
    net.instance:_record("out", endpoint, method .. " " .. (reqTable.url or ""), "ok")

    local result, code, headers, status = originalRequest(reqTable, body)

    if code and code >= 200 and code < 400 then
      net.instance:_record("in", endpoint, tostring(code) .. " " .. (status or ""), "ok")
    else
      net.instance:_record("in", endpoint, tostring(status), "error", "HTTP " .. tostring(code))
    end

    return result, code, headers, status
  end
end
```

### Global LuaSocket hooking

Set `hookSocket = true` to automatically intercept **all** `tcp:send()` and `tcp:receive()` calls at the LuaSocket metatable level. This captures everything without manual wrapping, but is noisier (includes Feather's own WebSocket traffic).

### Programmatic recording

You can record packets directly from game code:

```lua
net.instance:_record("out", "game-server", '{"action":"move","x":10}', "ok")
net.instance:_record("in", "game-server", '{"ack":true}', "ok")
net.instance:_record("out", "game-server", nil, "error", "connection refused")
```

## Actions

| Action | Description                                 |
| ------ | ------------------------------------------- |
| Pause  | Toggle pause/resume packet recording        |
| Clear  | Remove all recorded packets                 |
| Export | Save packets to a JSON file via save dialog |

## Desktop UI

The table displays packets with:

- **#** — Packet ID
- **Dir** — Direction (`→ OUT` / `← IN`)
- **Endpoint** — Named source/destination
- **Size** — Payload size (B/KB/MB)
- **Status** — `✓` for success, `✗` + error message for failures
- **Time (s)** — Game time when the packet was sent/received
- **Payload** — Truncated payload preview

Use the filter input to search by endpoint, payload content, or direction.
