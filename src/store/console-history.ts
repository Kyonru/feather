import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ConsoleValueMeta } from '@/hooks/use-ws-connection';

const MAX_HISTORY = 200;
const MAX_OUTPUT = 100;

export type StoredOutput = {
  id: string;
  input: string;
  timestamp: number;
  completedAt?: number;
  status: 'success' | 'error';
  result: string | null;
  prints: string[];
  values?: ConsoleValueMeta[];
};

export type ConsoleSnippet = {
  id: string;
  name: string;
  code: string;
  createdAt: number;
  updatedAt: number;
};

interface ConsoleHistoryStore {
  historyBySession: Record<string, string[]>;
  outputBySession: Record<string, StoredOutput[]>;
  snippetsBySession: Record<string, ConsoleSnippet[]>;
  push: (sessionId: string, input: string) => void;
  pushOutput: (sessionId: string, output: StoredOutput) => void;
  clear: (sessionId: string) => void;
  clearOutput: (sessionId: string) => void;
  clearHistory: (sessionId: string) => void;
  saveSnippet: (sessionId: string, snippet: Omit<ConsoleSnippet, 'id' | 'createdAt' | 'updatedAt'>) => ConsoleSnippet;
  updateSnippet: (sessionId: string, snippetId: string, patch: Partial<Pick<ConsoleSnippet, 'name' | 'code'>>) => void;
  deleteSnippet: (sessionId: string, snippetId: string) => void;
  clearSnippets: (sessionId: string) => void;
}

function createSnippetId() {
  return `snippet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useConsoleHistoryStore = create<ConsoleHistoryStore>()(
  persist(
    (set) => ({
      historyBySession: {},
      outputBySession: {},
      snippetsBySession: {},
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
      clearOutput: (sessionId) =>
        set((state) => {
          const restOutput = Object.fromEntries(Object.entries(state.outputBySession).filter(([key]) => key !== sessionId));
          return { outputBySession: restOutput };
        }),
      clearHistory: (sessionId) =>
        set((state) => {
          const restHistory = Object.fromEntries(
            Object.entries(state.historyBySession).filter(([key]) => key !== sessionId),
          );
          return { historyBySession: restHistory };
        }),
      saveSnippet: (sessionId, snippet) => {
        const now = Date.now();
        const saved = {
          ...snippet,
          id: createSnippetId(),
          createdAt: now,
          updatedAt: now,
        };
        set((state) => {
          const prev = state.snippetsBySession[sessionId] ?? [];
          return { snippetsBySession: { ...state.snippetsBySession, [sessionId]: [saved, ...prev] } };
        });
        return saved;
      },
      updateSnippet: (sessionId, snippetId, patch) =>
        set((state) => {
          const prev = state.snippetsBySession[sessionId] ?? [];
          const next = prev.map((snippet) =>
            snippet.id === snippetId ? { ...snippet, ...patch, updatedAt: Date.now() } : snippet,
          );
          return { snippetsBySession: { ...state.snippetsBySession, [sessionId]: next } };
        }),
      deleteSnippet: (sessionId, snippetId) =>
        set((state) => {
          const prev = state.snippetsBySession[sessionId] ?? [];
          return {
            snippetsBySession: {
              ...state.snippetsBySession,
              [sessionId]: prev.filter((snippet) => snippet.id !== snippetId),
            },
          };
        }),
      clearSnippets: (sessionId) =>
        set((state) => {
          const restSnippets = Object.fromEntries(
            Object.entries(state.snippetsBySession).filter(([key]) => key !== sessionId),
          );
          return { snippetsBySession: restSnippets };
        }),
    }),
    { name: 'feather-console-history-v2' },
  ),
);
