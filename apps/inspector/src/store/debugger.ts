import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Breakpoint {
  file: string;
  line: number;
  condition?: string;
  enabled: boolean;
}

export type ProfilerProbeKind = 'start' | 'stop' | 'snapshot' | 'wrap';

export interface ProfilerProbe {
  file: string;
  line: number;
  kind: ProfilerProbeKind;
  enabled: boolean;
  label?: string;
  target?: string;
}

export interface BreakpointIssue {
  file?: string;
  line?: number;
  condition?: string;
  kind?: string;
  label?: string;
  target?: string;
  reason?: string;
  error?: string;
}

export interface StackFrame {
  index?: number;
  file: string;
  line: number;
  name: string;
  what?: string;
}

export interface PausedState {
  pauseId?: number;
  file: string;
  line: number;
  reason: 'breakpoint' | 'step' | 'exception';
  error?: {
    callback?: string;
    message?: string;
  };
  stack: StackFrame[];
  locals: Record<string, string>;
  upvalues: Record<string, string>;
}

export interface DebuggerStatus {
  enabled?: boolean;
  paused?: boolean;
  pauseOnError?: boolean;
  sourceRoot?: string;
  breakpointCount?: number;
  breakpoints?: Array<{ file: string; line: number; condition?: string }>;
  rejectedBreakpoints?: BreakpointIssue[];
  breakpointErrors?: BreakpointIssue[];
  profilerProbeCount?: number;
  profilerProbes?: Array<{ file: string; line: number; kind: ProfilerProbeKind; label?: string; target?: string }>;
  rejectedProfilerProbes?: BreakpointIssue[];
}

interface DebuggerStore {
  // Persisted: survive restarts
  breakpoints: Breakpoint[];
  profilerProbes: ProfilerProbe[];
  defaultEnabled: boolean; // remembered across sessions
  rootPaths: Record<string, string>; // per-session manual root paths
  // Per-session transient state (not persisted)
  pausedState: Record<string, PausedState | null>;
  enabled: Record<string, boolean>;
  pauseOnError: Record<string, boolean>;
  status: Record<string, DebuggerStatus>;
  breakpointErrors: Record<string, BreakpointIssue[]>;

  addBreakpoint: (bp: Omit<Breakpoint, 'enabled'>) => void;
  removeBreakpoint: (file: string, line: number) => void;
  toggleBreakpoint: (file: string, line: number) => void;
  setCondition: (file: string, line: number, condition: string | undefined) => void;
  clearBreakpoints: () => void;
  setProfilerProbes: (probes: ProfilerProbe[]) => void;
  setProfilerProbe: (probe: Omit<ProfilerProbe, 'enabled'> & { enabled?: boolean }) => void;
  removeProfilerProbe: (file: string, line: number) => void;
  clearProfilerProbes: () => void;
  setPausedState: (sessionId: string, state: PausedState | null) => void;
  setEnabled: (sessionId: string, enabled: boolean) => void;
  setPauseOnError: (sessionId: string, enabled: boolean) => void;
  setStatus: (sessionId: string, status: DebuggerStatus) => void;
  addBreakpointError: (sessionId: string, error: BreakpointIssue) => void;
  setFrameVariables: (sessionId: string, frame: { pauseId?: number; index?: number; locals?: Record<string, string>; upvalues?: Record<string, string> }) => void;
  setRootPath: (sessionId: string, path: string) => void;
  clearRootPath: (sessionId: string) => void;
}

const PROFILER_PROBE_KINDS = new Set<ProfilerProbeKind>(['start', 'stop', 'snapshot', 'wrap']);

function isProfilerProbeKind(value: unknown): value is ProfilerProbeKind {
  return typeof value === 'string' && PROFILER_PROBE_KINDS.has(value as ProfilerProbeKind);
}

function normalizeProfilerProbe(probe: Partial<ProfilerProbe>): ProfilerProbe | null {
  const line = Number(probe.line);
  if (typeof probe.file !== 'string' || probe.file.trim() === '' || !Number.isFinite(line)) return null;
  if (!isProfilerProbeKind(probe.kind)) return null;
  const label = typeof probe.label === 'string' && probe.label.trim() ? probe.label.trim() : undefined;
  const target = typeof probe.target === 'string' && probe.target.trim() ? probe.target.trim() : undefined;
  if (probe.kind === 'wrap' && !target) return null;
  return {
    file: probe.file,
    line: Math.floor(line),
    kind: probe.kind,
    enabled: probe.enabled !== false,
    ...(label && { label }),
    ...(target && { target }),
  };
}

