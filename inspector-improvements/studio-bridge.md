# Inspector-to-Studio bridge

> Status (2026-10-16): implemented. This is the original audit; see [README.md](./README.md#current-disposition) for the reconciled status.

## Scope

This reviews only the process contract in `packages/session-bridge` and
`apps/inspector/src-tauri/src/studio_bridge.rs`. It does not propose changes inside Studio's active
UI work.

## Findings

### 1. The capability is broader than the stated purpose (`P0`)

The bridge exists so Studio can preview creative work in a game. After handshake,
`session.send` accepts an arbitrary string or object and forwards it to the selected game's
WebSocket. A compromised or buggy Studio process can therefore issue debugger, eval, Console,
hot-reload, replay, or other commands—not only creative plugin actions.

### 2. Session selection is not explicit (`P0/P1`)

`session.describe` selects the first key from a Rust `HashMap`. That order is not a user choice and
is not stable. With multiple connected games, Studio can describe/preview against an arbitrary
session unless its caller already knows an ID from elsewhere.

### 3. The contract is duplicated across TypeScript and Rust (`P1`)

Bridge version, minimum version, methods, error codes, request fields, and negotiation exist in
`packages/session-bridge/src/contract.ts` and are manually mirrored in Rust with a “keep in step”
comment. Tests cover the TypeScript adapter and some Rust behavior, but no generator/check proves
the two contracts agree.

### 4. Handshake input is only loosely validated (`P1`)

The Rust endpoint primarily reads numeric version fields. It does not strongly validate client
identity, request size, method-specific parameter shape, or a nonce/process pairing intent before
minting a 30-minute capability. Loopback is an important control, but any local process can request
a capability.

### 5. Capability scope is not represented (`P1`)

Tokens have expiry but no methods, session IDs, plugin IDs, or action set attached to them. Revoking
all tokens is supported; revoking one pairing or narrowing a token is not.

## Proposed design

### Scoped handshake

Issue a capability record containing:

- client instance ID and Studio version;
- negotiated bridge version;
- allowed methods;
- allowed session IDs (or permission to list/select);
- allowed plugin IDs/actions;
- expiry and last-used time.

Require explicit user approval for first pairing if the product threat model includes untrusted
local processes. At minimum, show the active pairing and provide individual revoke controls.

### Narrow methods

Replace generic `session.send` for normal Studio use with high-level methods such as
`sessions.list`, `preview.send`, and `preview.cancel`. Inspector translates them to an allowlisted
`cmd:plugin:action` for creative preview plugins. Keep a generic method only behind a separately
named development capability that is off by default.

### Explicit session identity

Return a sorted session list with ID, name, device, connected time, and compatible preview features.
Studio selects and remembers an ID; Inspector rejects stale/disconnected IDs. With multiple sessions
and no selection, return `selection-required` instead of choosing one.

### Generated/checked contract

Make one declarative bridge schema generate or validate TypeScript and Rust constants/types. If code
generation is excessive, add a repository check that compares version ranges, method strings, error
codes, and required fields across both implementations.

## Acceptance

- A bridge token cannot send eval, debugger, Console, hot-reload, package, or replay commands.
- Multiple connected sessions require an explicit stable selection.
- Revoking one capability does not require revoking unrelated pairings.
- Expiry, method scope, session scope, and action scope are tested in both TypeScript and Rust.
- A contract drift fixture fails CI.
- Oversized or malformed handshake/method payloads are rejected before command forwarding.
- Inspector remains fully useful when Studio is absent, and Studio remains fully useful locally
  when Inspector is absent.

