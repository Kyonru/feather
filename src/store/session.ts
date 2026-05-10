import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SessionInfo = {
  id: string;
  os?: string;
  name?: string;
  deviceId?: string;
  kind?: 'live' | 'log-file' | 'time-travel-file';
  filePath?: string;
  connected: boolean;
  connectedAt: number;
};

type SessionStore = {
  sessionId: string | null;
  sessions: Record<string, SessionInfo>;
  setSession: (sessionId: string) => void;
  clearSession: () => void;
  addSession: (info: SessionInfo) => void;
  removeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;
};

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
    }),
    {
      name: 'session-storage',
      partialize: (state) => ({
        // Only persist real device sessions, not ephemeral file sessions
        sessions: Object.fromEntries(
          Object.entries(state.sessions).filter(([id]) => !id.startsWith('file:')),
        ),
      }),
    },
  ),
);
