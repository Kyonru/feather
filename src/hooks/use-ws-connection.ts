import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { save as saveFileDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { useQueryClient } from '@tanstack/react-query';
import { useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';
import { useSettingsStore } from '@/store/settings';
import type { Log } from './use-logs';
import type { PerformanceMetrics } from './use-performance';
import type { PluginContentProps, PluginDataType } from './use-plugin';
import { unionBy } from '@/utils/arrays';
import { toast } from 'sonner';
import { isWeb } from '@/utils/platform';
import { useDebuggerStore, type PausedState } from '@/store/debugger';

// Cache key helpers — all indexed by the Rust-assigned session ID
export const sessionQueryKey = {
  config: (sessionId: string) => [sessionId, 'config'],
  logs: (sessionId: string) => [sessionId, 'logs'],
  performance: (sessionId: string) => [sessionId, 'performance'],
  observers: (sessionId: string) => [sessionId, 'observers'],
  plugin: (sessionId: string, pluginId: string) => [sessionId, 'plugin', pluginId],
  console: (sessionId: string) => [sessionId, 'console'],
  timeTravel: (sessionId: string) => [sessionId, 'time-travel'],
  timeTravelFrames: (sessionId: string) => [sessionId, 'time-travel-frames'],
};

type WsMessage = {
  _session: string;
  type: string;
  data?: unknown;
  plugin?: string;
};

export type EvalResponse = {
  id: string;
  status: 'success' | 'error';
  result: string | null;
  prints: string[];
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
  const setPausedState = useDebuggerStore((state) => state.setPausedState);
  const setDebuggerEnabled = useDebuggerStore((state) => state.setEnabled);
  const lastMessageRef = useRef<number>(Date.now());

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

        // If we receive a message from an unknown session (game connected before desktop),
        // ask it to send its hello so we can set up the session properly.
        if (type !== 'feather:hello') {
          const sessions = useSessionStore.getState().sessions;
          if (!sessions[sessionId]) {
            invoke('send_command', {
              sessionId,
              message: JSON.stringify({ type: 'req:config' }),
            }).catch(() => {});
          }
        }

        switch (type) {
          case 'feather:hello': {
            // Config handshake — sets up the session and stores game config
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const config = data as any;

            // Migrate cached data from previous session of the same device
            const deviceId = config.deviceId;
            if (deviceId) {
              const sessions = useSessionStore.getState().sessions;
              const oldSession = Object.values(sessions).find((s) => s.deviceId === deviceId && s.id !== sessionId);
              if (oldSession) {
                // Carry over logs, performance, observers from old session
                const oldLogs = queryClient.getQueryData<Log[]>(sessionQueryKey.logs(oldSession.id));
                if (oldLogs?.length) {
                  queryClient.setQueryData(sessionQueryKey.logs(sessionId), oldLogs);
                }
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
                // Clean up old session cache
                queryClient.removeQueries({ queryKey: [oldSession.id] });
              }
            }

            setSession(sessionId);
            setConfig(config);
            setDisconnected(false);
            queryClient.setQueryData(sessionQueryKey.config(sessionId), config);
            const debuggerState = useDebuggerStore.getState();
            const shouldEnable = config.debugger?.enabled || debuggerState.defaultEnabled;
            console.log('Debugger enabled for session', sessionId);
            if (shouldEnable) {
              setDebuggerEnabled(sessionId, true);
              invoke('send_command', {
                sessionId,
                message: JSON.stringify({ type: 'cmd:debugger:enable' }),
              }).catch(() => {});
              const stored = debuggerState.breakpoints.filter((b) => b.enabled);
              if (stored.length > 0) {
                invoke('send_command', {
                  sessionId,
                  message: JSON.stringify({
                    type: 'cmd:debugger:set_breakpoints',
                    data: { breakpoints: stored.map(({ file, line, condition }) => ({ file, line, condition })) },
                  }),
                }).catch(() => {});
              }
            }

            // Register session with OS info for the session tabs
            addSession({
              id: sessionId,
              os: config.sysInfo?.os,
              name: config.sessionName || config.root_path?.split('/').pop() || 'Game',
              connected: true,
              connectedAt: Date.now(),
              deviceId: config.deviceId,
            });
            break;
          }

          case 'log': {
            const log = data as Log;
            queryClient.setQueryData<Log[]>(sessionQueryKey.logs(sessionId), (prev) => [...(prev ?? []), log]);
            break;
          }

          case 'performance': {
            const metric = data as PerformanceMetrics;
            // Lua sends memory in KB (collectgarbage("count")), normalize to MB
            metric.memory = metric.memory / 1024;
            // Lua sends texturememory in bytes, normalize to MB
            if (metric.stats?.texturememory) {
              metric.stats.texturememory = metric.stats.texturememory / 1024 / 1024;
            }
            queryClient.setQueryData<PerformanceMetrics[]>(sessionQueryKey.performance(sessionId), (prev) => [
              ...(prev ?? []),
              metric,
            ]);
            break;
          }

          case 'observe': {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            queryClient.setQueryData(sessionQueryKey.observers(sessionId), data as Record<string, any>[]);
            break;
          }

          case 'plugin': {
            const pluginId = msg.plugin;
            if (!pluginId) break;
            const pluginData = data as PluginContentProps;

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
            if (response.status === 'error') {
              toast.error(`Plugin action failed: ${response.message || 'Unknown error'}`);
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
            queryClient.setQueryData<EvalResponse[]>(sessionQueryKey.console(sessionId), (prev) => [
              ...(prev ?? []),
              {
                id: evalMsg.id,
                status: evalMsg.status,
                result: evalMsg.result ?? null,
                prints: evalMsg.prints ?? [],
              },
            ]);
            break;
          }

          case 'debugger:paused': {
            setPausedState(sessionId, data as PausedState);
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
            queryClient.setQueryData(sessionQueryKey.timeTravelFrames(sessionId), framesMsg.frames);
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
        unlistenMessage();
        unlistenEnd();
        return;
      }

      // When a new game session opens, immediately request its config.
      // This handles the race where feather:hello fires before the message listener is ready.
      const unlistenStart = await listen<string>('feather://session-start', (event) => {
        if (cancelled) return;
        invoke('send_command', {
          sessionId: event.payload,
          message: JSON.stringify({ type: 'req:config' }),
        }).catch(() => {});
      });

      if (cancelled) {
        unlistenMessage();
        unlistenEnd();
        unlistenStart();
        return;
      }

      // On mount, probe any sessions already connected (e.g. after a hot reload).
      // The game won't resend feather:hello unprompted, so we ask.
      invoke<string[]>('get_active_sessions')
        .then((sessionIds) => {
          if (cancelled) return;
          const knownSessions = useSessionStore.getState().sessions;
          sessionIds.forEach((sessionId) => {
            if (!knownSessions[sessionId]) {
              invoke('send_command', {
                sessionId,
                message: JSON.stringify({ type: 'req:config' }),
              }).catch(() => {});
            }
          });
        })
        .catch(() => {});

      unlisteners.push(unlistenMessage, unlistenEnd, unlistenStart);
    };

    setup();

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [queryClient, setConfig, setDisconnected, setSession, clearSession, addSession]);
};