function normalizeProfilerProbes(probes: ProfilerProbe[]) {
  return probes.reduce<ProfilerProbe[]>((acc, probe) => {
    const normalized = normalizeProfilerProbe(probe);
    if (!normalized || normalized.line < 1) return acc;
    const existingIndex = acc.findIndex((item) => item.file === normalized.file && item.line === normalized.line);
    if (existingIndex >= 0) acc[existingIndex] = normalized;
    else acc.push(normalized);
    return acc;
  }, []);
}

export const useDebuggerStore = create<DebuggerStore>()(
  persist(
    (set) => ({
      breakpoints: [],
      profilerProbes: [],
      defaultEnabled: false,
      rootPaths: {},
      pausedState: {},
      enabled: {},
      pauseOnError: {},
      status: {},
      breakpointErrors: {},

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

      setProfilerProbes: (probes) => set({ profilerProbes: normalizeProfilerProbes(probes) }),

      setProfilerProbe: (probe) =>
        set((state) => {
          const normalized = normalizeProfilerProbe({
            ...probe,
            enabled: probe.enabled ?? true,
          });
          if (!normalized || normalized.line < 1) return state;
          const next = state.profilerProbes.filter(
            (item) => !(item.file === normalized.file && item.line === normalized.line),
          );
          return { profilerProbes: normalizeProfilerProbes([...next, normalized]) };
        }),

      removeProfilerProbe: (file, line) =>
        set((state) => ({
          profilerProbes: state.profilerProbes.filter((probe) => !(probe.file === file && probe.line === line)),
        })),

      clearProfilerProbes: () => set({ profilerProbes: [] }),

      setPausedState: (sessionId, state) =>
        set((s) => ({ pausedState: { ...s.pausedState, [sessionId]: state } })),

      setEnabled: (sessionId, enabled) =>
        set((s) => ({
          enabled: { ...s.enabled, [sessionId]: enabled },
          defaultEnabled: enabled,
        })),

      setPauseOnError: (sessionId, enabled) =>
        set((s) => ({
          pauseOnError: { ...s.pauseOnError, [sessionId]: enabled },
        })),

      setStatus: (sessionId, status) =>
        set((s) => ({
          status: { ...s.status, [sessionId]: status },
          enabled: status.enabled === undefined ? s.enabled : { ...s.enabled, [sessionId]: status.enabled },
          pauseOnError:
            status.pauseOnError === undefined ? s.pauseOnError : { ...s.pauseOnError, [sessionId]: status.pauseOnError },
          breakpointErrors:
            status.breakpointErrors === undefined
              ? s.breakpointErrors
              : { ...s.breakpointErrors, [sessionId]: status.breakpointErrors },
        })),

      addBreakpointError: (sessionId, error) =>
        set((s) => {
          const errors = [...(s.breakpointErrors[sessionId] ?? []), error].slice(-20);
          return { breakpointErrors: { ...s.breakpointErrors, [sessionId]: errors } };
        }),

      setFrameVariables: (sessionId, frame) =>
        set((s) => {
          const paused = s.pausedState[sessionId];
          if (!paused || (frame.pauseId !== undefined && paused.pauseId !== frame.pauseId)) return s;
          return {
            pausedState: {
              ...s.pausedState,
              [sessionId]: {
                ...paused,
                locals: frame.locals ?? paused.locals,
                upvalues: frame.upvalues ?? paused.upvalues,
              },
            },
          };
        }),

      setRootPath: (sessionId, path) =>
        set((s) => ({ rootPaths: { ...s.rootPaths, [sessionId]: path } })),

      clearRootPath: (sessionId) =>
        set((s) => {
          const rootPaths = { ...s.rootPaths };
          delete rootPaths[sessionId];
          return { rootPaths };
        }),
    }),
    {
      name: 'feather-debugger',
      partialize: (state) => ({
        breakpoints: state.breakpoints,
        profilerProbes: state.profilerProbes,
        defaultEnabled: state.defaultEnabled,
        rootPaths: state.rootPaths,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<DebuggerStore> | undefined;
        return {
          ...currentState,
          ...persisted,
          profilerProbes: Array.isArray(persisted?.profilerProbes)
            ? normalizeProfilerProbes(persisted.profilerProbes)
            : currentState.profilerProbes,
        };
      },
    },
  ),
);
