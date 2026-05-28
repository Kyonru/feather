import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { writeFile, writeTextFile } from '@tauri-apps/plugin-fs';
import { useQueryClient } from '@tanstack/react-query';
import { zipSync, strToU8 } from 'fflate';
import { useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';
import { useSettingsStore } from '@/store/settings';
import type { Log } from './use-logs';
import type { PerformanceMetrics } from './use-performance';
import type { PluginContentProps, PluginDataType } from './use-plugin';
import type { AssetCatalog } from './use-assets';
import type { HotReloadState } from './use-hot-reload';
import type {
  SessionReplayRecording,
  SessionReplayRecordings,
  SessionReplayStatus,
  SessionReplaySummary,
} from './use-session-replay';
import { unionBy } from '@/utils/arrays';
import { toast } from 'sonner';
import { isWeb } from '@/utils/platform';
import { useDebuggerStore, type BreakpointIssue, type DebuggerStatus, type PausedState } from '@/store/debugger';
import { FEATHER_PLUGIN_API } from '@/constants/feather-api';
import { sendCommand } from '@/lib/send-command';
import { base64ToUint8Array } from '@/utils/arrays';
import { normalizePerformanceMetric } from '@/utils/performance-metrics';
import {
  applyLogUpdate,
  mergeLogLists,
  resolveLogHistoryKeys,
  useLogHistoryStore,
} from '@/store/log-history';

// Cache key helpers — all indexed by the Rust-assigned session ID
export const sessionQueryKey = {
  config: (sessionId: string) => [sessionId, 'config'],
  logs: (sessionId: string) => [sessionId, 'logs'],
  performance: (sessionId: string) => [sessionId, 'performance'],
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

type WsMessage = {
  _session: string;
  type: string;
  data?: unknown;
  plugin?: string;
};

type BinaryEvent = {
  _session: string;
  bytes: number[];
};

type PendingBinary = {
  id: string;
  mime: string;
  target: BinaryTarget;
  mode: BinaryMode;
};

type BinaryMode = 'url' | 'text';

type BinaryTarget =
  | { type: 'assets' }
  | { type: 'plugin'; pluginId: string }
  | { type: 'observers' }
  | { type: 'timeTravelFrames' }
  | { type: 'sessionReplayRecording'; replayId?: string | null }
  | { type: 'debuggerPaused' }
  | { type: 'console' };

type BinaryRef = {
  id: string;
  mime: string;
};

export type EvalResponse = {
  id: string;
  status: 'success' | 'error';
  result: string | null;
  prints: string[];
  values?: ConsoleValueMeta[];
};

export type ConsoleGlobalsResponse = {
  ok: boolean;
  globals?: Array<{ name: string; type: string }>;
  error?: string;
};

export type ConsoleValueField = {
  key: string;
  keyType?: string;
  type: string;
  typeName?: string;
  summary?: string;
  preview?: string;
  expandable?: boolean;
  path?: string[];
};

export type ConsoleValueMeta = {
  type: string;
  typeName?: string;
  summary?: string;
  preview?: string;
  expandable?: boolean;
  handle?: string;
  path?: string[];
  fields?: ConsoleValueField[];
  truncated?: boolean;
};

export type ConsoleInspectResultResponse = {
  ok: boolean;
  id?: string;
  handle?: string;
  path?: string[];
  value?: ConsoleValueMeta;
  error?: string;
};

export type ConsolePin = {
  id: string;
  name: string;
  expression: string;
  enabled: boolean;
  status?: 'ok' | 'error';
  error?: string;
  value?: string;
  updatedAt?: number;
};

export type ConsolePinsResponse = {
  ok: boolean;
  pins: ConsolePin[];
  error?: string;
};

export type TimeTravelStatus = {
  recording: boolean;
  frame_count: number;
  buffer_size: number;
  first_frame_id: number;
  last_frame_id: number;
};

export type TimeTravelFrame = {
  id: number;
  time: number;
  dt: number;
  observers: Record<string, string>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const sessionReplayRecordingId = (recording: SessionReplayRecording | null | undefined): string | null =>
  typeof recording?.manifest?.id === 'string' ? recording.manifest.id : null;

const pushBinaryRef = (value: unknown, refs: BinaryRef[]) => {
  if (!isRecord(value) || typeof value.id !== 'string') return;

  refs.push({
    id: value.id,
    mime: typeof value.mime === 'string' ? value.mime : 'application/octet-stream',
  });
};

const collectBinaryRefs = (value: unknown, refs: BinaryRef[] = []): BinaryRef[] => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectBinaryRefs(item, refs));
    return refs;
  }

  if (!isRecord(value)) return refs;

  const binary = value.binary;
  if (Array.isArray(binary)) {
    binary.forEach((item) => pushBinaryRef(item, refs));
  } else {
    pushBinaryRef(binary, refs);
  }

  Object.values(value).forEach((item) => collectBinaryRefs(item, refs));
  return refs;
};

