import { sendCommand } from '@/lib/send-command';
import { useSessionStore } from '@/store/session';
import { useDebuggerStore, type Breakpoint, type ProfilerProbe, type ProfilerProbeKind } from '@/store/debugger';

const sendCmd = (sessionId: string, type: string, data?: unknown) =>
  sendCommand(sessionId, { type, ...(data !== undefined && { data }) }).catch(() => {});

const syncBreakpoints = (sessionId: string, breakpoints: Breakpoint[]) =>
  sendCmd(sessionId, 'cmd:debugger:set_breakpoints', {
    breakpoints: breakpoints
      .filter((b) => b.enabled)
      .map(({ file, line, condition }) => ({ file, line, condition })),
  });

const syncProfilerProbes = (sessionId: string, probes: ProfilerProbe[]) =>
  sendCmd(sessionId, 'cmd:debugger:set_profiler_probes', {
    probes: probes
      .filter((probe) => probe.enabled)
      .map(({ file, line, kind, label }) => ({ file, line, kind, label })),
  });

function nextProbeKind(current: ProfilerProbeKind | undefined): ProfilerProbeKind | null {
  if (!current) return 'start';
  if (current === 'start') return 'stop';
  if (current === 'stop') return 'snapshot';
  return null;
}

export const useDebugger = () => {
  const sessionId = useSessionStore((state) => state.sessionId);
  const breakpoints = useDebuggerStore((state) => state.breakpoints);
  const profilerProbes = useDebuggerStore((state) => state.profilerProbes);
  const pausedState = useDebuggerStore((state) => state.pausedState);
  const enabledMap = useDebuggerStore((state) => state.enabled);
  const pauseOnErrorMap = useDebuggerStore((state) => state.pauseOnError);
  const statusMap = useDebuggerStore((state) => state.status);
  const breakpointErrorsMap = useDebuggerStore((state) => state.breakpointErrors);
  const addBreakpoint = useDebuggerStore((state) => state.addBreakpoint);
  const removeBreakpoint = useDebuggerStore((state) => state.removeBreakpoint);
  const toggleBreakpointStore = useDebuggerStore((state) => state.toggleBreakpoint);
  const setConditionStore = useDebuggerStore((state) => state.setCondition);
  const clearBreakpoints = useDebuggerStore((state) => state.clearBreakpoints);
  const setProfilerProbesStore = useDebuggerStore((state) => state.setProfilerProbes);
  const setEnabled = useDebuggerStore((state) => state.setEnabled);
  const setPauseOnErrorStore = useDebuggerStore((state) => state.setPauseOnError);

  const currentPaused = sessionId ? (pausedState[sessionId] ?? null) : null;
  const isEnabled = sessionId ? (enabledMap[sessionId] ?? false) : false;
  const pauseOnError = sessionId ? (pauseOnErrorMap[sessionId] ?? false) : false;
  const status = sessionId ? (statusMap[sessionId] ?? {}) : {};
  const breakpointErrors = sessionId ? (breakpointErrorsMap[sessionId] ?? []) : [];

  const toggleEnabled = () => {
    if (!sessionId) return;
    const next = !isEnabled;
    setEnabled(sessionId, next);
    sendCmd(sessionId, next ? 'cmd:debugger:enable' : 'cmd:debugger:disable');
    if (next) {
      sendCmd(sessionId, 'cmd:debugger:set_options', { pauseOnError });
      syncBreakpoints(sessionId, breakpoints);
      syncProfilerProbes(sessionId, profilerProbes);
    }
  };

  const addBp = (file: string, line: number, condition?: string) => {
    addBreakpoint({ file, line, condition });
    if (sessionId && isEnabled) {
      syncBreakpoints(sessionId, [...breakpoints, { file, line, condition, enabled: true }]);
    }
  };

  const removeBp = (file: string, line: number) => {
    removeBreakpoint(file, line);
    if (sessionId && isEnabled) {
      syncBreakpoints(sessionId, breakpoints.filter((b) => !(b.file === file && b.line === line)));
    }
  };

  const toggleBp = (file: string, line: number) => {
    toggleBreakpointStore(file, line);
    if (sessionId && isEnabled) {
      const next = breakpoints.map((b) =>
        b.file === file && b.line === line ? { ...b, enabled: !b.enabled } : b,
      );
      syncBreakpoints(sessionId, next);
    }
  };

  const setCondition = (file: string, line: number, condition: string | undefined) => {
    setConditionStore(file, line, condition);
    if (sessionId && isEnabled) {
      const next = breakpoints.map((b) =>
        b.file === file && b.line === line ? { ...b, condition } : b,
      );
      syncBreakpoints(sessionId, next);
    }
  };

  const clearBps = () => {
    clearBreakpoints();
    if (sessionId && isEnabled) syncBreakpoints(sessionId, []);
  };

  const setProfilerProbe = (file: string, line: number, kind: ProfilerProbeKind, label?: string) => {
    const next = [
      ...profilerProbes.filter((probe) => !(probe.file === file && probe.line === line)),
      { file, line, kind, label, enabled: true },
    ];
    setProfilerProbesStore(next);
    if (sessionId && isEnabled) syncProfilerProbes(sessionId, next);
  };

  const removeProfilerProbe = (file: string, line: number) => {
    const next = profilerProbes.filter((probe) => !(probe.file === file && probe.line === line));
    setProfilerProbesStore(next);
    if (sessionId && isEnabled) syncProfilerProbes(sessionId, next);
  };

  const cycleProfilerProbe = (file: string, line: number) => {
    const existing = profilerProbes.find((probe) => probe.file === file && probe.line === line);
    const nextKind = nextProbeKind(existing?.kind);
    if (!nextKind) {
      removeProfilerProbe(file, line);
      return;
    }
    setProfilerProbe(file, line, nextKind, existing?.label);
  };

  const clearProbes = () => {
    setProfilerProbesStore([]);
    if (sessionId && isEnabled) syncProfilerProbes(sessionId, []);
  };

  const setPauseOnError = (enabled: boolean) => {
    if (!sessionId) return;
    setPauseOnErrorStore(sessionId, enabled);
    sendCmd(sessionId, 'cmd:debugger:set_options', { pauseOnError: enabled });
  };

  const inspectFrame = (index: number) => {
    if (!sessionId || !currentPaused) return;
    sendCmd(sessionId, 'cmd:debugger:inspect_frame', { index });
  };

  return {
    breakpoints,
    profilerProbes,
    currentPaused,
    isEnabled,
    pauseOnError,
    status,
    breakpointErrors,
    isPaused: currentPaused !== null,
    toggleEnabled,
    addBreakpoint: addBp,
    removeBreakpoint: removeBp,
    toggleBreakpoint: toggleBp,
    clearBreakpoints: clearBps,
    setCondition,
    setProfilerProbe,
    removeProfilerProbe,
    cycleProfilerProbe,
    clearProfilerProbes: clearProbes,
    setPauseOnError,
    inspectFrame,
    continue: () => sessionId && sendCmd(sessionId, 'cmd:debugger:continue'),
    stepOver: () => sessionId && sendCmd(sessionId, 'cmd:debugger:step_over'),
    stepInto: () => sessionId && sendCmd(sessionId, 'cmd:debugger:step_into'),
    stepOut: () => sessionId && sendCmd(sessionId, 'cmd:debugger:step_out'),
  };
};
