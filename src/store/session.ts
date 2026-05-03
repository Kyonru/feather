import { create } from 'zustand';

export type SessionInfo = {
  id: string;
  os?: string;
  name?: string;
  deviceId?: string;
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

export const useSessionStore = create<SessionStore>((set) => ({
  sessionId: null,
  sessions: {},
  setSession: (sessionId) => set({ sessionId }),
  clearSession: () =>
    set((state) => {
      // Mark current session as disconnected but keep it in the list
      const sessions = { ...state.sessions };
      if (state.sessionId && sessions[state.sessionId]) {
        sessions[state.sessionId] = { ...sessions[state.sessionId], connected: false };
      }
      return { sessionId: null, sessions };
    }),
  addSession: (info) =>
    set((state) => {
      const sessions = { ...state.sessions };
      // If this device already has a session entry (reconnect), remove the old one
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
}));
