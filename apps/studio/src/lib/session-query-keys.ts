/**
 * React Query keys for per-session data.
 *
 * Extracted from `use-ws-connection` so modules that only need the key shapes
 * do not transitively import the WebSocket hook — and with it `@tauri-apps/*`.
 * That chain was what kept the creative tools bound to Tauri.
 */
export const sessionQueryKey = {
  config: (sessionId: string) => [sessionId, 'config'],
  logs: (sessionId: string) => [sessionId, 'logs'],
  performance: (sessionId: string) => [sessionId, 'performance'],
  profiler: (sessionId: string) => [sessionId, 'profiler'],
  observers: (sessionId: string) => [sessionId, 'observers'],
  assets: (sessionId: string) => [sessionId, 'assets'],
  plugin: (sessionId: string, pluginId: string) => [sessionId, 'plugin', pluginId],
  pluginAction: (sessionId: string, pluginId: string, action: string) => [sessionId, 'plugin-action', pluginId, action],
  console: (sessionId: string) => [sessionId, 'console'],
  consoleGlobals: (sessionId: string) => [sessionId, 'console-globals'],
  consolePins: (sessionId: string) => [sessionId, 'console-pins'],
  consoleInspect: (sessionId: string) => [sessionId, 'console-inspect'],
  timeTravel: (sessionId: string) => [sessionId, 'time-travel'],
  timeTravelFrames: (sessionId: string) => [sessionId, 'time-travel-frames'],
  sessionReplay: (sessionId: string) => [sessionId, 'session-replay'],
  sessionReplayRecording: (sessionId: string) => [sessionId, 'session-replay-recording'],
  sessionReplayRecordings: (sessionId: string) => [sessionId, 'session-replay-recordings'],
  sessionReplayList: (sessionId: string) => [sessionId, 'session-replay-list'],
  sessionReplaySelected: (sessionId: string) => [sessionId, 'session-replay-selected'],
  hotReload: (sessionId: string) => [sessionId, 'hot-reload'],
};
