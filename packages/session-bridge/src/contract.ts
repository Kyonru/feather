/**
 * The Inspector ↔ Studio process bridge contract.
 *
 * Feather Studio and Feather Inspector are separate installed applications with
 * separate data directories. Studio can still push work into a live game, but
 * only by asking Inspector, which owns sessions. That request crosses a process
 * boundary, so it needs an explicit wire contract rather than a shared module.
 *
 * Four properties this exists to guarantee:
 *
 * 1. **Versioned.** The two applications release on separate trains, so a Studio
 *    may be older or newer than the Inspector it finds. Incompatibility is
 *    detected at handshake, before any command is accepted.
 * 2. **Authenticated.** Inspector issues a short-lived capability; Studio
 *    presents it on every request. A bridge that anything on loopback could
 *    drive would be a remote-code-execution surface, since commands reach a
 *    running game.
 * 3. **Narrow.** A capability can only reach the creative preview plugins, and
 *    only the actions listed in `PREVIEW_ALLOWLIST`. There is no generic
 *    "send this message" method: Studio says *what it wants previewed*, and
 *    Inspector builds the game command. Eval, the debugger, Console, hot
 *    reload, packages and replay are unreachable by construction.
 * 4. **Optional.** Studio with no Inspector is a supported, fully useful state —
 *    not an error path. See `createNullBridge`.
 *
 * Mirrored by hand in `apps/inspector/src-tauri/src/studio_bridge.rs`. The
 * version range, method names, error codes, allowlist and size limits are
 * compared by `pnpm run check:protocol`, so the two cannot drift silently.
 */

/**
 * v2 replaced the generic `session.send` with the narrow preview methods.
 *
 * The minimum moved with it on purpose: a v1 peer would still speak
 * `session.send`, and accepting one would reopen exactly the surface v2 closes.
 */
export const BRIDGE_VERSION = 2;

/** Oldest peer version this build can still talk to. */
export const BRIDGE_MIN_SUPPORTED = 2;

/** Every method the server understands, in a form the drift check can read. */
export const BRIDGE_METHODS = [
  'handshake',
  'sessions.list',
  'sessions.select',
  'preview.send',
  'preview.cancel',
  'preferences.export',
  'capability.release',
] as const;

export type BridgeMethod = (typeof BRIDGE_METHODS)[number];

/**
 * What a fresh capability may call. Everything except the handshake that
 * issued it — and nothing that is not in `BRIDGE_METHODS`, so a future generic
 * method would have to be granted deliberately rather than arriving by default.
 */
export const DEFAULT_GRANTED_METHODS: readonly BridgeMethod[] = BRIDGE_METHODS.filter(
  (method) => method !== 'handshake',
);

/** Codes the server answers with. Compared against the Rust server. */
export const BRIDGE_SERVER_ERROR_CODES = [
  'incompatible-version',
  'unauthenticated',
  'malformed',
  'payload-too-large',
  'unknown-method',
  'forbidden',
  'no-session',
  'selection-required',
  'stale-session',
  'rejected',
] as const;

/** Codes only the Studio client produces, without a round trip. */
export const BRIDGE_CLIENT_ERROR_CODES = ['not-handshaken', 'transport-failure'] as const;

export type BridgeErrorCode =
  | (typeof BRIDGE_SERVER_ERROR_CODES)[number]
  | (typeof BRIDGE_CLIENT_ERROR_CODES)[number];

/**
 * The plugin actions a capability may trigger, per creative plugin.
 *
 * This is the whole of what Studio can make a game do. Each entry is a preview
 * Studio actually sends today; adding one is a deliberate widening of the
 * bridge and has to be made on both sides.
 */
export const PREVIEW_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  'shader-graph': ['preview-shader', 'clear-preview', 'compile-shader'],
  'particle-system-playground': ['set-shader'],
};

/** Size and shape limits, checked before anything is forwarded. */
export const BRIDGE_MAX_REQUEST_BYTES = 8 * 1024 * 1024;
export const BRIDGE_MAX_HANDSHAKE_BYTES = 4096;
export const BRIDGE_MAX_ID_LENGTH = 128;
export const BRIDGE_MAX_NAME_LENGTH = 64;

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
  /**
   * One per running Studio. A re-handshake from the same instance replaces its
   * earlier capability instead of accumulating standing tokens.
   */
  clientInstanceId: string;
  bridgeVersion: number;
  minSupported: number;
}

