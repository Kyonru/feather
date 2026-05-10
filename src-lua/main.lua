local examples = {
  ["--demo"] = "example.demo.main",
  ["--test-auto"] = "example.test_auto.main",
  ["--test-ws"] = "example.test_ws.main",
  ["--test-cli"] = "example.test_cli.main",
  ["--plugin-ui"] = "example.plugin_ui.main",
}

local defaultExample = "--demo"

local function printUsage()
  print("Feather examples")
  print("")
  print("Usage:")
  print("  love src-lua --demo")
  print("  love src-lua --test-auto")
  print("  love src-lua --test-ws")
  print("  love src-lua --test-cli")
  print("  love src-lua --plugin-ui")
end

for _, value in ipairs(arg or {}) do
  if value == "--help" or value == "-h" then
    printUsage()
    return
  end

  local module = examples[value]
  if module then
    require(module)
    return
  end
end

require(examples[defaultExample])
