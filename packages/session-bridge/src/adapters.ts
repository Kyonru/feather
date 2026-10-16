import {
  BRIDGE_MAX_HANDSHAKE_BYTES,
  BRIDGE_MAX_ID_LENGTH,
  BRIDGE_MAX_REQUEST_BYTES,
  BRIDGE_METHODS,
  BRIDGE_MIN_SUPPORTED,
  BRIDGE_VERSION,
  DEFAULT_GRANTED_METHODS,
  PREVIEW_ALLOWLIST,
  fail,
  isAllowedPreview,
  negotiate,
  nextRequestId,
  normalizeSessionList,
  ok,
  previewCommand,
  resolvePreviewTarget,
  sortSessions,
  validateHandshakeParams,
  validatePreviewCancelParams,
  validatePreviewSendParams,
  validateSelectParams,
  type BridgeErrorCode,
  type BridgeMethod,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeSessionSummary,
  type CapabilityGrant,
  type HandshakeParams,
  type HandshakeResult,
  type PreviewCancelParams,
  type PreviewSendParams,
  type PreviewSendResult,
  type SessionList,
} from './contract.ts';

/** Moves an encoded request to the other process and returns its response. */
export type BridgeTransport = (request: BridgeRequest) => Promise<BridgeResponse>;

/** A bridge call's outcome. Never a rejection: callers branch on `ok`. */
export type BridgeResult<T> = { ok: true; value: T } | { ok: false; code: BridgeErrorCode; error: string };

export interface SessionBridge {
  readonly kind: 'null' | 'client';
  /** True once a compatible peer has been reached and the capability is unexpired. */
  isConnected(): boolean;
  connect(): Promise<BridgeResult<CapabilityGrant>>;
  listSessions(): Promise<BridgeResult<SessionList>>;
  selectSession(sessionId: string): Promise<BridgeResult<BridgeSessionSummary>>;
  sendPreview(params: PreviewSendParams): Promise<BridgeResult<PreviewSendResult>>;
  cancelPreview(params: PreviewCancelParams): Promise<BridgeResult<PreviewSendResult>>;
  exportPreferences(): Promise<unknown | null>;
  /** Give the capability back. Best effort; a failed release still forgets it locally. */
  release(): Promise<void>;
}

const NO_INSPECTOR = 'No Feather Inspector is available.';

/**
 * No Inspector, and that is fine.
 *
 * Studio on the web, or on a machine with no Inspector installed, is a fully
 * useful local editor. Every call resolves rather than throwing so callers never
 * have to branch on the environment — the difference shows up as "no session
 * attached", which is a state the UI already understands.
 */
export function createNullBridge(): SessionBridge {
  const none = async () => ({ ok: false as const, code: 'no-session' as const, error: NO_INSPECTOR });
  return {
    kind: 'null',
    isConnected: () => false,
    connect: none,
    listSessions: async () => ({ ok: true, value: { sessions: [], selectedSessionId: null } }),
    selectSession: none,
    sendPreview: none,
    cancelPreview: none,
    exportPreferences: async () => null,
    release: async () => undefined,
  };
}

/**
 * The Studio side.
 *
 * Refuses to issue anything but `handshake` until negotiation has succeeded, so
 * an incompatible peer is rejected before a command can reach a game rather
 * than after.
 */
export function createClientBridge(
  transport: BridgeTransport,
  options: { clientVersion: string; clientInstanceId?: string; now?: () => number },
): SessionBridge {
  const now = options.now ?? (() => Date.now());
  const clientInstanceId = options.clientInstanceId ?? nextRequestId().replace(/[^A-Za-z0-9._-]/g, '');
  let capability: string | null = null;
  let expiresAt = 0;

  const authenticated = () => capability !== null && now() < expiresAt;

  async function call<R>(method: BridgeMethod, params: unknown): Promise<BridgeResult<R>> {
    if (method !== 'handshake' && !authenticated()) {
      return { ok: false, code: 'not-handshaken', error: 'Connect to Feather Inspector first.' };
    }
    const request: BridgeRequest = {
      id: nextRequestId(),
      bridgeVersion: BRIDGE_VERSION,
      method,
      params,
      ...(method === 'handshake' ? {} : { capability: capability as string }),
    };
    let response: BridgeResponse<R>;
    try {
      response = (await transport(request)) as BridgeResponse<R>;
    } catch (error) {
      return {
        ok: false,
        code: 'transport-failure',
        error: error instanceof Error ? error.message : 'The bridge transport failed.',
      };
    }
    if (!response || typeof response !== 'object') {
      return { ok: false, code: 'transport-failure', error: 'Feather Inspector sent an unreadable response.' };
    }
    if (response.ok) return { ok: true, value: response.result };
    const code = response.error?.code ?? 'rejected';
    // A capability the server no longer honours is gone for good; stop
    // presenting it so the UI can say "reconnect" instead of retrying.
    if (code === 'unauthenticated') capability = null;
    return { ok: false, code, error: response.error?.message ?? 'Feather Inspector refused the request.' };
  }

  return {
    kind: 'client',
    isConnected: authenticated,

    async connect() {
      const params: HandshakeParams = {
        client: 'studio',
        clientVersion: options.clientVersion,
        clientInstanceId,
        bridgeVersion: BRIDGE_VERSION,
        minSupported: BRIDGE_MIN_SUPPORTED,
      };
      const response = await call<HandshakeResult>('handshake', params);
      if (!response.ok) {
        capability = null;
        return response;
      }
      capability = response.value.capability;
      expiresAt = response.value.expiresAt;
      return { ok: true, value: response.value.grant };
    },

    async listSessions() {
      const response = await call<unknown>('sessions.list', {});
      return response.ok ? { ok: true, value: normalizeSessionList(response.value) } : response;
    },

    selectSession: (sessionId) => call<BridgeSessionSummary>('sessions.select', { sessionId }),
    sendPreview: (params) => call<PreviewSendResult>('preview.send', params),
    cancelPreview: (params) => call<PreviewSendResult>('preview.cancel', params),

    async exportPreferences() {
      const response = await call<unknown>('preferences.export', {});
      return response.ok ? response.value : null;
    },

    async release() {
      if (authenticated()) await call<null>('capability.release', {});
      capability = null;
      expiresAt = 0;
    },
  };
}

