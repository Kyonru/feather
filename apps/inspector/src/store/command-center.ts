import { create } from 'zustand';

type CommandCenterState = {
  open: boolean;
  consoleDraftBySession: Record<string, string>;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setConsoleDraft: (sessionId: string, code: string) => void;
  consumeConsoleDraft: (sessionId: string) => string | undefined;
};

export const useCommandCenterStore = create<CommandCenterState>((set, get) => ({
  open: false,
  consoleDraftBySession: {},
  setOpen: (open) => set({ open }),
  toggle: () => set((state) => ({ open: !state.open })),
  setConsoleDraft: (sessionId, code) =>
    set((state) => ({ consoleDraftBySession: { ...state.consoleDraftBySession, [sessionId]: code } })),
  consumeConsoleDraft: (sessionId) => {
    const draft = get().consoleDraftBySession[sessionId];
    if (draft === undefined) return undefined;
    set((state) => {
      const consoleDraftBySession = { ...state.consoleDraftBySession };
      delete consoleDraftBySession[sessionId];
      return { consoleDraftBySession };
    });
    return draft;
  },
}));
