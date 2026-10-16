-- The plugin manifest contract, as data.
--
-- This file must stay a single `return { ... }` table literal: no locals, no
-- function calls, no expressions. `scripts/generate-plugin-catalog.mjs` parses
-- it with a restricted Lua-table parser so the generator and the runtime
-- validate manifests against the same vocabulary instead of two copies that
-- drift apart.
return {
  -- Capability tokens a manifest may declare in `capabilities` (required) or
  -- `optionalCapabilities`. The user's `config.capabilities` allowlist grants
  -- them; a plugin whose required capabilities are not all granted never runs.
  capabilities = { "audio", "binary", "draw", "filesystem", "input", "network", "physics" },

  -- Allowed values for each `runtime` policy field.
  runtime = {
    cost = { "low", "medium", "high" },
    update = { "always", "active", "explicit" },
    push = { "sampled", "active", "manual" },
  },

  -- Applied, with a manifest warning, when a plugin declares no runtime policy.
  -- Interest-gated so an undeclared plugin costs nothing while its page is closed.
  defaultRuntime = { cost = "low", update = "active", push = "active", sampleRate = 1 },

  -- Version of the plugin UI payload envelope (`type = "plugin"` messages).
  uiSchemaVersion = 1,

  -- Version of the plugin action request/response contract.
  actionSchemaVersion = 1,
}