// --- the reference server ---------------------------------------------------

/** What Inspector keeps per pairing. Mirrors `Grant` in `studio_bridge.rs`. */
export interface GrantRecord {
  pairingId: string;
  clientInstanceId: string;
  clientVersion: string;
  bridgeVersion: number;
  methods: BridgeMethod[];
  sessionId: string | null;
  issuedAt: number;
  expiresAt: number;
  lastUsedAt: number;
}

export interface BridgeServerHandlers {
  serverVersion: string;
  /** Connected games, in any order; the server sorts. */
  listSessions: () => BridgeSessionSummary[];
  /** Hand a built game command to one session. Throwing reports `rejected`. */
  deliver: (sessionId: string, message: Record<string, unknown>) => Promise<void>;
  exportPreferences: () => unknown;
  now?: () => number;
  ttlMs?: number;
  mintToken?: () => string;
  mintRequestId?: () => string;
}

/** Thirty minutes: long enough to work in, short enough that a leaked token is not a standing key. */
export const CAPABILITY_TTL_MS = 30 * 60 * 1000;

function utf8Length(text: string): number {
  return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : text.length;
}

/**
 * The Inspector side, in TypeScript.
 *
 * Inspector runs the Rust mirror of this (`studio_bridge.rs`); this one is the
 * executable statement of the same rules, so the contract can be tested without
 * a Tauri build. Every method except `handshake` is gated on a valid capability,
 * the version check runs before any handler is reached, and nothing is
 * forwarded before its size and shape have been checked.
 *
 * `handle` accepts the raw request body (as Inspector receives it) or an
 * already-parsed request.
 */
