import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createClientBridge,
  createNullBridge,
  type BridgeRequest,
  type BridgeResponse,
  type SessionBridge,
  type SessionDescription,
} from '@feather/session-bridge';

const STUDIO_VERSION = '0.1.0';

/** Where Inspector listens for bridge requests on loopback. */
const INSPECTOR_BRIDGE_URL = 'http://127.0.0.1:4006/bridge';

/**
 * Loopback transport.
 *
 * Bound to 127.0.0.1 rather than a wildcard: the bridge can push commands into a
 * running game, so it must not be reachable from the network. The capability
 * travels in the request body, never the URL, so it stays out of logs.
 */
async function loopbackTransport(request: BridgeRequest): Promise<BridgeResponse> {
  const response = await fetch(INSPECTOR_BRIDGE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    throw new Error(`Feather Inspector responded ${response.status}`);
  }
  return (await response.json()) as BridgeResponse;
}

export type InspectorConnection = {
  bridge: SessionBridge;
  connected: boolean;
  session: SessionDescription;
  error: string | null;
  connect: () => Promise<void>;
};

/**
 * Optional connection to a running Feather Inspector.
 *
 * Studio is fully useful with no Inspector at all — that is the null bridge, not
 * an error state. Connecting is an explicit user action so Studio never probes
 * loopback on its own.
 */
export function useInspectorBridge(): InspectorConnection {
  const [bridge, setBridge] = useState<SessionBridge>(() => createNullBridge());
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionDescription>({
    sessionId: null,
    name: null,
    connected: false,
  });

  const connect = useCallback(async () => {
    const client = createClientBridge(loopbackTransport, { clientVersion: STUDIO_VERSION });
    const result = await client.connect();
    if (!result.ok) {
      setBridge(createNullBridge());
      setConnected(false);
      setError(result.error ?? 'Could not reach Feather Inspector.');
      return;
    }
    setBridge(client);
    setConnected(true);
    setError(null);
    setSession(await client.describeSession());
  }, []);

  useEffect(() => {
    if (!connected) return;
    const id = window.setInterval(() => {
      void bridge.describeSession().then(setSession);
    }, 4000);
    return () => window.clearInterval(id);
  }, [bridge, connected]);

  return useMemo(
    () => ({ bridge, connected, session, error, connect }),
    [bridge, connected, session, error, connect],
  );
}
