# MCP architecture

> Status (2026-10-16): partially implemented. This is the original audit; see [README.md](./README.md#current-disposition) for the reconciled status.

## Goal

Preserve one agent-facing `feather mcp` configuration while letting Inspector and Studio own,
authenticate, disable, and release their backend capabilities independently.

```text
MCP client
  -> feather mcp gateway (:stdio or :4006)
       -> Inspector backend :4005 (sessions/debug/runtime)
       -> Studio backend :4007 (creative state/actions)
```

## Findings

### 1. Gateway startup is coupled to Inspector credentials (`P0/P1`)

`mcpCommand` fails before server creation if no Inspector token exists. That means a Studio-only
creative workflow cannot use the one gateway even though Studio is documented as useful without
Inspector. For HTTP transport, the Inspector backend token is also reused as gateway client auth.
Backend authentication and MCP transport authentication are separate trust boundaries.

### 2. Response wait matching is ambiguous (`P0`)

Inspector's Rust MCP bridge stores waiters and matches by session, type, optional ID, plugin, and
action. `resolve_waiters` removes and resolves every matching waiter. Two concurrent identical
plugin/debug commands can both receive the first response.

Most tool calls do not send a unique request ID because the underlying protocol lacks one. This is
a correctness issue, not merely a performance issue.

### 3. Timed-out/failed waiters are not removed immediately (`P0/P1`)

A waiter is inserted before the command is sent. If the send fails, it remains. If timeout fires,
the receiver is dropped but the waiter stays in the vector until a matching response arrives. A
disconnected or non-responsive game can accumulate dead waiters.

### 4. Disabled Inspector MCP still records every message (`P1`)

The relay always invokes `record_message`, which parses, recursively redacts, clones, snapshots,
locks, and scans waiters. The enabled flag gates HTTP access, not the ingestion work. This directly
adds overhead to every connected game.

### 5. The gateway module is too concentrated (`P1`)

`apps/cli/src/commands/mcp.ts` contains 58 tools, six resources, transport setup, domain schemas,
debugger source lookup, helper transforms, and backend composition in about 1,857 lines. A hardcoded
server version (`3.3.1`) has already drifted from the current 4.0.0 platform.

### 6. Backend availability/capabilities are implicit (`P1`)

The gateway registers the whole surface even when one backend is absent or disabled. Calls then
fail late. There is no composite health/capability resource telling an agent which app, version,
protocol, token, session, or feature is currently available.

### 7. Backend fetches have no transport deadline (`P1`)

Tool-level `timeoutMs` often governs waiting for a game response, but `DesktopBridgeClient.send`
does not set a deadline for connecting to or reading from either app backend. A stuck backend can
hang an MCP request outside the advertised game timeout.

### 8. HTTP request bodies are unbounded (`P1`)

The gateway buffers all POST chunks before JSON parsing without a content-length/body limit. It is
loopback-only and bearer-authenticated, which reduces exposure, but local clients should still have
a documented maximum.

### 9. Generic command escape hatch is broader than typed tools (`P1`)

The generic send tool can forward arbitrary message objects. Secret stripping is top-level only.
This weakens the guarantee created by typed, reviewed tools and complicates audit logging. If kept,
it should be explicitly privileged and recursively sanitize or reject secret-bearing fields.

## Proposed design

### Independent identities

- Gateway token: authenticates MCP-over-HTTP clients to `:4006`; generated/configured by the CLI,
  not borrowed from an app backend.
- Inspector token: authenticates gateway to `:4005`.
- Studio token: authenticates gateway to `:4007`.
- Stdio transport needs no network bearer token, but each backend still requires its own credential.

The gateway starts when at least one backend is configured. Missing backends produce capability
status, not process startup failure.

### Backend capability discovery

Each backend health response should include app identity/version, backend protocol range, enabled
state, feature/tool groups, limits, and current session summary. The gateway publishes a
`feather://status` resource and can either register available tools dynamically or keep stable tools
whose descriptions/results clearly expose unavailable dependencies.

### Correlation registry

Use `requestId` end to end. Store waiters in a map keyed by `(sessionId, requestId)`. An RAII/drop
guard removes the entry on send failure, timeout, cancellation, disconnect, and server shutdown.
Only one response can resolve one waiter.

### Early disabled fast path

If Inspector MCP is disabled and no internal waiter exists, `record_message` returns before JSON
parse. If command waiting and snapshot observation need separate toggles, represent them separately
rather than keeping all work enabled.

### Domain registration modules

Split `createFeatherMcpServer` into registrars for sessions, debugger, console, plugins, replay/time
travel, shaders, particles, and textures. Tool metadata uses the current package/platform version
at build time. Common response/error and timeout logic stays in the gateway core.

### Limits and audit

Apply connect/read/overall deadlines, body-size limits, snapshot-size limits, and per-client
concurrency limits. Audit mutating tools with tool name, session, request ID, duration, result class,
and redacted parameters—never API keys or source secrets.

## Acceptance

- Studio-only and Inspector-only gateway tests both start and advertise honest capability status.
- HTTP gateway credential rotation does not rotate either backend credential.
- Two same-shape concurrent requests get distinct responses.
- Send failure, timeout, cancellation, and disconnect leave waiter count at zero.
- MCP disabled benchmark shows zero snapshot parses for ordinary game messages.
- Backend and overall request deadlines are enforced and named in errors.
- Oversized HTTP bodies and snapshots are rejected at documented limits.
- Server metadata version comes from the current artifact, not a literal.
- Domain registrars have focused tests; generic command access is explicitly privileged or removed.

