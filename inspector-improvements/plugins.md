# Plugin system architecture

## Goal

Keep plugins extensible while making permissions, runtime cost, payload shape, and failure state
enforceable rather than descriptive.

## Findings

### 1. Capability allowlists do not enforce capability access (`P0`)

`packages/runtime-lua/feather/plugin_manager.lua` constructs the user's allowed-capability set. If
an enabled plugin requests a capability outside that set, the manager logs a warning and still
registers callbacks and runs the plugin. The setting is described as an allowlist, so behavior and
promise diverge.

Even blocking activation is only coarse enforcement. A robust capability model must expose
capability-scoped context functions instead of handing plugins unrestricted globals and asking them
to self-declare what they use.

### 2. Missing runtime policy defaults to continuous work (`P0/P1`)

Plugins without `runtime` metadata default to `update = "always"` and `push = "sampled"`. Only a
minority of manifests currently declare runtime policy. An included plugin can therefore update on
every game frame and serialize on every sample even when its UI is not open.

### 3. Forced refresh bypasses scheduling intent (`P1`)

`pushAll()` synchronously walks all plugins. `req:plugins` can create a CPU and serialization spike
exactly when a route opens. Forced freshness should enter the same bounded scheduler and report
progress/freshness.

### 4. Manifest generation is regex-based (`P1`)

`scripts/generate-plugin-catalog.mjs` extracts Lua fields with regular expressions. It supports only
a subset of the manifest and currently omits runtime policy and action contracts from the generated
catalog. Comments, alternate quoting, and richer nested metadata can be interpreted incorrectly.

### 5. Plugin UI payloads lack a negotiated boundary (`P1`)

There is no common schema version, byte limit, depth limit, node-count limit, or action-response
correlation requirement for plugin UI payloads. Third-party payloads arrive at a large generic
renderer, and oversized/malformed trees can consume Inspector resources.

### 6. Health is mostly log text (`P1`)

Update failures disable a plugin after repeated errors, which is a good isolation mechanism, but
activation/action/push failures are not represented through one structured health model. Users and
MCP need the same last error, consecutive count, disabled reason, last update/push duration, last
payload size, and queue/drop state.

### 7. The manager has too many policy roles (`P2`)

At roughly 882 lines, the manager owns discovery, compatibility, capabilities, lifecycle, callback
wrapping, scheduling, request routing, config, and catalog state. Small duplicate assignments in
the file are a symptom, not the core problem.

## Proposed design

### Activation policy

Before loading plugin code, compute one result:

```text
compatible API
AND explicitly included/default-enabled
AND all required capabilities granted
AND manifest valid
= activatable
```

If false, keep catalog metadata visible but never call `init`, `update`, LÖVE callbacks, payload
builders, or actions. Return a structured `inactiveReason` with remediation.

For a compatibility period, distinguish `requiredCapabilities` from optional capabilities. Existing
`capabilities` can migrate to required unless a manifest opts into a weaker declaration model.

### Capability-scoped context

Provide plugins a context whose methods are constructed from grants: filesystem reads/writes,
network, debug hooks, clipboard/export, or other sensitive operations. Missing methods fail closed.
Direct access to unsafe globals cannot be fully sandboxed in ordinary Lua; document that limitation
and treat built-in/trusted code separately from untrusted third-party code.

### Canonical manifest

Prefer a declarative JSON/TOML source that generates the Lua manifest and TypeScript catalog. If Lua
must remain canonical, use a real restricted parser. Validate:

- unique ID and directory mapping;
- semantic version and plugin API range;
- known capability vocabulary;
- required `runtime.cost`, `runtime.update`, `runtime.push`, and rates;
- action names, request/response schema versions, cancellation support;
- UI payload schema version and limits;
- documentation and expected tests.

No plugin should inherit an expensive runtime default silently. Existing manifests should be
backfilled before the default changes.

### Budgeted scheduler

Schedule update, payload build, and push as separate measured jobs. Use active interest, explicit
requests, cost class, payload bytes, and recent over-budget history. A forced refresh raises
priority; it does not bypass the budget.

### Versioned UI envelope

Add `schemaVersion`, `pluginVersion`, `requestId`, `generatedAt`, and optional binary references.
Validate maximum serialized bytes, depth, nodes, strings, and binary total before rendering. One
bad plugin becomes a bounded error card, not a broken Plugins route.

### Internal manager split

Keep the public manager facade and extract discovery/manifest policy, activation/capabilities,
lifecycle/callbacks, scheduling, and payload/action routing behind it. This preserves plugin-facing
behavior while making each policy testable.

## Acceptance

- A denied-capability fixture proves no plugin code or callbacks execute.
- Every built-in manifest declares explicit runtime policy and passes generated validation.
- `req:plugins` stays within the same per-frame budget as normal pushes.
- Oversized/deep/invalid UI fixtures render a structured plugin error with bounded memory.
- Plugin health is available consistently to Inspector and MCP.
- Concurrent actions use request IDs and cancellation cannot affect another request.
- Generator output includes runtime and action/UI contract metadata.
- The manager facade shrinks without changing the plugin API unless a version bump is deliberate.