/**
 * What a capability allows. Returned at handshake so Studio can show it, and
 * listed by Inspector so a pairing can be revoked on its own.
 */
export interface CapabilityGrant {
  /** Public identifier of this pairing. Safe to display; it is not the token. */
  pairingId: string;
  bridgeVersion: number;
  methods: BridgeMethod[];
  plugins: Record<string, string[]>;
  /** The one session this pairing may preview into, once chosen. */
  sessionId: string | null;
  expiresAt: number;
}

export interface HandshakeResult {
  server: 'inspector';
  serverVersion: string;
  bridgeVersion: number;
  /** Short-lived. Studio must re-handshake when it expires. */
  capability: string;
  expiresAt: number;
  grant: CapabilityGrant;
}

/** A connected game, as Inspector reports it. */
export interface BridgeSessionSummary {
  id: string;
  name: string | null;
  /** When this run of the game connected. A restart is a new id and a later time. */
  connectedAt: number;
}

export interface SessionList {
  /** Oldest connection first; ties broken by id, so the order is stable. */
  sessions: BridgeSessionSummary[];
  /** The session this pairing is scoped to, or null when none is chosen or it has gone. */
  selectedSessionId: string | null;
}

export interface SelectSessionParams {
  sessionId: string;
}

export interface PreviewSendParams {
  sessionId: string;
  plugin: string;
  action: string;
  params: Record<string, unknown>;
}

export interface PreviewCancelParams {
  sessionId: string;
  plugin: string;
  action: string;
}

