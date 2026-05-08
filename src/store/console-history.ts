import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const MAX_HISTORY = 200;
const MAX_OUTPUT = 100;

export type StoredOutput = {
  id: string;
  input: string;
  timestamp: number;
  status: 'success' | 'error';
  result: string | null;
  prints: string[];
};

interface ConsoleHistoryStore {
  historyBySession: Record<string, string[]>;
  outputBySession: Record<string, StoredOutput[]>;
  push: (sessionId: string, input: string) => void;
  pushOutput: (sessionId: string, output: StoredOutput) => void;
  clear: (sessionId: string) => void;
}

export const useConsoleHistoryStore = create<ConsoleHistoryStore>()(
  persist(
    (set) => ({
      historyBySession: {},
      outputBySession: {},
      push: (sessionId, input) =>
        set((state) => {
          const prev = state.historyBySession[sessionId] ?? [];
          const deduped = prev.filter((h) => h !== input);
          const next = [...deduped, input].slice(-MAX_HISTORY);
          return { historyBySession: { ...state.historyBySession, [sessionId]: next } };
        }),
      pushOutput: (sessionId, output) =>
        set((state) => {
          const prev = state.outputBySession[sessionId] ?? [];
          // Don't duplicate if already persisted
          if (prev.some((o) => o.id === output.id)) return state;
          const next = [...prev, output].slice(-MAX_OUTPUT);
          return { outputBySession: { ...state.outputBySession, [sessionId]: next } };
        }),
      clear: (sessionId) =>
        set((state) => {
          const restHistory = Object.fromEntries(Object.entries(state.historyBySession).filter(([k]) => k !== sessionId));
          const restOutput = Object.fromEntries(Object.entries(state.outputBySession).filter(([k]) => k !== sessionId));
          return { historyBySession: restHistory, outputBySession: restOutput };
        }),
    }),
    { name: 'feather-console-history-v2' },
  ),
);
