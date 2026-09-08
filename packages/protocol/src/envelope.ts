import { isToDesktopMessage, type ToDesktopMessage } from './messages';

/**
 * The envelope every game -> desktop message shares.
 *
 * `_session` is added by the Rust relay before the message reaches the desktop
 * app; the Lua runtime sends `session`. Everything past the envelope is
 * message-specific and stays `unknown` here — see the note at the bottom of
 * this file on why payload shapes are not described.
 */
export interface InboundEnvelope {
  _session: string;
  type: ToDesktopMessage;
  data?: unknown;
  plugin?: string;
  /**
   * Not every message nests its payload under `data`. `eval:response` carries
   * `id` / `status` / `result` / `prints` at the top level, and several others
   * do the same. Validation must never be lossy, so unknown keys are preserved
   * rather than stripped.
   */
  [key: string]: unknown;
}

export type InboundRejection =
  | 'not-json'
  | 'not-object'
  | 'missing-session'
  | 'missing-type'
  | 'unknown-type';

export type InboundParseResult =
  | { ok: true; message: InboundEnvelope }
  | { ok: false; reason: InboundRejection; detail: string; type?: string };

/**
 * Parse and validate a raw game -> desktop message.
 *
 * Replaces an unchecked `JSON.parse(...) as WsMessage` cast. The important case
 * is `unknown-type`: now that the runtime and the desktop ship on separate
 * release trains, a newer runtime can legitimately send a message this build has
 * never heard of. That is a *skew signal*, not corruption, so it is reported
 * rather than swallowed — the caller decides whether to log or ignore it.
 */
export function parseInbound(raw: string): InboundParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: 'not-json', detail: 'Payload was not valid JSON.' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'not-object', detail: 'Message was not a JSON object.' };
  }

  const candidate = parsed as Record<string, unknown>;

  if (typeof candidate._session !== 'string' || candidate._session.length === 0) {
    return { ok: false, reason: 'missing-session', detail: 'Message had no _session.' };
  }

  if (typeof candidate.type !== 'string' || candidate.type.length === 0) {
    return { ok: false, reason: 'missing-type', detail: 'Message had no type.' };
  }

  if (!isToDesktopMessage(candidate.type)) {
    return {
      ok: false,
      reason: 'unknown-type',
      type: candidate.type,
      detail: `Unrecognized message type "${candidate.type}". The game may be running a newer Feather runtime than this desktop app.`,
    };
  }

  // Return the original object, not a rebuilt one: rebuilding from the four
  // known keys would silently drop every message-specific top-level field.
  return { ok: true, message: candidate as InboundEnvelope };
}

/*
 * On payload shapes
 * -----------------
 * `data` is deliberately `unknown`. The 78 messages carry heterogeneous
 * payloads, and a schema that describes a shape *incorrectly* is worse than one
 * that declines to: it would make handlers trust a field the runtime never
 * sends. Deriving each shape from its handler is tracked in V4.md Phase 02b.
 *
 * The envelope and the message set are what make skew detectable, and those are
 * exact.
 *
 * On Rust
 * -------
 * `src-tauri/src/ws_server.rs` parses exactly one message — `auth:response`, for
 * the appId handshake. Every other message is relayed as raw text and never
 * deserialized. Generating serde structs for the other 77 would be dead code, so
 * this package does not emit any.
 */