const replaceBinaryValue = (value: unknown, id: string, replacement: string): unknown => {
  if (typeof value === 'string') {
    return value === `feather-binary:${id}` ? replacement : value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => replaceBinaryValue(item, id, replacement));
  }

  if (!isRecord(value)) return value;

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceBinaryValue(item, id, replacement)]));
};

/**
 * Mounts at the root of the app (in <Modals>). Listens for Tauri events emitted by the
 * Rust WS server and routes each message type into the React Query cache so all pages
 * read live data without any polling.
 *
 * On disconnect: preserves existing cached data (logs, performance history) so the user
 * doesn't lose context. On reconnect, new data appends to the existing cache.
 */
export const useWsConnection = () => {
  const queryClient = useQueryClient();
  const setConfig = useConfigStore((state) => state.setConfig);
  const setDisconnected = useConfigStore((state) => state.setDisconnected);
  const setSession = useSessionStore((state) => state.setSession);
  const clearSession = useSessionStore((state) => state.clearSession);
  const addSession = useSessionStore((state) => state.addSession);
  const connectionTimeout = useSettingsStore((state) => state.connectionTimeout);
  const appId = useSettingsStore((state) => state.appId);
  const setPausedState = useDebuggerStore((state) => state.setPausedState);
  const setDebuggerEnabled = useDebuggerStore((state) => state.setEnabled);
  const lastMessageRef = useRef<number>(Date.now());
  const pendingBinaryRef = useRef<Record<string, PendingBinary[]>>({});

  // Keep Rust's app_id in sync with settings so it can validate auth:response.
  useEffect(() => {
    invoke('set_app_id', { appIdStr: appId }).catch(() => {});
  }, [appId]);


  // Connection health monitor: if no message within timeout, mark disconnected
  useEffect(() => {
    const checkInterval = setInterval(() => {
      const sessionId = useSessionStore.getState().sessionId;
      if (!sessionId) return;
      const elapsed = (Date.now() - lastMessageRef.current) / 1000;
      if (elapsed >= connectionTimeout) {
        setDisconnected(true);
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [connectionTimeout, setDisconnected]);

  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      const queueBinaryRefs = (
        sessionId: string,
        target: BinaryTarget,
        value: unknown,
        mode: BinaryMode = 'url',
      ) => {
        const refs = collectBinaryRefs(value);
        if (refs.length === 0) return;

        const queue = pendingBinaryRef.current[sessionId] ?? [];
        refs.forEach((ref) => queue.push({ ...ref, target, mode }));
        pendingBinaryRef.current[sessionId] = queue;
      };

      const unlistenBinary = await listen<BinaryEvent>('feather://binary', (event) => {
        if (cancelled) return;
        const { _session: sessionId, bytes } = event.payload;
        const pending = pendingBinaryRef.current[sessionId]?.shift();
        if (!pending) return;

        const byteArray = new Uint8Array(bytes);
        const replacement =
          pending.mode === 'text'
            ? new TextDecoder().decode(byteArray)
            : URL.createObjectURL(new Blob([byteArray], { type: pending.mime }));

        if (pending.target.type === 'assets') {
          queryClient.setQueryData<AssetCatalog>(sessionQueryKey.assets(sessionId), (prev) =>
            replaceBinaryValue(prev, pending.id, replacement) as AssetCatalog,
          );
          return;
        }

        if (pending.target.type === 'observers') {
          queryClient.setQueryData(sessionQueryKey.observers(sessionId), (prev) =>
            replaceBinaryValue(prev, pending.id, replacement),
          );
          return;
        }

        if (pending.target.type === 'timeTravelFrames') {
          queryClient.setQueryData<TimeTravelFrame[]>(sessionQueryKey.timeTravelFrames(sessionId), (prev) =>
            replaceBinaryValue(prev, pending.id, replacement) as TimeTravelFrame[],
          );
          return;
        }

        if (pending.target.type === 'sessionReplayRecording') {
          queryClient.setQueryData<SessionReplayRecording | null>(
            sessionQueryKey.sessionReplayRecording(sessionId),
            (prev) => replaceBinaryValue(prev, pending.id, replacement) as SessionReplayRecording,
          );
          const replayId = pending.target.replayId;
          if (replayId) {
            queryClient.setQueryData<SessionReplayRecordings>(
              sessionQueryKey.sessionReplayRecordings(sessionId),
              (prev) => {
                const current = prev?.[replayId];
                if (!current) return prev ?? {};
                return {
                  ...(prev ?? {}),
                  [replayId]: replaceBinaryValue(current, pending.id, replacement) as SessionReplayRecording,
                };
              },
            );
          }
          return;
        }

        if (pending.target.type === 'debuggerPaused') {
          const current = useDebuggerStore.getState().pausedState[sessionId];
          setPausedState(sessionId, replaceBinaryValue(current, pending.id, replacement) as PausedState);
          return;
        }

        if (pending.target.type === 'console') {
          queryClient.setQueryData<EvalResponse[]>(sessionQueryKey.console(sessionId), (prev) =>
            replaceBinaryValue(prev, pending.id, replacement) as EvalResponse[],
          );
          return;
        }

        queryClient.setQueryData<PluginContentProps>(
          sessionQueryKey.plugin(sessionId, pending.target.pluginId),
          (prev) => replaceBinaryValue(prev, pending.id, replacement) as PluginContentProps,
        );
      });

      // Game → desktop messages
      const unlistenMessage = await listen<string>('feather://message', (event) => {
        if (cancelled) return;
        let msg: WsMessage;

        try {
          msg = JSON.parse(event.payload) as WsMessage;
        } catch {
          return;
        }

        // Any message from the game resets the health timer
        lastMessageRef.current = Date.now();

        const { _session: sessionId, type, data } = msg;

        // If we receive a message from an unknown session (e.g. frontend restarted while
        // game was connected), ask the game to resend its config. The game is already in
        // "connected" state so it will respond immediately with feather:hello.
        if (type !== 'feather:hello' && type !== 'auth:response') {
          const sessions = useSessionStore.getState().sessions;
          if (!sessions[sessionId]) {
            sendCommand(sessionId, { type: 'req:config' }).catch(() => {});
          }
        }

        switch (type) {
          case 'auth:response':
            // Handled by Rust — ignore any that leak through.
            break;

          case 'feather:hello': {
            // Config handshake — sets up the session and stores game config
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const config = data as any;
            if (typeof config.API === 'number' && config.API !== FEATHER_PLUGIN_API) {
              toast.warning(
                `Feather API mismatch: game uses ${config.API}, desktop supports ${FEATHER_PLUGIN_API}. Some plugins may be unavailable.`,
              );
            }

            const historyKeys = resolveLogHistoryKeys(config, sessionId);
            const sessionLabel = config.sessionName || config.root_path?.split('/').pop() || 'Game';
            const logHistory = useLogHistoryStore.getState();
            let restoredLogs = mergeLogLists(
              logHistory.getLogsForSession(sessionId),
              logHistory.getLogsForHistoryKeys(historyKeys),
            );

            // Migrate cached data from previous session of the same device
            const deviceId = config.deviceId;
            if (deviceId) {
              const sessions = useSessionStore.getState().sessions;
              const oldSession = Object.values(sessions).find((s) => s.deviceId === deviceId && s.id !== sessionId);
              if (oldSession) {
                // Carry over logs, performance, observers from old session
                const oldLogs = queryClient.getQueryData<Log[]>(sessionQueryKey.logs(oldSession.id));
                if (oldLogs?.length) {
                  restoredLogs = mergeLogLists(restoredLogs, oldLogs);
                }
                const oldHistoryKeys =
                  logHistory.sessionHistoryKeys[oldSession.id] ??
                  (oldSession.deviceId ? [`device:${oldSession.deviceId}`] : []);
                restoredLogs = mergeLogLists(
                  restoredLogs,
                  logHistory.getLogsForSession(oldSession.id),
                  logHistory.getLogsForHistoryKeys(oldHistoryKeys),
                );
                const oldPerf = queryClient.getQueryData<PerformanceMetrics[]>(
                  sessionQueryKey.performance(oldSession.id),
                );
                if (oldPerf?.length) {
                  queryClient.setQueryData(sessionQueryKey.performance(sessionId), oldPerf);
                }
                const oldObs = queryClient.getQueryData(sessionQueryKey.observers(oldSession.id));
                if (oldObs) {
                  queryClient.setQueryData(sessionQueryKey.observers(sessionId), oldObs);
                }
                const oldAssets = queryClient.getQueryData(sessionQueryKey.assets(oldSession.id));
                if (oldAssets) {
                  queryClient.setQueryData(sessionQueryKey.assets(sessionId), oldAssets);
                }
                // Clean up old session cache
                queryClient.removeQueries({ queryKey: [oldSession.id] });
              }
            }

            const logsToRestore = mergeLogLists(
              queryClient.getQueryData<Log[]>(sessionQueryKey.logs(sessionId)),
              restoredLogs,
            );
            if (logsToRestore.length > 0) {
              queryClient.setQueryData(sessionQueryKey.logs(sessionId), logsToRestore);
              logHistory.replaceSessionLogs(sessionId, logsToRestore, historyKeys, sessionLabel);
            } else {
              logHistory.rememberSession(sessionId, historyKeys, sessionLabel);
            }

            setSession(sessionId);
            setConfig(config);
            setDisconnected(false);
            queryClient.setQueryData(sessionQueryKey.config(sessionId), config);
            if (config.debugger?.hotReload) {
              queryClient.setQueryData(sessionQueryKey.hotReload(sessionId), config.debugger.hotReload);
            }
            const debuggerState = useDebuggerStore.getState();
            const shouldEnable = config.debugger?.enabled || debuggerState.defaultEnabled;
            if (config.debugger?.pauseOnError !== undefined) {
              debuggerState.setPauseOnError(sessionId, config.debugger.pauseOnError);
            }
            console.log('Debugger enabled for session', sessionId);
            if (shouldEnable) {
              setDebuggerEnabled(sessionId, true);
              sendCommand(sessionId, { type: 'cmd:debugger:enable' }).catch(() => {});
              if (config.debugger?.pauseOnError !== undefined) {
                sendCommand(sessionId, {
                  type: 'cmd:debugger:set_options',
                  data: { pauseOnError: config.debugger.pauseOnError },
                }).catch(() => {});
              }
              const stored = debuggerState.breakpoints.filter((b) => b.enabled);
              if (stored.length > 0) {
                sendCommand(sessionId, {
                  type: 'cmd:debugger:set_breakpoints',
                  data: { breakpoints: stored.map(({ file, line, condition }) => ({ file, line, condition })) },
                }).catch(() => {});
              }
            }

            addSession({
              id: sessionId,
              os: config.sysInfo?.os,
              name: config.sessionName || config.root_path?.split('/').pop() || 'Game',
              connected: true,
              connectedAt: Date.now(),
              deviceId: config.deviceId,
              insecure: config.security?.__DANGEROUS_INSECURE_CONNECTION__ === true,
            });
            break;
          }

          case 'log': {
            const log = data as Log;
            queryClient.setQueryData<Log[]>(sessionQueryKey.logs(sessionId), (prev) => [...(prev ?? []), log]);
            const history = useLogHistoryStore.getState();
            history.appendLog(sessionId, log, history.sessionHistoryKeys[sessionId]);
            break;
          }

          case 'log:update': {
            const { id, count, time, lastTime } = data as { id: string; count: number; time: number; lastTime?: number };
            queryClient.setQueryData<Log[]>(sessionQueryKey.logs(sessionId), (prev) =>
              applyLogUpdate(prev ?? [], { id, count, time, lastTime }),
            );
            const history = useLogHistoryStore.getState();
            history.updateLog(sessionId, { id, count, time, lastTime }, history.sessionHistoryKeys[sessionId]);
            break;
          }

          case 'performance': {
            const metric = normalizePerformanceMetric(data, { runtimeUnits: true });
            queryClient.setQueryData<PerformanceMetrics[]>(sessionQueryKey.performance(sessionId), (prev) => [
              ...(prev ?? []),
              metric,
            ]);
            break;
          }

          case 'observe': {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const incoming = data as Record<string, any>[];
            queueBinaryRefs(sessionId, { type: 'observers' }, incoming, 'text');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const existing: Record<string, any>[] = queryClient.getQueryData(sessionQueryKey.observers(sessionId)) ?? [];
            const existingMap = new Map(existing.map((e) => [e.key, e]));
            const HISTORY_MAX = 50;
            const now = Date.now();
            const merged = incoming.map((entry) => {
              const prev = existingMap.get(entry.key);
              const changedNow = prev !== undefined && prev.value !== entry.value;
              const history: string[] = prev?.history ?? [];
              if (changedNow) {
                history.push(prev.value);
                if (history.length > HISTORY_MAX) history.shift();
              }
              const group = typeof entry.key === 'string' ? (entry.key.match(/^([^.:/\s]+)/)?.[1] ?? 'ungrouped') : 'ungrouped';
              const value = `${entry.value ?? ''}`;
              const lastChanged = changedNow ? now : prev?.lastChanged;
              return {
                ...entry,
                previous: changedNow ? prev?.value : prev?.previous,
                changed: changedNow,
                history,
                group,
                firstSeen: prev?.firstSeen ?? now,
                lastSeen: now,
                lastChanged,
                changeCount: (prev?.changeCount ?? 0) + (changedNow ? 1 : 0),
                valueLength: value.length,
              };
            });
            queryClient.setQueryData(sessionQueryKey.observers(sessionId), merged);
            break;
          }

          case 'assets': {
            const incoming = data as AssetCatalog;
            queueBinaryRefs(sessionId, { type: 'assets' }, incoming);
            queryClient.setQueryData<AssetCatalog>(sessionQueryKey.assets(sessionId), (prev) => ({
              ...incoming,
              preview: incoming.preview === false ? null : (incoming.preview ?? prev?.preview ?? null),
            }));
            break;
          }

          case 'assets:error': {
            const payload = data as { message?: string };
            toast.error(`Asset preview failed: ${payload?.message || 'Unknown error'}`);
            break;
          }

          case 'auth:error': {
            // Legacy: older game builds sent auth:error per-command. Kept for backward compat.
            const payload = data as { message?: string };
            toast.error(payload?.message || 'Feather app ID was rejected by the game');
            break;
          }

          case 'hot_reload:state': {
            queryClient.setQueryData(sessionQueryKey.hotReload(sessionId), data as HotReloadState);
            break;
          }

          case 'hot_reload:result': {
            const payload = data as {
              ok?: boolean;
              module?: string;
              error?: string;
              persisted?: boolean;
              state?: HotReloadState;
            };
            if (payload.state) {
              queryClient.setQueryData(sessionQueryKey.hotReload(sessionId), payload.state);
            }
            if (payload.ok) {
              toast.success(
                `Hot reloaded ${payload.module || 'module'}${payload.persisted ? ' and saved patch' : ''}`,
              );
            } else {
              toast.error(`Hot reload failed: ${payload.error || 'Unknown error'}`);
            }
            break;
          }

          case 'plugin': {
            const pluginId = msg.plugin;
            if (!pluginId) break;
            const pluginData = data as PluginContentProps;
            queueBinaryRefs(sessionId, { type: 'plugin', pluginId }, pluginData);

            queryClient.setQueryData<PluginContentProps>(sessionQueryKey.plugin(sessionId, pluginId), (prev) => {
              if (pluginData?.type === 'gallery' && pluginData.persist && prev?.type === 'gallery') {
                return {
                  ...pluginData,
                  data: unionBy<PluginDataType, string>(prev.data, pluginData.data, (item) => item.name),
                };
              }
              return pluginData;
            });
            break;
          }

          case 'plugin:action:response': {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const response = msg as any;
            const pluginId = response.plugin;
            const action = response.action;
            if (pluginId && action) {
              queryClient.setQueryData(sessionQueryKey.pluginAction(sessionId, pluginId, action), response);
            }
            if (response.status === 'error') {
              toast.error(`Plugin action failed: ${response.message || 'Unknown error'}`);
            } else if (response.zipAssets && isWeb()) {
              toast.error('ZIP export is available in the desktop app');
            } else if (response.zipAssets && !isWeb()) {
              const archive: Record<string, Uint8Array> = {};
              for (const file of response.zipAssets.files ?? []) {
                archive[file.name] =
                  file.encoding === 'base64' ? base64ToUint8Array(file.data) : strToU8(String(file.data ?? ''));
              }
              const bytes = zipSync(archive);
              saveFileDialog({
                defaultPath: response.zipAssets.filename ?? 'particle-system-playground.zip',
                filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
              })
                .then(async (path) => {
                  if (!path) return;
                  await writeFile(path, bytes);
                  toast.success(`Saved to ${path}`);
                })
                .catch(() => {
                  toast.error('Failed to save ZIP');
                });
            } else if (response.download && isWeb()) {
              const { filename, content } = response.download;
              const blob = new Blob([String(content ?? '')], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = filename ?? 'download.json';
              a.click();
              URL.revokeObjectURL(url);
              toast.success('Download started');
            } else if (response.download && !isWeb()) {
              // Generic file download: plugin returned data to save
              const { filename, content, extension } = response.download;
              saveFileDialog({
                defaultPath: filename,
                filters: [{ name: 'All Files', extensions: [extension] }],
              })
                .then(async (path) => {
                  if (!path) return;
                  await writeTextFile(path, content);
                  toast.success(`Saved to ${path}`);
                })
                .catch(() => {
                  toast.error('Failed to save file');
                });
            } else if (response.clipboard) {
              navigator.clipboard
                .writeText(response.clipboard)
                .then(() => {
                  toast.success('Copied to clipboard');
                })
                .catch(() => {
                  toast.error('Failed to copy to clipboard');
                });
            }
            break;
          }

          case 'eval:response': {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const evalMsg = msg as any;
            queueBinaryRefs(sessionId, { type: 'console' }, evalMsg, 'text');
            queryClient.setQueryData<EvalResponse[]>(sessionQueryKey.console(sessionId), (prev) => [
              ...(prev ?? []),
              {
                id: evalMsg.id,
                status: evalMsg.status,
                result: evalMsg.result ?? null,
                prints: evalMsg.prints ?? [],
                values: evalMsg.values,
              },
            ]);
            break;
          }

          case 'console:enabled': {
            const payload = data as { ok?: boolean; enabled?: boolean; error?: string };
            if (payload.ok) {
              toast.success(payload.enabled ? 'Console enabled' : 'Console disabled');
            } else {
              toast.error(payload.error || 'Console could not be enabled');
            }
            break;
          }

          case 'console:globals': {
            queryClient.setQueryData(sessionQueryKey.consoleGlobals(sessionId), data as ConsoleGlobalsResponse);
            break;
          }

          case 'console:pins': {
            queryClient.setQueryData(sessionQueryKey.consolePins(sessionId), data as ConsolePinsResponse);
            break;
          }

          case 'console:inspect_result': {
            queryClient.setQueryData(sessionQueryKey.consoleInspect(sessionId), data as ConsoleInspectResultResponse);
            break;
          }

          case 'debugger:paused': {
            queueBinaryRefs(sessionId, { type: 'debuggerPaused' }, data, 'text');
            setPausedState(sessionId, data as PausedState);
            break;
          }

          case 'debugger:status': {
            useDebuggerStore.getState().setStatus(sessionId, data as DebuggerStatus);
            break;
          }

          case 'debugger:breakpoint_error': {
            useDebuggerStore.getState().addBreakpointError(sessionId, data as BreakpointIssue);
            break;
          }

          case 'debugger:frame': {
            queueBinaryRefs(sessionId, { type: 'debuggerPaused' }, data, 'text');
            useDebuggerStore.getState().setFrameVariables(
              sessionId,
              data as {
                pauseId?: number;
                index?: number;
                locals?: Record<string, string>;
                upvalues?: Record<string, string>;
              },
            );
            break;
          }

          case 'debugger:resumed': {
            setPausedState(sessionId, null);
            break;
          }

          case 'time_travel:status': {
            queryClient.setQueryData(sessionQueryKey.timeTravel(sessionId), data as TimeTravelStatus);
            break;
          }

          case 'time_travel:frames': {
            const framesMsg = data as { frames: TimeTravelFrame[] };
            queueBinaryRefs(sessionId, { type: 'timeTravelFrames' }, framesMsg, 'text');
            queryClient.setQueryData(sessionQueryKey.timeTravelFrames(sessionId), framesMsg.frames);
            break;
          }

          case 'session_replay:status': {
            queryClient.setQueryData(sessionQueryKey.sessionReplay(sessionId), data as SessionReplayStatus);
            const payload = data as SessionReplayStatus;
            if (payload.replayId) {
              queryClient.setQueryData(sessionQueryKey.sessionReplaySelected(sessionId), payload.replayId);
            }
            break;
          }

          case 'session_replay:recording': {
            const payload = data as SessionReplayRecording;
            const replayId = sessionReplayRecordingId(payload);
            queueBinaryRefs(sessionId, { type: 'sessionReplayRecording', replayId }, payload, 'text');
            queryClient.setQueryData(sessionQueryKey.sessionReplayRecording(sessionId), payload);
            if (replayId) {
              queryClient.setQueryData(sessionQueryKey.sessionReplaySelected(sessionId), replayId);
              queryClient.setQueryData<SessionReplayRecordings>(
                sessionQueryKey.sessionReplayRecordings(sessionId),
                (prev) => ({
                  ...(prev ?? {}),
                  [replayId]: payload,
                }),
              );
            }
            break;
          }

          case 'session_replay:list': {
            const payload = data as { replays?: SessionReplaySummary[]; selectedId?: string | null };
            queryClient.setQueryData(sessionQueryKey.sessionReplayList(sessionId), payload.replays ?? []);
            if (payload.selectedId !== undefined) {
              queryClient.setQueryData(sessionQueryKey.sessionReplaySelected(sessionId), payload.selectedId);
            }
            break;
          }

          case 'session_replay:error': {
            const payload = data as { message?: string };
            toast.error(`Session replay failed: ${payload?.message || 'Unknown error'}`);
            break;
          }

          case 'feather:bye': {
            // Graceful disconnect — preserve cached data (logs, perf history) so user
            // doesn't lose context. Only mark as disconnected and clear session routing.
            setPausedState(sessionId, null);
            setDisconnected(true);
            clearSession();
            break;
          }
        }
      });

      if (cancelled) {
        unlistenBinary();
        unlistenMessage();
        return;
      }

      // TCP-level disconnect (no feather:bye was sent)
      // Preserve cached data — the game may reconnect momentarily (e.g. lag spike)
      const unlistenEnd = await listen<string>('feather://session-end', () => {
        if (cancelled) return;
        setDisconnected(true);
        clearSession();
      });

      if (cancelled) {
        unlistenBinary();
        unlistenMessage();
        unlistenEnd();
        return;
      }

      // Rust completed the auth handshake — game is now in "connected" state and will
      // send feather:hello on its own. req:config is a nudge in case feather:hello is delayed.
      const unlistenStart = await listen<string>('feather://session-start', (event) => {
        if (cancelled) return;
        sendCommand(event.payload, { type: 'req:config' }).catch(() => {});
      });

      if (cancelled) {
        unlistenBinary();
        unlistenMessage();
        unlistenEnd();
        unlistenStart();
        return;
      }

      // Poll Rust for sessions not yet visible in React. Rust already completed the
      // auth handshake, so the game is in "connected" state — req:config is enough to
      // prompt feather:hello. Runs on mount and every 2 s so a missed session-start
      // event never requires a page refresh.
      const probe = () => {
        invoke<string[]>('get_active_sessions')
          .then((sessionIds) => {
            if (cancelled) return;
            const knownSessions = useSessionStore.getState().sessions;
            sessionIds.forEach((sessionId) => {
              if (knownSessions[sessionId]) return;
              sendCommand(sessionId, { type: 'req:config' }).catch(() => {});
            });
          })
          .catch(() => {});
      };

      probe();
      const probeInterval = setInterval(probe, 2000);

      unlisteners.push(unlistenBinary, unlistenMessage, unlistenEnd, unlistenStart, () => clearInterval(probeInterval));
    };

    setup().catch(() => {
      // If setup fails (e.g. Tauri IPC not ready), retry after a short delay.
      if (!cancelled) {
        setTimeout(() => { if (!cancelled) setup().catch(() => {}); }, 500);
      }
    });

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [queryClient, setConfig, setDisconnected, setSession, clearSession, addSession]);
};