export interface PreviewSendResult {
  /** Echoed by the runtime on its response, so the answer can be matched later. */
  requestId: string;
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

// --- validation ------------------------------------------------------------
// Pure, so the TypeScript reference server, Studio's client and the tests all
// agree on one reading of a payload. The Rust server applies the same rules.

type Validated<T> = { ok: true; value: T } | { ok: false; error: BridgeError };

function malformed(message: string): { ok: false; error: BridgeError } {
  return { ok: false, error: { code: 'malformed', message } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function boundedInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000;
}

/** Identity tokens: letters, digits, dot, dash, underscore. No whitespace, no markup. */
const IDENT = /^[A-Za-z0-9._-]+$/;

export function validateHandshakeParams(raw: unknown): Validated<HandshakeParams> {
  if (!isRecord(raw)) return malformed('Handshake parameters must be an object.');
  if (raw.client !== 'studio') return malformed('Only Feather Studio may pair with Inspector.');
  if (!boundedString(raw.clientVersion, BRIDGE_MAX_NAME_LENGTH) || !IDENT.test(raw.clientVersion)) {
    return malformed('Handshake is missing a valid clientVersion.');
  }
  if (!boundedString(raw.clientInstanceId, BRIDGE_MAX_ID_LENGTH) || !IDENT.test(raw.clientInstanceId)) {
    return malformed('Handshake is missing a valid clientInstanceId.');
  }
  if (!boundedInteger(raw.bridgeVersion) || !boundedInteger(raw.minSupported)) {
    return malformed('Handshake bridge versions must be whole numbers.');
  }
  return {
    ok: true,
    value: {
      client: 'studio',
      clientVersion: raw.clientVersion,
      clientInstanceId: raw.clientInstanceId,
      bridgeVersion: raw.bridgeVersion,
      minSupported: raw.minSupported,
    },
  };
}

export function validateSelectParams(raw: unknown): Validated<SelectSessionParams> {
  if (!isRecord(raw) || !boundedString(raw.sessionId, BRIDGE_MAX_ID_LENGTH)) {
    return malformed('sessions.select needs a sessionId.');
  }
  return { ok: true, value: { sessionId: raw.sessionId } };
}

function validatePreviewTarget(raw: unknown, method: 'preview.send' | 'preview.cancel') {
  if (!isRecord(raw)) return malformed(`${method} parameters must be an object.`);
  if (!boundedString(raw.sessionId, BRIDGE_MAX_ID_LENGTH)) return malformed(`${method} needs a sessionId.`);
  if (!boundedString(raw.plugin, BRIDGE_MAX_NAME_LENGTH)) return malformed(`${method} needs a plugin id.`);
  if (!boundedString(raw.action, BRIDGE_MAX_NAME_LENGTH)) return malformed(`${method} needs an action.`);
  return { ok: true as const, value: raw as Record<string, unknown> & { sessionId: string; plugin: string; action: string } };
}

export function validatePreviewSendParams(raw: unknown): Validated<PreviewSendParams> {
  const target = validatePreviewTarget(raw, 'preview.send');
  if (!target.ok) return target;
  const params = target.value.params ?? {};
  if (!isRecord(params)) return malformed('preview.send params must be an object.');
  return {
    ok: true,
    value: { sessionId: target.value.sessionId, plugin: target.value.plugin, action: target.value.action, params },
  };
}

export function validatePreviewCancelParams(raw: unknown): Validated<PreviewCancelParams> {
  const target = validatePreviewTarget(raw, 'preview.cancel');
  if (!target.ok) return target;
  return {
    ok: true,
    value: { sessionId: target.value.sessionId, plugin: target.value.plugin, action: target.value.action },
  };
}

/** Is this plugin action one a bridge capability may trigger? */
export function isAllowedPreview(plugin: string, action: string): boolean {
  return Object.prototype.hasOwnProperty.call(PREVIEW_ALLOWLIST, plugin) && PREVIEW_ALLOWLIST[plugin].includes(action);
}

/** Oldest connection first, ties by id — never the order a hash map happens to iterate in. */
export function sortSessions<T extends { id: string; connectedAt: number }>(sessions: readonly T[]): T[] {
  return [...sessions].sort((a, b) => a.connectedAt - b.connectedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Where a preview goes, or why it cannot.
 *
 * The pairing's scope is the only target. With no scope chosen, one game is not
 * an excuse to guess: the caller has to select, which is how a restarted game —
 * a new session id — stops receiving previews meant for the run before it.
 */
export function resolvePreviewTarget(
  scope: string | null,
  requested: string,
  connected: readonly { id: string }[],
): { ok: true; sessionId: string } | { ok: false; error: BridgeError } {
  if (!scope) {
    return connected.length === 0
      ? { ok: false, error: { code: 'no-session', message: 'Feather Inspector has no game attached.' } }
      : {
          ok: false,
          error: { code: 'selection-required', message: 'Choose which game to preview in before sending.' },
        };
  }
  if (requested !== scope) {
    return { ok: false, error: { code: 'forbidden', message: 'That game is outside this pairing. Select it first.' } };
  }
  if (!connected.some((session) => session.id === scope)) {
    return {
      ok: false,
      error: { code: 'stale-session', message: 'The game this pairing previewed into has disconnected or restarted.' },
    };
  }
  return { ok: true, sessionId: scope };
}

/**
 * The game command a preview becomes.
 *
 * Built here, not by the caller: Studio names a plugin and an action, and the
 * only message types that can result are these two. `requestId` follows the
 * shared correlation contract — any `cmd:*` may carry one and the runtime
 * echoes it on its response.
 */
export function previewCommand(
  kind: 'send' | 'cancel',
  params: { plugin: string; action: string; params?: Record<string, unknown> },
  requestId: string,
): Record<string, unknown> {
  return kind === 'send'
    ? { type: 'cmd:plugin:action', plugin: params.plugin, action: params.action, params: params.params ?? {}, requestId }
    : { type: 'cmd:plugin:action:cancel', plugin: params.plugin, action: params.action, requestId };
}

/**
 * Coerce Inspector's session list.
 *
 * Inspector is first-party, but it is a different application on a different
 * release train, and this is the value Studio renders a picker from.
 */
export function normalizeSessionList(raw: unknown): SessionList {
  const source = isRecord(raw) ? raw : {};
  const sessions = Array.isArray(source.sessions)
    ? source.sessions.flatMap((entry): BridgeSessionSummary[] => {
        if (!isRecord(entry) || !boundedString(entry.id, BRIDGE_MAX_ID_LENGTH)) return [];
        const connectedAt = Number(entry.connectedAt);
        return [
          {
            id: entry.id,
            name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.slice(0, 120) : null,
            connectedAt: Number.isFinite(connectedAt) ? connectedAt : 0,
          },
        ];
      })
    : [];
  const sorted = sortSessions(sessions);
  const selected = typeof source.selectedSessionId === 'string' ? source.selectedSessionId : null;
  return {
    sessions: sorted,
    selectedSessionId: selected && sorted.some((session) => session.id === selected) ? selected : null,
  };
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
