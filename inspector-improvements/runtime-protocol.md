# Lua runtime and wire protocol

## Goal

Make version skew safe in behavior, not only visible in the UI, while preserving Rust as a
transparent relay for ordinary messages.

## Findings

### 1. Incompatible sessions still operate (`P0`)

The runtime advertises `protocolVersion`, and Inspector evaluates it. On mismatch the app shows a
persistent toast and Session health warning, but normal route interest, refreshes, debugger setup,
and user commands can continue. The type documentation says the desktop should not trust these
round trips; the runtime behavior does not enforce that conclusion.

### 2. Message names are centralized; load-bearing payloads are not (`P1`)

`packages/protocol` correctly owns the two message-name registries and validates the inbound
envelope. Payloads remain `unknown`, and handlers use many assertions. `V4.md` correctly rejected a
speculative schema for all heterogeneous messages. That should not prevent targeted validation for
payloads whose corruption can mutate state or resolve a command.

Priority schemas:

- `feather:hello` and auth messages;
- command responses and their correlation IDs;
- plugin action envelopes;
- debugger status/paused/frame;
- binary attachment descriptors and chunk metadata;
- replay/time-travel import metadata;
- logs/performance batch outer shapes and size limits.

### 3. Protocol version is copied between Lua and Inspector (`P1`)

`check:protocol` compares the declarations, which is useful, but the version and supported range do
not live with the message registry. The handshake also reports only the runtime's current version,
not a supported range or feature set.

### 4. Request/response correlation is inconsistent (`P0`)

Some operations carry an ID (`eval:response`), while MCP waits can match only type, plugin, and
action. Concurrent identical actions are therefore ambiguous. A response protocol should require a
request ID for every command that waits.

### 5. Runtime responsibilities are concentrated (`P2`)

`packages/runtime-lua/feather/init.lua` is about 1,635 lines and combines configuration, lifecycle,
logging, transport, sampling, binary attachments, command dispatch, plugin coordination, debugger
coordination, and telemetry. The budget scheduler exists, but not all transport work passes through
it (see `connection.md`).

### 6. Buffer overflow is not a protocol event (`P1`)

Receive-buffer reset and overload/drop decisions are local implementation details today. They need
named diagnostics so Inspector can distinguish an unsupported message, a corrupt message, and a
consumer that fell behind.

## Proposed protocol evolution

### Compatibility state machine

1. Authenticate transport.
2. Exchange protocol current/minimum versions, runtime/plugin API versions, supported features,
   and maximum payload/chunk sizes.
3. Select a shared protocol version.
4. If no overlap exists, keep the session attached in read-only historical mode, stop live refresh
   commands, and reject mutating sends locally with remediation.
5. Record negotiated version/features on the session rather than in a global config store.

Legacy runtimes remain supported through a deliberately named legacy profile until that profile is
retired in a release note.

### Correlated command envelope

```json
{
  "type": "cmd:plugin:action",
  "requestId": "uuid",
  "plugin": "shader-graph",
  "action": "compile-shader",
  "data": {}
}
```

Every response echoes `requestId`. Timeouts and cancellation address that ID. During migration,
Inspector may fall back to shape matching only when exactly one legacy waiter exists for that shape.

### Targeted validation

Use schemas at trust boundaries, preserve unknown fields, and return a structured rejection rather
than rebuilding payloads. Do not attempt a mandatory schema for all messages at once. Generate Lua
constants or lightweight validators only where the same contract exists on both sides.

### Runtime decomposition

Extract modules along existing behavior boundaries:

- lifecycle/config/handshake;
- command router and authorization;
- telemetry scheduler;
- log batcher;
- binary transfer manager;
- connection adapter;
- plugin manager integration.

Keep a small `Feather` facade so existing plugin/runtime integrations remain compatible.

## Acceptance

- An unsupported protocol receives no live refresh, debugger-enable, eval, or plugin-action command.
- Two simultaneous identical commands cannot consume the same response.
- Targeted malformed payload fixtures fail with a named reason and do not partially mutate state.
- Unknown fields survive validation for forward compatibility.
- Runtime and desktop negotiate limits/features in one handshake.
- Queue overflow and dropped data appear as protocol diagnostics.
- The Rust game WebSocket relay does not deserialize ordinary domain payloads.
- `check:protocol` validates versions, message registries, and generated targeted contracts.

