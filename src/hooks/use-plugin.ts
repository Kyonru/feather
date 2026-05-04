import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { debounce } from '@/utils/timers';
import { useSessionStore } from '@/store/session';
import { sessionQueryKey } from './use-ws-connection';
import { toast } from 'sonner';
import { isWeb } from '@/utils/platform';

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

export interface PluginTableColumn {
  key: string;
  label: string;
}

export interface PluginTableRow {
  [key: string]: string;
}

export type PluginDataType = PluginContentImageType;

export interface PluginContentGalleryProps {
  data: Array<PluginDataType>;
  type: 'gallery';
  loading: boolean;
  persist?: boolean;
}

export interface PluginContentTableProps {
  type: 'table';
  columns: PluginTableColumn[];
  data: PluginTableRow[];
  loading: boolean;
}

export interface PluginTreeNodeProperty {
  key: string;
  value: string;
}

export interface PluginTreeNode {
  name: string;
  properties: PluginTreeNodeProperty[];
  children?: PluginTreeNode[];
}

export interface PluginContentTreeProps {
  type: 'tree';
  nodes: PluginTreeNode[];
  sources: string[];
  selectedSource: number;
  searchFilter: string;
  loading: boolean;
  total?: number;
  shown?: number;
}

export interface PluginTimelineItem {
  id: number;
  label: string;
  category: string;
  color?: string;
  time: number;
  gameTime: string;
  screenshot?: string;
}

export interface PluginContentTimelineProps {
  type: 'timeline';
  items: PluginTimelineItem[];
  categories: string[];
  loading: boolean;
}

export type PluginContentProps = PluginContentGalleryProps | PluginContentTableProps | PluginContentTreeProps | PluginContentTimelineProps;

export const usePluginAction = (pluginId: string) => {
  const sessionId = useSessionStore((state) => state.sessionId);
  const normalized = normalizePluginId(pluginId);
  const [params, setParams] = useState<Record<string, string | boolean>>({});
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const sendCommand = (message: object) => {
    if (!sessionId) return Promise.resolve();
    return invoke('send_command', { sessionId, message: JSON.stringify(message) }).catch((e: unknown) => {
      toast.error(e instanceof Error ? e.message : 'Failed to send command');
    });
  };

  const onAction = (action: string) => {
    sendCommand({ type: 'cmd:plugin:action', plugin: normalized, action, params: paramsRef.current });
  };

  const onFileAction = async (action: string, filters?: { name: string; extensions: string[] }[]) => {
    try {
      if (isWeb()) {
        toast.error('File actions are not supported in the web version');
        return;
      }
      const path = await openFileDialog({
        multiple: false,
        filters: filters ?? [{ name: 'JSON', extensions: ['json'] }],
      });
      if (!path) return;
      const content = await readTextFile(path);
      sendCommand({
        type: 'cmd:plugin:action',
        plugin: normalized,
        action,
        params: { ...paramsRef.current, fileContent: content, fileName: typeof path === 'string' ? path : '' },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to read file');
    }
  };

  const onCancel = (action: string) => {
    sendCommand({ type: 'cmd:plugin:action:cancel', plugin: normalized, action });
  };

  const updateOptions = useMemo(
    () =>
      debounce(() => {
        sendCommand({ type: 'cmd:plugin:params', plugin: normalized, params: paramsRef.current });
      }, 1000),
    [sessionId, normalized],
  );

  const onActionChange = (action: string, value: string | boolean) => {
    setParams((prev) => ({ ...prev, [action]: value }));
    updateOptions();
  };

  return { onAction, onFileAction, onCancel, onActionChange };
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
