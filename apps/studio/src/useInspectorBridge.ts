import { useShallow } from 'zustand/react/shallow';
import { useInspectorConnection } from '@studio/store/inspector-connection';

/**
 * Studio's optional connection to a running Feather Inspector, for components.
 *
 * The connection itself lives in `store/inspector-connection.ts` so the strip,
 * the menu and the tools all see one pairing. Studio is fully useful with no
 * Inspector at all — that is the null bridge, not an error state — and
 * connecting is an explicit user action, so Studio never probes loopback on its
 * own.
 */
export function useInspectorBridge() {
  return useInspectorConnection(
    useShallow((state) => ({
      status: state.status,
      connected: state.status === 'paired',
      sessions: state.sessions,
      selectedSessionId: state.selectedSessionId,
      selectedSession: state.sessions.find((session) => session.id === state.selectedSessionId) ?? null,
      error: state.error,
      notice: state.notice,
      connect: state.connect,
      disconnect: state.disconnect,
      selectSession: state.selectSession,
    })),
  );
}

export type InspectorConnection = ReturnType<typeof useInspectorBridge>;
