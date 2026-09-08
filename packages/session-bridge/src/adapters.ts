import {
  BRIDGE_MIN_SUPPORTED,
  BRIDGE_VERSION,
  fail,
  nextRequestId,
  negotiate,
  ok,
  type BridgeMethod,
  type BridgeRequest,
  type BridgeResponse,
  type HandshakeParams,
  type HandshakeResult,
  type SendParams,
  type SessionDescription,
} from './contract.ts';

/** Moves an encoded request to the other process and returns its response. */
export type BridgeTransport = (request: BridgeRequest) => Promise<BridgeResponse>;

export interface SessionBridge {
  readonly kind: 'null' | 'client' | 'server';
  /** True once a compatible peer has been reached. */
  isConnected(): boolean;
  connect(): Promise<{ ok: boolean; error?: string }>;
  describeSession(): Promise<SessionDescription>;
  send(params: SendParams): Promise<{ ok: boolean; error?: string }>;
  exportPreferences(): Promise<unknown | null>;
}

/**
 * No Inspector, and that is fine.
 *
 * Studio on the web, or on a machine with no Inspector installed, is a fully
 * useful local editor. Every call resolves rather than throwing so callers never
 * have to branch on the environment — the difference shows up as "no session
 * attached", which is a state the UI already understands.
 */
export function createNullBridge(): SessionBridge {
  return {
    kind: 'null',
    isConnected: () => false,
    connect: async () => ({ ok: false, error: 'No Feather Inspector is available.' }),
    describeSession: async () => ({ sessionId: null, name: null, connected: false }),
    send: async () => ({ ok: false, error: 'No Feather Inspector is available.' }),
    exportPreferences: async () => null,
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
  options: { clientVersion: string },
): SessionBridge {
  let capability: string | null = null;
  let expiresAt = 0;

  const authenticated = () => capability !== null && Date.now() < expiresAt;

  async function call<R>(method: BridgeMethod, params: unknown): Promise<BridgeResponse<R>> {
    if (method !== 'handshake' && !authenticated()) {
      return fail(nextRequestId(), 'not-handshaken', 'Connect to Feather Inspector first.') as BridgeResponse<R>;
    }
    const request: BridgeRequest = {
      id: nextRequestId(),
      bridgeVersion: BRIDGE_VERSION,
      method,
      params,
      ...(method === 'handshake' ? {} : { capability: capability as string }),
    };
    try {
      return (await transport(request)) as BridgeResponse<R>;
    } catch (error) {
      return fail(
        request.id,
        'transport-failure',
        error instanceof Error ? error.message : 'The bridge transport failed.',
      ) as BridgeResponse<R>;
    }
  }

  return {
    kind: 'client',
    isConnected: authenticated,

    async connect() {
      const params: HandshakeParams = {
        client: 'studio',
        clientVersion: options.clientVersion,
        bridgeVersion: BRIDGE_VERSION,
        minSupported: BRIDGE_MIN_SUPPORTED,
      };
      const response = await call<HandshakeResult>('handshake', params);
      if (!response.ok) {
        capability = null;
        return { ok: false, error: response.error.message };
      }
      capability = response.result.capability;
      expiresAt = response.result.expiresAt;
      return { ok: true };
    },

    async describeSession() {
      const response = await call<SessionDescription>('session.describe', {});
      return response.ok ? response.result : { sessionId: null, name: null, connected: false };
    },

    async send(params: SendParams) {
      const response = await call<null>('session.send', params);
      return response.ok ? { ok: true } : { ok: false, error: response.error.message };
    },

    async exportPreferences() {
      const response = await call<unknown>('preferences.export', {});
      return response.ok ? response.result : null;
    },
  };
}

export interface BridgeServerHandlers {
  /** Mint a short-lived capability. Called only after versions negotiate. */
  issueCapability: () => { capability: string; expiresAt: number };
  /** Verify a presented capability. */
  verifyCapability: (capability: string) => boolean;
  serverVersion: string;
  describeSession: () => SessionDescription;
  send: (params: SendParams) => Promise<void>;
  exportPreferences: () => unknown;
}

/**
 * The Inspector side: turn an encoded request into a response.
 *
 * Every method except `handshake` is gated on a valid capability, and the
 * version check runs before any handler is reached — an incompatible peer never
 * gets far enough to name a method.
 */
export function createBridgeServer(handlers: BridgeServerHandlers) {
  return async function handle(request: BridgeRequest): Promise<BridgeResponse> {
    const { id, method } = request;

    if (method === 'handshake') {
      const params = request.params as HandshakeParams;
      const result = negotiate(
        { version: BRIDGE_VERSION, minSupported: BRIDGE_MIN_SUPPORTED },
        { version: Number(params?.bridgeVersion), minSupported: Number(params?.minSupported) },
      );
      if (!result.ok) return fail(id, result.error.code, result.error.message);

      const issued = handlers.issueCapability();
      const payload: HandshakeResult = {
        server: 'inspector',
        serverVersion: handlers.serverVersion,
        bridgeVersion: result.version,
        capability: issued.capability,
        expiresAt: issued.expiresAt,
      };
      return ok(id, payload);
    }

    if (!request.capability || !handlers.verifyCapability(request.capability)) {
      return fail(id, 'unauthenticated', 'Missing or expired Inspector capability. Reconnect.');
    }

    switch (method) {
      case 'session.describe':
        return ok(id, handlers.describeSession());

      case 'session.send': {
        const session = handlers.describeSession();
        if (!session.sessionId || !session.connected) {
          return fail(id, 'no-session', 'Feather Inspector has no game attached.');
        }
        try {
          await handlers.send(request.params as SendParams);
          return ok(id, null);
        } catch (error) {
          return fail(id, 'rejected', error instanceof Error ? error.message : 'The command was rejected.');
        }
      }

      case 'preferences.export':
        return ok(id, handlers.exportPreferences());

      default:
        return fail(id, 'unknown-method', `Unrecognized bridge method "${String(method)}".`);
    }
  };
}
