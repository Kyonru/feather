import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/store/session';
import { useDebuggerStore, type Breakpoint } from '@/store/debugger';

const sendCmd = (sessionId: string, type: string, data?: unknown) =>
  invoke('send_command', {
    sessionId,
    message: JSON.stringify({ type, ...(data !== undefined && { data }) }),
  }).catch(() => {});

const syncBreakpoints = (sessionId: string, breakpoints: Breakpoint[]) =>
  sendCmd(sessionId, 'cmd:debugger:set_breakpoints', {
    breakpoints: breakpoints
      .filter((b) => b.enabled)
      .map(({ file, line, condition }) => ({ file, line, condition })),
  });

export const useDebugger = () => {
  const sessionId = useSessionStore((state) => state.sessionId);
  const breakpoints = useDebuggerStore((state) => state.breakpoints);
  const pausedState = useDebuggerStore((state) => state.pausedState);
  const enabledMap = useDebuggerStore((state) => state.enabled);
  const addBreakpoint = useDebuggerStore((state) => state.addBreakpoint);
  const removeBreakpoint = useDebuggerStore((state) => state.removeBreakpoint);
  const toggleBreakpointStore = useDebuggerStore((state) => state.toggleBreakpoint);
  const clearBreakpoints = useDebuggerStore((state) => state.clearBreakpoints);
  const setEnabled = useDebuggerStore((state) => state.setEnabled);

  const currentPaused = sessionId ? (pausedState[sessionId] ?? null) : null;
  const isEnabled = sessionId ? (enabledMap[sessionId] ?? false) : false;

  const toggleEnabled = () => {
    if (!sessionId) return;
    const next = !isEnabled;
    setEnabled(sessionId, next);
    sendCmd(sessionId, next ? 'cmd:debugger:enable' : 'cmd:debugger:disable');
    if (next) syncBreakpoints(sessionId, breakpoints);
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

  const clearBps = () => {
    clearBreakpoints();
    if (sessionId && isEnabled) syncBreakpoints(sessionId, []);
  };

  return {
    breakpoints,
    currentPaused,
    isEnabled,
    isPaused: currentPaused !== null,
    toggleEnabled,
    addBreakpoint: addBp,
    removeBreakpoint: removeBp,
    toggleBreakpoint: toggleBp,
    clearBreakpoints: clearBps,
    continue: () => sessionId && sendCmd(sessionId, 'cmd:debugger:continue'),
    stepOver: () => sessionId && sendCmd(sessionId, 'cmd:debugger:step_over'),
    stepInto: () => sessionId && sendCmd(sessionId, 'cmd:debugger:step_into'),
    stepOut: () => sessionId && sendCmd(sessionId, 'cmd:debugger:step_out'),
  };
};
