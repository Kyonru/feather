/**
 * The Inspector ↔ Studio process bridge contract.
 *
 * Feather Studio and Feather Inspector are separate installed applications with
 * separate data directories. Studio can still push work into a live game, but
 * only by asking Inspector, which owns sessions. That request crosses a process
 * boundary, so it needs an explicit wire contract rather than a shared module.
 *
 * Three properties this exists to guarantee:
 *
 * 1. **Versioned.** The two applications release on separate trains, so a Studio
 *    may be older or newer than the Inspector it finds. Incompatibility is
 *    detected at handshake, before any command is accepted.
 * 2. **Authenticated.** Inspector issues a short-lived capability; Studio
 *    presents it on every request. A bridge that anything on loopback could
 *    drive would be a remote-code-execution surface, since commands reach a
 *    running game.
 * 3. **Optional.** Studio with no Inspector is a supported, fully useful state —
 *    not an error path. See `createNullBridge`.
 */

export const BRIDGE_VERSION = 1;

/** Oldest peer version this build can still talk to. */
export const BRIDGE_MIN_SUPPORTED = 1;

export type BridgeMethod =
  /** Negotiate versions and exchange a capability. Must succeed first. */
  | 'handshake'
  /** Describe the session Inspector currently has attached, if any. */
  | 'session.describe'
  /** Push a command to the attached game. */
  | 'session.send'
  /** Hand over the one-time StudioPreferencesV1 payload. */
  | 'preferences.export';

export type BridgeErrorCode =
  | 'incompatible-version'
  | 'unauthenticated'
  | 'not-handshaken'
  | 'no-session'
  | 'unknown-method'
  | 'rejected'
  | 'transport-failure';

export interface BridgeRequest<P = unknown> {
  id: string;
  bridgeVersion: number;
  method: BridgeMethod;
  /**
   * The capability issued at handshake. Absent only on `handshake` itself.
   *
   * Carried in the request body deliberately, never in a URL or query string,
   * so it does not end up in logs or history.
   */
  capability?: string;
  params: P;
}

export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
}

export type BridgeResponse<R = unknown> =
  | { id: string; bridgeVersion: number; ok: true; result: R }
  | { id: string; bridgeVersion: number; ok: false; error: BridgeError };

export interface HandshakeParams {
  /** Which application is asking. */
  client: 'studio';
  clientVersion: string;
  bridgeVersion: number;
  minSupported: number;
}

export interface HandshakeResult {
  server: 'inspector';
  serverVersion: string;
  bridgeVersion: number;
  /** Short-lived. Studio must re-handshake when it expires. */
  capability: string;
  expiresAt: number;
}

export interface SessionDescription {
  sessionId: string | null;
  name: string | null;
  connected: boolean;
}

export interface SendParams {
  sessionId: string;
  message: string | Record<string, unknown>;
}

/**
 * Decide whether two bridge peers can talk.
 *
 * Compatibility is a range overlap, not equality: each side declares the newest
 * version it speaks and the oldest it still accepts. Equality would force the
 * two applications to release in lock-step, which is the thing v4 exists to
 * stop.
 */
export function negotiate(
  local: { version: number; minSupported: number },
  remote: { version: number; minSupported: number },
): { ok: true; version: number } | { ok: false; error: BridgeError } {
  const shared = Math.min(local.version, remote.version);

  if (shared < local.minSupported || shared < remote.minSupported) {
    return {
      ok: false,
      error: {
        code: 'incompatible-version',
        message:
          `No shared bridge version. This build speaks v${local.minSupported}–v${local.version}; ` +
          `the other speaks v${remote.minSupported}–v${remote.version}. Update the older application.`,
      },
    };
  }

  return { ok: true, version: shared };
}

export function ok<R>(id: string, result: R): BridgeResponse<R> {
  return { id, bridgeVersion: BRIDGE_VERSION, ok: true, result };
}

export function fail(id: string, code: BridgeErrorCode, message: string): BridgeResponse<never> {
  return { id, bridgeVersion: BRIDGE_VERSION, ok: false, error: { code, message } };
}

let counter = 0;
export function nextRequestId(): string {
  counter += 1;
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `bridge-${Date.now().toString(36)}-${counter}`;
}

/**
 * The one-time preferences handoff.
 *
 * Feather Studio is a separately installed application with its own storage
 * origin, so it can never read Inspector's `settings-storage` key directly. On
 * first pairing it asks for this payload instead, and Inspector answers from the
 * copy the in-place migration deliberately never deleted.
 *
 * The shape lives here, in the shared contract, precisely so Inspector can
 * produce it without importing any Studio code — which the lint guards forbid
 * and which would undo the application split.
 *
 * Fields are optional because the source is old persisted state that may predate
 * any of them. The receiver normalizes; this type only describes the wire.
 */
export interface StudioPreferencesPayload {
  version: number;
  textureLabRecipe?: unknown;
  textureLabSavedRecipes?: unknown;
  textureLabWorkspaceId?: string;
  textureLabWorkspaces?: Record<string, unknown>;
  collapsedShaderGraphNodeCategories?: unknown;
  particleTimelineZoom?: number;
  particleTimelineSnap?: boolean;
  assetSourceDir?: string;
}

/** The keys Inspector hands over. Kept beside the type so they cannot drift. */
export const STUDIO_PREFERENCE_KEYS = [
  'textureLabRecipe',
  'textureLabSavedRecipes',
  'textureLabWorkspaceId',
  'textureLabWorkspaces',
  'collapsedShaderGraphNodeCategories',
  'particleTimelineZoom',
  'particleTimelineSnap',
  'assetSourceDir',
] as const;
