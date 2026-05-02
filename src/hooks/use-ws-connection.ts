import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useQueryClient } from '@tanstack/react-query';
import { useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';
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
 */
export const useWsConnection = () => {
  const queryClient = useQueryClient();
  const setConfig = useConfigStore((state) => state.setConfig);
  const setDisconnected = useConfigStore((state) => state.setDisconnected);
  const setSession = useSessionStore((state) => state.setSession);
  const clearSession = useSessionStore((state) => state.clearSession);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      // Game → desktop messages
      const unlistenMessage = await listen<string>('feather://message', (event) => {
        let msg: WsMessage;

        try {
          msg = JSON.parse(event.payload) as WsMessage;
          console.log('magic', msg);
        } catch {
          return;
        }

        const { _session: sessionId, type, data } = msg;

        switch (type) {
          case 'feather:hello': {
            // Config handshake — sets up the session and stores game config
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const config = data as any;
            setSession(sessionId);
            setConfig(config);
            setDisconnected(false);
            queryClient.setQueryData(sessionQueryKey.config(sessionId), config);
            break;
          }

          case 'log': {
            const log = data as Log;
            queryClient.setQueryData<Log[]>(sessionQueryKey.logs(sessionId), (prev) => [...(prev ?? []), log]);
            break;
          }

          case 'performance': {
            const metric = data as PerformanceMetrics;
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
              if (pluginData.persist && prev) {
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
            queryClient.removeQueries({ queryKey: [sessionId] });
            setDisconnected(true);
            clearSession();
            break;
          }
        }
      });

      // TCP-level disconnect (no feather:bye was sent)
      const unlistenEnd = await listen<string>('feather://session-end', () => {
        setDisconnected(true);
        clearSession();
      });

      unlisteners.push(unlistenMessage, unlistenEnd);
    };

    setup();

    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [queryClient, setConfig, setDisconnected, setSession, clearSession]);
};
