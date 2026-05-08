import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Breakpoint {
  file: string;
  line: number;
  condition?: string;
  enabled: boolean;
}

export interface StackFrame {
  file: string;
  line: number;
  name: string;
  what?: string;
}

export interface PausedState {
  file: string;
  line: number;
  reason: 'breakpoint' | 'step' | 'exception';
  stack: StackFrame[];
  locals: Record<string, string>;
  upvalues: Record<string, string>;
}

interface DebuggerStore {
  // Persisted: survive restarts
  breakpoints: Breakpoint[];
  defaultEnabled: boolean; // remembered across sessions
  // Per-session transient state (not persisted)
  pausedState: Record<string, PausedState | null>;
  enabled: Record<string, boolean>;

  addBreakpoint: (bp: Omit<Breakpoint, 'enabled'>) => void;
  removeBreakpoint: (file: string, line: number) => void;
  toggleBreakpoint: (file: string, line: number) => void;
  setCondition: (file: string, line: number, condition: string | undefined) => void;
  clearBreakpoints: () => void;
  setPausedState: (sessionId: string, state: PausedState | null) => void;
  setEnabled: (sessionId: string, enabled: boolean) => void;
}

export const useDebuggerStore = create<DebuggerStore>()(
  persist(
    (set) => ({
      breakpoints: [],
      defaultEnabled: false,
      pausedState: {},
      enabled: {},

      addBreakpoint: (bp) =>
        set((state) => {
          const exists = state.breakpoints.some((b) => b.file === bp.file && b.line === bp.line);
          if (exists) return state;
          return { breakpoints: [...state.breakpoints, { ...bp, enabled: true }] };
        }),

      removeBreakpoint: (file, line) =>
        set((state) => ({
          breakpoints: state.breakpoints.filter((b) => !(b.file === file && b.line === line)),
        })),

      toggleBreakpoint: (file, line) =>
        set((state) => ({
          breakpoints: state.breakpoints.map((b) =>
            b.file === file && b.line === line ? { ...b, enabled: !b.enabled } : b,
          ),
        })),

      setCondition: (file, line, condition) =>
        set((state) => ({
          breakpoints: state.breakpoints.map((b) =>
            b.file === file && b.line === line ? { ...b, condition } : b,
          ),
        })),

      clearBreakpoints: () => set({ breakpoints: [] }),

      setPausedState: (sessionId, state) =>
        set((s) => ({ pausedState: { ...s.pausedState, [sessionId]: state } })),

      setEnabled: (sessionId, enabled) =>
        set((s) => ({
          enabled: { ...s.enabled, [sessionId]: enabled },
          defaultEnabled: enabled,
        })),
    }),
    {
      name: 'feather-debugger',
      partialize: (state) => ({ breakpoints: state.breakpoints, defaultEnabled: state.defaultEnabled }),
    },
  ),
);
