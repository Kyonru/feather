import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { debounce } from '@/utils/timers';
import { useSessionStore } from '@/store/session';
import { sessionQueryKey } from './use-ws-connection';
import { toast } from 'sonner';

/** Strip the /plugins/ prefix so the ID matches what Lua uses as plugin.identifier */
function normalizePluginId(pluginId: string): string {
  return pluginId.replace(/^\/plugins\//, '');
}

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
  const normalized = normalizePluginId(pluginId);
  const [params, setParams] = useState<Record<string, string | boolean>>({});

  const sendCommand = (message: object) => {
    if (!sessionId) return Promise.resolve();
    return invoke('send_command', { sessionId, message: JSON.stringify(message) }).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Failed to send command');
    });
  };

  const onAction = (action: string) => {
    sendCommand({ type: 'cmd:plugin:action', plugin: normalized, action, params });
  };

  const onCancel = (action: string) => {
    sendCommand({ type: 'cmd:plugin:action:cancel', plugin: normalized, action });
  };

  const updateOptions = useMemo(
    () =>
      debounce(() => {
        sendCommand({ type: 'cmd:plugin:params', plugin: normalized, params });
      }, 1000),
    [sessionId, normalized, params],
  );

  const onActionChange = (action: string, value: string | boolean) => {
    setParams((prev) => ({ ...prev, [action]: value }));
    updateOptions();
  };

  return { onAction, onCancel, onActionChange };
};

export function usePlugin(pluginId: string) {
  const sessionId = useSessionStore((state) => state.sessionId);
  const normalized = normalizePluginId(pluginId);

  const { data } = useQuery<PluginContentProps>({
    queryKey: sessionQueryKey.plugin(sessionId ?? '', normalized),
    queryFn: () => ({ data: [], type: 'gallery' as const, loading: false }),
    enabled: false,
  });

  return { data: data ?? { data: [], type: 'gallery' as const, loading: false }, isPending: false };
}
