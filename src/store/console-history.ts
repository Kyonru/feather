import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_HISTORY = 200;

interface ConsoleHistoryStore {
  history: string[];
  push: (input: string) => void;
  clear: () => void;
}

export const useConsoleHistoryStore = create<ConsoleHistoryStore>()(
  persist(
    (set) => ({
      history: [],
      push: (input) =>
        set((state) => {
          const deduped = state.history.filter((h) => h !== input);
          const next = [...deduped, input];
          return { history: next.slice(-MAX_HISTORY) };
        }),
      clear: () => set({ history: [] }),
    }),
    { name: 'feather-console-history' },
  ),
);
