/**
 * The optional connection from an editing tool to a live game session.
 *
 * The creative tools can push their work into a running game, but only when one
 * is attached. On the web there is no game, no Tauri, and no transport — so this
 * package exists to make "there is no session" a first-class state rather than a
 * missing import.
 *
 * It abstracts exactly one thing: sending a command. Everything else the studio
 * touches (the session store, plugin control, the preview upload helper) is
 * already portable — only `invoke('send_command', ...)` is Tauri-bound.
 *
 * The desktop app registers a real sender at startup. Nothing registers one on
 * the web, so sends become no-ops and the tools stay usable as local editors.
 */

// The versioned cross-process contract (V4.md Phase 05b).
export {
  BRIDGE_VERSION,
  BRIDGE_MIN_SUPPORTED,
  negotiate,
  nextRequestId,
  ok,
  fail,
} from './contract.ts';
export type {
  BridgeMethod,
  BridgeErrorCode,
  BridgeRequest,
  BridgeResponse,
  BridgeError,
  HandshakeParams,
  HandshakeResult,
  SessionDescription,
  SendParams,
} from './contract.ts';

export { createNullBridge, createClientBridge, createBridgeServer } from './adapters.ts';
export type { SessionBridge, BridgeTransport, BridgeServerHandlers } from './adapters.ts';

export type CommandMessage = string | Record<string, unknown>;

export type CommandSender = (sessionId: string, message: CommandMessage) => Promise<void>;

/** No session attached: pushing to the game is simply not available. */
const noSession: CommandSender = () => Promise.resolve();

let sender: CommandSender = noSession;

/**
 * Install the transport. Called once by the host application at startup.
 *
 * A module-level registry rather than React context because the studio's
 * preview controllers are module singletons created at import time, and
 * threading a hook through them would be a larger change than the coupling
 * warrants.
 */
export function setCommandSender(next: CommandSender): void {
  sender = next;
}

/** Remove the transport, restoring no-op behaviour. Intended for tests. */
export function clearCommandSender(): void {
  sender = noSession;
}

/** True when a real transport is installed, i.e. a game can actually be reached. */
export function hasSession(): boolean {
  return sender !== noSession;
}

/**
 * Push a command to the running game.
 *
 * Resolves without doing anything when no session is attached, so callers do not
 * need to branch on the environment.
 */
export function sendCommand(sessionId: string, message: CommandMessage): Promise<void> {
  return sender(sessionId, message);
}
