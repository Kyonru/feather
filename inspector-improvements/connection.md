# Game connection performance and reliability

> Status (2026-10-16): partially implemented. This is the original audit; see [README.md](./README.md#current-disposition) for the reconciled status.

## Finding

The idle connection is inexpensive, but the path is not safe under a large payload, a burst, or a
slow consumer. Work that appears covered by the runtime's `maxFrameMs` budget can still execute
outside that budget in WebSocket framing and socket flushes. Every transport queue also needs an
explicit byte limit and overload policy.

Current hot path:

```text
LÖVE update thread
  -> JSON encode or binary capture
  -> Lua WebSocket frame + byte-wise masking
  -> Lua send queue
  -> TCP
  -> Rust WebSocket relay queue
  -> optional MCP parse/redact/snapshot
  -> Tauri JSON event
  -> frontend parse/copy
  -> React Query caches and histories
```

The highest return comes from removing large, unbounded work from the LÖVE frame—not from reducing
React render time first.

## Evidence

### 1. WebSocket masking is synchronous and proportional to payload size (`P0`)

`packages/runtime-lua/feather/lib/ws.lua` builds a full client frame in `_sendFrame`. It masks the
payload with a Lua callback for every byte before the frame enters the send queue. The runtime
budget in `packages/runtime-lua/feather/init.lua` accounts for sampling/serialization tasks, but
this masking and subsequent flush happen outside the useful boundary.

An illustrative PUC Lua 5.4 benchmark of the same byte-wise `gsub` shape measured:

| Payload | Mask time |
| ---: | ---: |
| 4 KiB | 0.50 ms |
| 32 KiB | 3.93 ms |
| 256 KiB | 31.51 ms |
| 1 MiB | 125.04 ms |

These are not LÖVE/LuaJIT production numbers. They show the algorithmic risk and justify a target
benchmark inside LÖVE before and after the fix. At the current default `maxFrameMs = 0.5`, even the
illustrative 32 KiB case consumes almost eight budgets.

The client also uses a fixed mask key. RFC 6455 requires a fresh, unpredictable masking key for
each client-to-server frame. Masking cannot simply be disabled; key generation and incremental
masking both need correction.

### 2. The Lua queue is unbounded and drains with front removal (`P0`)

`ws.lua` queues whole framed strings. `_flush` sends until the OS refuses more and removes the
front entry with `table.remove(queue, 1)`, which shifts the remaining array. There is no maximum
queued byte count, maximum queued age, flush byte budget, or per-frame time budget.

The binary drain in `packages/runtime-lua/feather/init.lua` limits items per frame, not bytes. Two
large captures can therefore be far more expensive than many small messages.

### 3. Receive work is frame-coupled and recovery is silent (`P1`)

The client reads one 4 KiB chunk per update and parses up to 50 frames. If the receive buffer grows
past its hard limit, it is reset without a structured diagnostic. Under a burst this can turn a
recoverable lag condition into missing commands whose cause is invisible.

### 4. The Rust session channel is unbounded (`P0`)

`apps/inspector/src-tauri/src/ws_server.rs` uses Tokio's unbounded MPSC channel for outbound session
messages. An unbounded channel's `send` does not apply backpressure; memory becomes the queue limit.
That is especially risky when MCP, Studio, and the frontend can all issue commands.

### 5. Disabled MCP still pays the observation cost (`P1`)

Every text message calls `McpBridgeState::record_message`. That function parses JSON, recursively
redacts, clones values, takes the snapshots mutex, and tries to resolve waiters. The enabled flag
is checked by the HTTP handlers, not before ingestion, so games pay this cost even when MCP access
is disabled.

### 6. Native-to-frontend binary delivery expands and copies data (`P1`)

Rust emits binary bytes through a Tauri event as a `Vec<u8>`. The frontend receives `number[]` and
copies it into a `Uint8Array`. A representative 1 MiB byte pattern serialized as JSON occupies
about 3.74 MiB—roughly 3.57x—before parser and object overhead. Tauri documents events as suitable
for small data and channels/raw responses as the streaming mechanism.

### 7. Frontend batching is undone (`P1`)

The runtime sends a `logs` batch, but `apps/inspector/src/hooks/use-ws-connection.ts` loops over the
batch and updates React Query and persisted history per entry. That repeats allocation,
subscriptions, persistence scheduling, and merge work for a payload that was already batched.

### 8. Performance history grows without a cap (`P1`)

Each `performance` message appends with an array spread. Unlike the persisted log history, the
in-memory performance history has no ring size or time window. Long sessions continuously increase
copy cost and memory.

### 9. Performance telemetry is always subscribed (`P2`)

`apps/inspector/src/router.tsx` sets `performance: true` for every route and sends
`req:performance` on each route change. Other expensive features are correctly interest-gated.
Performance samples currently double as activity for connection health, so cadence cannot be
reduced safely until a dedicated heartbeat exists.

## Proposed design

### A. Give every stage a bounded byte queue

Track both item count and bytes. Item count alone does not protect against screenshots, replays,
asset previews, or plugin payloads.

| Traffic class | Overload policy |
| --- | --- |
| Auth, debugger control, command responses | Reserved capacity; never silently drop; disconnect with a named error if delivery is impossible |
| Logs | Batch; preserve errors/fatals; coalesce repeated logs; drop oldest debug/output entries only with a surfaced dropped-count marker |
| Performance/observers | Latest-value wins; old samples may be replaced |
| Asset/plugin binary | Chunk and cancel superseded previews; reject above negotiated limits |
| Replay/time-travel export | Explicit transfer job with progress, cancellation, and a total-size limit |

Expose queue depth, queued bytes, oldest age, dropped/coalesced counts, and max flush time in
`featherOverhead`. Without those numbers, tuning will become guesswork.

### B. Make frame production incremental

- Generate a fresh four-byte mask per WebSocket frame.
- Fragment large WebSocket messages into bounded chunks.
- Mask at most a configured byte/time budget per `love.update`.
- Resume masking and socket sends on later frames.
- Avoid `table.remove(..., 1)` by using head/tail indexes or a deque.
- Apply byte and time budgets to `_flush`, not only to serialization.
- Reject or stream captures that exceed the transfer contract.

Fragmentation is invisible at the application-message layer: Rust receives the reassembled message.
For truly large exports, prefer an application-level chunk protocol so progress and cancellation
remain visible.

### C. Use a dedicated Tauri binary channel

Keep small control messages on events. Deliver binary chunks through a Tauri `Channel` or a command
that returns `tauri::ipc::Response` with raw bytes. The JS side should receive an `ArrayBuffer` or
`Uint8Array` without a JSON `number[]` intermediate.

### D. Separate liveness from telemetry

Add a tiny heartbeat/ack carrying no performance snapshot. Then make telemetry cadence adaptive:

- no interested performance consumer: heartbeat only;
- performance page visible: normal sample rate;
- profiler capture active: explicit high-rate mode with a time limit;
- app backgrounded or queue pressure high: reduced cadence.

### E. Apply one state update per batch

Normalize a full `logs` message, merge it once, update React Query once, and persist history once.
Use bounded ring buffers for performance and console results. Keep full-resolution recent metrics
and decimate older points if long comparisons are required.

## Implementation phases

1. Add target LÖVE benchmarks and end-to-end queue/latency metrics.
2. Gate MCP ingestion before parsing; batch log state updates; cap performance history.
3. Replace Lua and Rust unbounded queues with byte-bounded queues and class-aware overload rules.
4. Incrementally mask/flush within the runtime frame budget and fix mask-key generation.
5. Move binary native/frontend delivery to channels or raw IPC.
6. Add heartbeat and adaptive runtime interest.
7. Only if target measurements still show masking dominant, evaluate a native LÖVE TCP transport
   for desktop with WebSocket retained where interoperability is required.

## Acceptance tests

- Sustained slow consumer: queue memory reaches a stable bound and the UI shows dropped/coalesced
  telemetry.
- 1, 8, 32, 256, and 1024 KiB payload benchmark inside LÖVE/LuaJIT: no single update exceeds the
  configured Feather budget due to transport work.
- Command flood: control/auth responses retain reserved capacity.
- Binary capture: bytes cross Tauri without JSON array expansion.
- Log burst: one runtime batch causes one cache update and one persistence operation.
- Eight-hour synthetic session: performance memory remains within its documented bound.
- MCP disabled: message-ingestion parse/snapshot counters remain zero.
- Every overload path produces a structured diagnostic; no silent receive-buffer reset.

## Primary references

- [RFC 6455, client masking requirements](https://www.rfc-editor.org/rfc/rfc6455.html)
- [Tokio unbounded channel documentation](https://docs.rs/tokio/latest/tokio/sync/mpsc/fn.unbounded_channel.html)
- [Tauri channels](https://v2.tauri.app/develop/calling-frontend/)
- [Tauri raw response bodies](https://v2.tauri.app/develop/calling-rust/)
- [LuaSocket TCP behavior](https://lunarmodules.github.io/luasocket/tcp.html)

