import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { debounce } from '@/utils/timers';
import { unionBy } from '@/utils/arrays';
import { useSessionStore } from '@/store/session';
import { sessionQueryKey } from './use-ws-connection';
import { toast } from 'sonner';

export type ScreenshotType = {
  type: 'png';
  src: string;
  width: number;
  height: number;
};

export type GifType = {
  type: 'gif';
  name: string;
  src: string[];
  width: number;
  height: number;
  downloadable: boolean;
  fps: number;
};

export interface PluginContentImageType {
  type: 'image';
  name: string;
  downloadable: boolean;
  metadata: ScreenshotType | GifType;
}

export type PluginDataType = PluginContentImageType;

export interface PluginContentProps {
  data: Array<PluginDataType>;
  type: 'gallery';
  loading: boolean;
  persist?: boolean;
}

export const usePluginAction = (pluginId: string) => {
  const sessionId = useSessionStore((state) => state.sessionId);
  const [params, setParams] = useState<Record<string, string | boolean>>({});

  const sendCommand = (message: object) => {
    if (!sessionId) return Promise.resolve();
    return invoke('send_command', { sessionId, message: JSON.stringify(message) }).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Failed to send command');
    });
  };

  const onAction = (action: string) => {
    sendCommand({ type: 'cmd:plugin:action', plugin: pluginId, action, params });
  };

  const updateOptions = useMemo(
    () =>
      debounce(() => {
        sendCommand({ type: 'cmd:plugin:params', plugin: pluginId, params });
      }, 1000),
    [sessionId, pluginId, params],
  );

  const onActionChange = (action: string, value: string | boolean) => {
    setParams((prev) => ({ ...prev, [action]: value }));
    updateOptions();
  };

  return { onAction, onActionChange };
};

export function usePlugin(pluginId: string) {
  const queryClient = useQueryClient();
  const sessionId = useSessionStore((state) => state.sessionId);

  const data = useMemo<PluginContentProps>(() => {
    if (!sessionId) return { data: [], type: 'gallery', loading: false };

    const cached = queryClient.getQueryData<PluginContentProps>(sessionQueryKey.plugin(sessionId, pluginId));

    if (!cached) return { data: [], type: 'gallery', loading: false };

    if (cached.persist) {
      const prev = queryClient.getQueryData<PluginContentProps>(sessionQueryKey.plugin(sessionId, pluginId));
      return {
        ...cached,
        data: unionBy<PluginDataType, string>(prev?.data ?? [], cached.data, (item) => item.name),
      };
    }

    return cached;
  }, [queryClient, sessionId, pluginId]);

  return { data, isPending: false };
}
