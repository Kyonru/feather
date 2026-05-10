local titles = {
  ["--demo"] = "Feather Demo",
  ["--test-auto"] = "Feather Auto Test",
  ["--test-ws"] = "Feather WebSocket Test",
  ["--test-cli"] = "Feather CLI Example",
  ["--plugin-ui"] = "Feather Plugin UI Example",
  ["--hot-reload"] = "Feather Hot Reload Example",
  ["--e2e"] = "Feather Lua E2E",
}

function love.conf(t)
  local title = titles["--demo"]

  for _, value in ipairs(arg or {}) do
    if titles[value] then
      title = titles[value]
      break
    end
  end

  t.window.title = title
  t.window.width = 800
  t.window.height = 600
  t.console = false
end
