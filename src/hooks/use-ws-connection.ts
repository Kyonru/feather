import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useQueryClient } from '@tanstack/react-query';
import { useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';
import { useSettingsStore } from '@/store/settings';
import type { Log } from './use-logs';
import type { PerformanceMetrics } from './use-performance';
import type { PluginContentProps, PluginDataType } from './use-plugin';
import { unionBy } from '@/utils/arrays';

// Cache key helpers — all indexed by the Rust-assigned session ID
export const sessionQueryKey = {
  config: (sessionId: string) => [sessionId, 'config'],
  logs: (sessionId: string) => [sessionId, 'logs'],
  performance: (sessionId: string) => [sessionId, 'performance'],
  observers: (sessionId: string) => [sessionId, 'observers'],
  plugin: (sessionId: string, pluginId: string) => [sessionId, 'plugin', pluginId],
};

type WsMessage = {
  _session: string;
  type: string;
  data?: unknown;
  plugin?: string;
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
          console.log('Received message', msg);
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
            }).catch(() => { });
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
              const oldSession = Object.values(sessions).find(
                (s) => s.deviceId === deviceId && s.id !== sessionId,
              );
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
              if (pluginData?.persist && prev) {
                return {
                  ...pluginData,
                  data: unionBy<PluginDataType, string>(prev.data, pluginData.data, (item) => item.name),
                };
              }
              return pluginData;
            });
            break;
          }

          case 'feather:bye': {
            // Graceful disconnect — preserve cached data (logs, perf history) so user
            // doesn't lose context. Only mark as disconnected and clear session routing.
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

      unlisteners.push(unlistenMessage, unlistenEnd);
    };

    setup();

    return () => {
      cancelled = true;
      unlisteners.forEach((fn) => fn());
    };
  }, [queryClient, setConfig, setDisconnected, setSession, clearSession, addSession]);
};
