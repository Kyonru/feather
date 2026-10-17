local examples = {
  ["--demo"] = "example.demo.main",
  ["--test-auto"] = "example.test_auto.main",
  ["--test-ws"] = "example.test_ws.main",
  ["--test-cli"] = "example.test_cli.main",
  ["--plugin-ui"] = "example.plugin_ui.main",
  ["--hot-reload"] = "example.hot_reload.main",
  ["--e2e"] = "example.e2e.main",
}

local defaultExample = "--demo"

local exampleAliases = {
  ["--test-cli"] = {
    Effect_125 = "example.test_cli.Effect_125",
    explosion = "example.test_cli.explosion",
  },
}

local function installExampleAliases(flag)
  local aliases = exampleAliases[flag]
  if not aliases then
    return
  end

  for moduleName, targetModule in pairs(aliases) do
    if not package.preload[moduleName] then
      package.preload[moduleName] = function()
        return require(targetModule)
      end
    end
  end
end

local function printUsage()
  print("Feather examples")
  print("")
  print("Usage:")
  print("  love src-lua --demo")
  print("  love src-lua --test-auto")
  print("  love src-lua --test-ws")
  print("  love src-lua --test-cli")
  print("  love src-lua --plugin-ui")
  print("  love src-lua --hot-reload")
  print("  love src-lua --e2e")
end

for _, value in ipairs(arg or {}) do
  if value == "--help" or value == "-h" then
    printUsage()
    return
  end

  local module = examples[value]
  if module then
    installExampleAliases(value)
    require(module)
    return
  end
end

installExampleAliases(defaultExample)
require(examples[defaultExample])