export function createBridgeServer(handlers: BridgeServerHandlers) {
  const now = handlers.now ?? (() => Date.now());
  const ttl = handlers.ttlMs ?? CAPABILITY_TTL_MS;
  const mintToken = handlers.mintToken ?? (() => `studio-${nextRequestId()}`);
  const mintRequestId = handlers.mintRequestId ?? (() => `studio-${nextRequestId()}`);
  const grants = new Map<string, GrantRecord>();

  function sweep() {
    for (const [token, grant] of grants) if (grant.expiresAt <= now()) grants.delete(token);
  }

  async function handle(input: unknown): Promise<BridgeResponse> {
    let raw: unknown = input;
    let bytes: number;
    try {
      bytes = utf8Length(typeof input === 'string' ? input : (JSON.stringify(input) ?? ''));
    } catch {
      return fail('', 'malformed', 'The request could not be read.');
    }
    if (bytes > BRIDGE_MAX_REQUEST_BYTES) {
      return fail('', 'payload-too-large', 'The request is larger than the bridge accepts.');
    }
    if (typeof input === 'string') {
      try {
        raw = JSON.parse(input);
      } catch {
        return fail('', 'malformed', 'The request is not valid JSON.');
      }
    }

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return fail('', 'malformed', 'The request must be a JSON object.');
    }
    const request = raw as Partial<BridgeRequest> & Record<string, unknown>;
    const id = typeof request.id === 'string' && request.id.length <= BRIDGE_MAX_ID_LENGTH ? request.id : '';
    if (!id) return fail('', 'malformed', 'The request has no usable id.');
    if (typeof request.method !== 'string') return fail(id, 'malformed', 'The request names no method.');
    const method = request.method;

    if (method === 'handshake') {
      if (bytes > BRIDGE_MAX_HANDSHAKE_BYTES) {
        return fail(id, 'payload-too-large', 'The handshake is larger than the bridge accepts.');
      }
      const params = validateHandshakeParams(request.params);
      if (!params.ok) return fail(id, params.error.code, params.error.message);
      const result = negotiate(
        { version: BRIDGE_VERSION, minSupported: BRIDGE_MIN_SUPPORTED },
        { version: params.value.bridgeVersion, minSupported: params.value.minSupported },
      );
      if (!result.ok) return fail(id, result.error.code, result.error.message);

      sweep();
      // One standing capability per running Studio: a re-handshake replaces
      // the earlier one rather than leaving it valid alongside.
      for (const [token, grant] of grants) {
        if (grant.clientInstanceId === params.value.clientInstanceId) grants.delete(token);
      }
      const capability = mintToken();
      const issuedAt = now();
      const record: GrantRecord = {
        pairingId: `pairing-${nextRequestId()}`,
        clientInstanceId: params.value.clientInstanceId,
        clientVersion: params.value.clientVersion,
        bridgeVersion: result.version,
        methods: [...DEFAULT_GRANTED_METHODS],
        sessionId: null,
        issuedAt,
        expiresAt: issuedAt + ttl,
        lastUsedAt: issuedAt,
      };
      grants.set(capability, record);
      const payload: HandshakeResult = {
        server: 'inspector',
        serverVersion: handlers.serverVersion,
        bridgeVersion: result.version,
        capability,
        expiresAt: record.expiresAt,
        grant: describeGrant(record),
      };
      return ok(id, payload);
    }

    const token = typeof request.capability === 'string' ? request.capability : '';
    const grant = token ? grants.get(token) : undefined;
    if (!grant || grant.expiresAt <= now()) {
      if (grant) grants.delete(token);
      return fail(id, 'unauthenticated', 'Missing or expired Inspector capability. Reconnect.');
    }

    if (!(BRIDGE_METHODS as readonly string[]).includes(method)) {
      return fail(id, 'unknown-method', `Unrecognized bridge method "${method}".`);
    }
    if (!grant.methods.includes(method as BridgeMethod)) {
      return fail(id, 'forbidden', `This pairing may not call "${method}".`);
    }
    grant.lastUsedAt = now();

    const connected = () => sortSessions(handlers.listSessions());

    switch (method as BridgeMethod) {
      case 'sessions.list': {
        const sessions = connected();
        const selected = grant.sessionId && sessions.some((s) => s.id === grant.sessionId) ? grant.sessionId : null;
        return ok(id, { sessions, selectedSessionId: selected } satisfies SessionList);
      }

      case 'sessions.select': {
        const params = validateSelectParams(request.params);
        if (!params.ok) return fail(id, params.error.code, params.error.message);
        const session = connected().find((s) => s.id === params.value.sessionId);
        if (!session) {
          return fail(id, 'stale-session', 'That game is no longer connected to Feather Inspector.');
        }
        grant.sessionId = session.id;
        return ok(id, session);
      }

      case 'preview.send':
      case 'preview.cancel': {
        const isSend = method === 'preview.send';
        const params = isSend ? validatePreviewSendParams(request.params) : validatePreviewCancelParams(request.params);
        if (!params.ok) return fail(id, params.error.code, params.error.message);
        if (!isAllowedPreview(params.value.plugin, params.value.action)) {
          return fail(
            id,
            'forbidden',
            `"${params.value.plugin}:${params.value.action}" is not a creative preview this bridge can send.`,
          );
        }
        const target = resolvePreviewTarget(grant.sessionId, params.value.sessionId, connected());
        if (!target.ok) return fail(id, target.error.code, target.error.message);
        const requestId = mintRequestId();
        try {
          await handlers.deliver(target.sessionId, previewCommand(isSend ? 'send' : 'cancel', params.value, requestId));
        } catch (error) {
          return fail(id, 'rejected', error instanceof Error ? error.message : 'The game refused the preview.');
        }
        return ok(id, { requestId } satisfies PreviewSendResult);
      }

      case 'preferences.export':
        return ok(id, handlers.exportPreferences());

      case 'capability.release':
        grants.delete(token);
        return ok(id, null);

      default:
        return fail(id, 'unknown-method', `Unrecognized bridge method "${method}".`);
    }
  }

  return {
    handle,
    /** Active pairings, for Inspector's pairing list. Never includes tokens. */
    pairings: (): GrantRecord[] => {
      sweep();
      return [...grants.values()].map((grant) => ({ ...grant }));
    },
    /** Revoke one pairing; the others keep working. */
    revoke: (pairingId: string): boolean => {
      for (const [token, grant] of grants) {
        if (grant.pairingId === pairingId) {
          grants.delete(token);
          return true;
        }
      }
      return false;
    },
    revokeAll: () => grants.clear(),
  };
}

function describeGrant(grant: GrantRecord): CapabilityGrant {
  return {
    pairingId: grant.pairingId,
    bridgeVersion: grant.bridgeVersion,
    methods: [...grant.methods],
    plugins: Object.fromEntries(Object.entries(PREVIEW_ALLOWLIST).map(([plugin, actions]) => [plugin, [...actions]])),
    sessionId: grant.sessionId,
    expiresAt: grant.expiresAt,
  };
}
