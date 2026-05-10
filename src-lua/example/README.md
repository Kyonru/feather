# Feather Lua Examples

Run these examples from the repository root with LÖVE:

```bash
love src-lua --demo
love src-lua --test-auto
love src-lua --test-ws
love src-lua --test-cli
love src-lua --plugin-ui
```

`--demo` is the default when no flag is passed.

The CLI injection example is a standalone LÖVE project with no Feather require:

```bash
npm run feather -- run src-lua/example/test_cli
npm run feather -- run src-lua -- --test-cli
npm run feather -- run src-lua --config src-lua/example/test_cli/feather.config.lua -- --test-cli
```

It includes a `feather.config.lua` so the CLI can demonstrate project-local configuration.
