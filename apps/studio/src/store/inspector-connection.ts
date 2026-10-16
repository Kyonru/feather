import { create } from 'zustand';
import {
  clearCommandSender,
  createClientBridge,
  createNullBridge,
  fail,
  nextRequestId,
  setCommandSender,
  type BridgeRequest,
  type BridgeResponse,
  type BridgeSessionSummary,
  type CommandMessage,
  type SessionBridge,
} from '@feather/session-bridge';
import { useSessionStore } from '@studio/session';
import { chooseSessionSelection, previewRequestFor } from '@studio/session/bridge-session';
import { usePreviewDeliveryStore } from '@studio/session/preview-delivery';
import { useStudioPreferencesStore } from '@studio/store/studio-preferences';

/** Where Inspector listens for bridge requests on loopback. */
export const INSPECTOR_BRIDGE_URL = 'http://127.0.0.1:4008/bridge';

/** How often a paired Studio asks which games are connected. */
const POLL_MS = 2_000;

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
  if (response.status === 413) {
    return fail(request.id, 'payload-too-large', 'That preview is too large to send to the game.');
  }
  if (!response.ok) {
    throw new Error(`Feather Inspector responded ${response.status}`);
  }
  return (await response.json()) as BridgeResponse;
}

export type InspectorStatus = 'local' | 'connecting' | 'paired';

type InspectorConnectionState = {
  status: InspectorStatus;
  bridge: SessionBridge;
  sessions: BridgeSessionSummary[];
  selectedSessionId: string | null;
  /** A failed connect the user asked for: what happened and what to do. */
  error: string | null;
  /** Neutral news, e.g. Inspector went away. Not an error: local work is untouched. */
  notice: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  selectSession: (sessionId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

let pollTimer: ReturnType<typeof setInterval> | null = null;
/** The game the user picked last, so a re-list keeps it while it is connected. */
let remembered: string | null = null;
const clientInstanceId = `studio-${nextRequestId().replace(/[^A-Za-z0-9._-]/g, '')}`;

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

/** Feed Studio's session mirror, which the tools read to decide local vs attached. */
function mirror(session: BridgeSessionSummary | null) {
  useSessionStore.getState().syncFromBridge(session);
}

/**
 * Optional connection to a running Feather Inspector.
 *
 * Studio is fully useful with no Inspector at all — that is the null bridge, not
 * an error state. Connecting is an explicit user action so Studio never probes
 * loopback on its own (V4.md §5.4). One store, not one hook per component: the
 * strip and the menu used to each own a separate connection.
 *
 * Connecting *adds* live preview; it never replaces local work. Disconnecting
 * — by the user, by Inspector quitting, or by the game going away — drops back
 * to local mode with a neutral notice, not an error.
 */
export const useInspectorConnection = create<InspectorConnectionState>()((set, get) => {
  /** Return to local editing. Work is untouched; only the live path goes away. */
  function dropToLocal(notice: string | null) {
    stopPolling();
    clearCommandSender();
    mirror(null);
    set({ status: 'local', bridge: createNullBridge(), sessions: [], selectedSessionId: null, notice });
  }

  /**
   * The command transport the tools' `sendCommand` uses while paired.
   *
   * Only creative previews exist on the bridge, so anything else is refused
   * here. A delivered preview is stamped with the session it went to, which is
   * what lets a tool say when it has gone stale (C2).
   */
  async function bridgeSender(sessionId: string, message: CommandMessage): Promise<void> {
    const request = previewRequestFor(message);
    if (!request) throw new Error('Studio sends creative previews only; use Feather Inspector for anything else.');
    const { bridge } = get();
    const result =
      request.kind === 'send'
        ? await bridge.sendPreview({ sessionId, plugin: request.plugin, action: request.action, params: request.params })
        : await bridge.cancelPreview({ sessionId, plugin: request.plugin, action: request.action });
    if (!result.ok) {
      if (result.code === 'stale-session' || result.code === 'selection-required' || result.code === 'no-session') {
        void get().refresh();
      }
      if (result.code === 'unauthenticated' || result.code === 'transport-failure') {
        dropToLocal('Feather Inspector disconnected. Studio is working locally; your work is unchanged.');
      }
      throw new Error(result.error);
    }
    usePreviewDeliveryStore
      .getState()
      .record({ plugin: request.plugin, action: request.action, sessionId, kind: request.kind });
  }

  async function applySelection(sessions: BridgeSessionSummary[], scoped: string | null) {
    const { bridge } = get();
    const next = chooseSessionSelection({ sessions, scoped, remembered });
    if (next && next !== scoped) {
      const selected = await bridge.selectSession(next);
      if (!selected.ok) {
        set({ sessions, selectedSessionId: null });
        mirror(null);
        return;
      }
    }
    set({ sessions, selectedSessionId: next });
    mirror(next ? (sessions.find((session) => session.id === next) ?? null) : null);
  }

  return {
    status: 'local',
    bridge: createNullBridge(),
    sessions: [],
    selectedSessionId: null,
    error: null,
    notice: null,

    async connect() {
      if (get().status !== 'local') return;
      set({ status: 'connecting', error: null, notice: null });
      const client = createClientBridge(loopbackTransport, {
        clientVersion: __FEATHER_STUDIO_VERSION__,
        clientInstanceId,
      });
      const result = await client.connect();
      if (!result.ok) {
        set({
          status: 'local',
          bridge: createNullBridge(),
          error:
            result.code === 'transport-failure'
              ? 'Feather Inspector is not running. Start it, then connect again.'
              : result.error,
        });
        return;
      }

      set({ status: 'paired', bridge: client, error: null });
      setCommandSender(bridgeSender);
      await get().refresh();
      stopPolling();
      pollTimer = setInterval(() => void get().refresh(), POLL_MS);

      // One-time handoff. A Studio install that has never migrated asks
      // Inspector for the preferences it still holds; importPreferences is
      // idempotent and refuses a payload from a newer Studio, so a repeat
      // pairing is harmless.
      const store = useStudioPreferencesStore.getState();
      if (store.migratedFrom === 0) {
        const payload = await client.exportPreferences();
        if (payload) store.importPreferences(payload);
      }
    },

    async disconnect() {
      const { bridge } = get();
      dropToLocal(null);
      await bridge.release();
    },

    async selectSession(sessionId) {
      const { bridge, sessions } = get();
      const selected = await bridge.selectSession(sessionId);
      if (!selected.ok) {
        await get().refresh();
        return;
      }
      remembered = sessionId;
      set({ selectedSessionId: sessionId });
      mirror(sessions.find((session) => session.id === sessionId) ?? selected.value);
    },

    async refresh() {
      const { bridge, status } = get();
      if (status !== 'paired') return;
      const listed = await bridge.listSessions();
      if (get().bridge !== bridge) return; // disconnected meanwhile
      if (!listed.ok) {
        dropToLocal(
          listed.code === 'unauthenticated'
            ? 'Feather Inspector ended this pairing. Studio is working locally; connect again for live preview.'
            : 'Feather Inspector disconnected. Studio is working locally; your work is unchanged.',
        );
        return;
      }
      await applySelection(listed.value.sessions, listed.value.selectedSessionId);
    },
  };
});
