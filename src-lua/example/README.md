# Feather Lua Examples

Run these examples from the repository root with LÖVE:

```bash
love src-lua --demo
love src-lua --test-auto
love src-lua --test-ws
love src-lua --test-cli
love src-lua --plugin-ui
love src-lua --hot-reload
love src-lua --e2e
```

`--demo` is the default when no flag is passed.

The CLI injection example is a standalone LÖVE project with no Feather require:

```bash
npm run feather -- run src-lua/example/test_cli
npm run feather -- run src-lua -- --test-cli
npm run feather -- run src-lua --config src-lua/example/test_cli/feather.config.lua -- --test-cli
```

It includes a `feather.config.lua` so the CLI can demonstrate project-local configuration.

The hot reload example demonstrates the opt-in module reload flow:

```bash
love src-lua --hot-reload
```

Open Feather's **Debugger** tab, select `example/hot_reload/gameplay.lua`, edit that file, then press **Reload** or enable **Watch**.

The Lua E2E example is meant for automation. It runs assertions through LÖVE and exits on its own:

```bash
npm run test:lua:e2e
```
