import { useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useQuery } from '@tanstack/react-query';
import { useSessionStore } from '@/store/session';
import { sessionQueryKey } from './use-ws-connection';

export type AssetKind = 'texture' | 'font' | 'audio';

export type TextureAsset = {
  id: number;
  name: string;
  displayName: string;
  path?: string;
  width: number;
  height: number;
  format: string;
  mipmaps: number;
};

export type FontAsset = {
  id: number;
  name: string;
  displayName: string;
  path?: string;
  height: number;
  ascent: number;
  descent: number;
};

export type AudioAsset = {
  id: number;
  name: string;
  displayName: string;
  path?: string;
  srcType: string;
  channels: number;
  duration: number;
};

export type AssetPreview = {
  id: number;
  name: string;
  type: 'png';
  src: string;
  width: number;
  height: number;
};

export type AssetCatalog = {
  enabled?: boolean;
  textures: TextureAsset[];
  fonts: FontAsset[];
  audio: AudioAsset[];
  preview?: AssetPreview | null | false;
};

const EMPTY_ASSETS: AssetCatalog = {
  textures: [],
  fonts: [],
  audio: [],
  preview: null,
};

export function useAssets() {
  const sessionId = useSessionStore((state) => state.sessionId);

  const { data } = useQuery<AssetCatalog>({
    queryKey: sessionQueryKey.assets(sessionId ?? ''),
    queryFn: () => EMPTY_ASSETS,
    enabled: false,
  });

  const previewAsset = useMemo(() => {
    return (kind: Exclude<AssetKind, 'audio'>, id: number) => {
      if (!sessionId) return;
      invoke('send_command', {
        sessionId,
        message: JSON.stringify({
          type: 'cmd:assets:preview',
          data: { kind, id },
        }),
      }).catch(console.error);
    };
  }, [sessionId]);

  const setAssetPreviewEnabled = useMemo(() => {
    return (enabled: boolean) => {
      if (!sessionId) return;
      invoke('send_command', {
        sessionId,
        message: JSON.stringify({
          type: 'cmd:assets:toggle',
          data: { enabled },
        }),
      }).catch(console.error);
    };
  }, [sessionId]);

  return {
    data: data ?? EMPTY_ASSETS,
    previewAsset,
    setAssetPreviewEnabled,
  };
}
