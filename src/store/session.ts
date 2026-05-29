import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const PENDING_SESSION_NAME = 'Connecting game';

export type SessionInfo = {
  id: string;
  os?: string;
  name?: string;
  deviceId?: string;
  kind?: 'live' | 'log-file' | 'time-travel-file';
  filePath?: string;
  connected: boolean;
  connectedAt: number;
  insecure?: boolean;
  pendingConfig?: boolean;
  runtimeSuspended?: boolean;
};

type SessionStore = {
  sessionId: string | null;
  sessions: Record<string, SessionInfo>;
  setSession: (sessionId: string) => void;
  clearSession: () => void;
  addSession: (info: SessionInfo) => void;
  removeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  setRuntimeSuspended: (sessionId: string, suspended: boolean) => void;
};

export function prepareSessionsForPersistence(sessions: Record<string, SessionInfo>): Record<string, SessionInfo> {
  return Object.fromEntries(
    Object.entries(sessions)
      .filter(([id, session]) => !id.startsWith('file:') && !session.pendingConfig && session.name !== PENDING_SESSION_NAME)
      .map(([id, session]) => [id, { ...session, connected: false, pendingConfig: false, runtimeSuspended: false }]),
  );
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      sessionId: null,
      sessions: {},
      setSession: (sessionId) => set({ sessionId }),
      clearSession: () =>
        set((state) => {
          const sessions = { ...state.sessions };
          if (state.sessionId && sessions[state.sessionId]) {
            sessions[state.sessionId] = { ...sessions[state.sessionId], connected: false };
          }
          return { sessionId: null, sessions };
        }),
      addSession: (info) =>
        set((state) => {
          const sessions = { ...state.sessions };
          if (info.deviceId) {
            for (const [id, existing] of Object.entries(sessions)) {
              if (existing.deviceId === info.deviceId && id !== info.id) {
                delete sessions[id];
              }
            }
          }
          sessions[info.id] = info;
          return { sessions };
        }),
      removeSession: (sessionId) =>
        set((state) => {
          const sessions = { ...state.sessions };
          delete sessions[sessionId];
          return {
            sessions,
            sessionId: state.sessionId === sessionId ? null : state.sessionId,
          };
        }),
      setActiveSession: (sessionId) => set({ sessionId }),
      setRuntimeSuspended: (sessionId, runtimeSuspended) =>
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                runtimeSuspended,
              },
            },
          };
        }),
    }),
    {
      name: 'session-storage',
      partialize: (state) => ({
        // Only persist real device sessions, not ephemeral file sessions.
        // Remembered live sessions are history affordances after an app restart;
        // they become live again only after the current frontend receives config.
        sessions: prepareSessionsForPersistence(state.sessions),
      }),
      merge: (persisted, current) => {
        const persistedState = typeof persisted === 'object' && persisted !== null ? persisted as {
          sessions?: Record<string, SessionInfo>;
          __e2eLiveSessions?: boolean;
        } : {};
        const persistedSessions = persistedState.sessions ?? {};
        return {
          ...current,
          sessions: persistedState.__e2eLiveSessions === true
            ? persistedSessions
            : prepareSessionsForPersistence(persistedSessions),
        };
      },
    },
  ),
);
