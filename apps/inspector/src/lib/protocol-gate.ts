import type { ProtocolCompatibility } from '@/constants/feather-protocol';

/**
 * Make an incompatible wire protocol operational, not only visible.
 *
 * Inspector used to evaluate the runtime's `protocolVersion`, raise a
 * persistent toast and a Session health warning — and then carry on sending
 * route interest, refreshes, debugger setup and user commands to a game it had
 * just said it could not trust. `ProtocolCompatibility.incompatible` documents
 * exactly that conclusion; this enforces it.
 *
 * An incompatible session stays attached so what already arrived can be read,
 * but no command reaches it. A `legacy` runtime (one that predates negotiation)
 * is not incompatible and is not blocked.
 *
 * Pure and module-level so the command transport can consult it without React,
 * and so it is unit-testable without a session.
 */

const incompatibleSessions = new Map<string, ProtocolCompatibility>();

/** Record the result of protocol negotiation for a session's `feather:hello`. */
export function recordSessionProtocol(sessionId: string, compatibility: ProtocolCompatibility): void {
  if (compatibility.incompatible) {
    incompatibleSessions.set(sessionId, compatibility);
  } else {
    incompatibleSessions.delete(sessionId);
  }
}

/** Forget a session, e.g. when it is removed. */
export function forgetSessionProtocol(sessionId: string): void {
  incompatibleSessions.delete(sessionId);
}

/** True when commands to this session are refused. */
export function isSessionReadOnly(sessionId: string): boolean {
  return incompatibleSessions.has(sessionId);
}

export class ProtocolIncompatibleError extends Error {
  readonly compatibility: ProtocolCompatibility;

  constructor(compatibility: ProtocolCompatibility) {
    super(`${compatibility.summary} ${compatibility.remediation}`.trim());
    this.name = 'ProtocolIncompatibleError';
    this.compatibility = compatibility;
  }
}

/**
 * Throw when a command must not be sent to this session. The thrown message
 * names the mismatch and the fix, so `sendUserCommand`'s toast is actionable.
 */
export function assertSessionAcceptsCommands(sessionId: string): void {
  const compatibility = incompatibleSessions.get(sessionId);
  if (compatibility) {
    throw new ProtocolIncompatibleError(compatibility);
  }
}

/** For tests. */
export function resetProtocolGate(): void {
  incompatibleSessions.clear();
}
