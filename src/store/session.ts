import { create } from 'zustand';

type SessionStore = {
  sessionId: string | null;
  setSession: (sessionId: string) => void;
  clearSession: () => void;
};

export const useSessionStore = create<SessionStore>((set) => ({
  sessionId: null,
  setSession: (sessionId) => set({ sessionId }),
  clearSession: () => set({ sessionId: null }),
}));
