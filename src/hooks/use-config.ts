import { useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { debounce } from '@/utils/timers';
import { Config, useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';

export function useConfig(): {
  data: Config | undefined;
  updateSampleRate: (value: number) => void;
  updateDiskUsage: (enabled: boolean) => void;
} {
  const config = useConfigStore((state) => state.config);
  const sessionId = useSessionStore((state) => state.sessionId);

  const updateSampleRate = useMemo(() => {
    return debounce((value: number) => {
      if (!sessionId) return;

      invoke('send_command', {
        sessionId,
        message: JSON.stringify({
          type: 'cmd:config',
          data: { sampleRate: value },
        }),
      }).catch(console.error);
    }, 1000);
  }, [sessionId]);

  const updateDiskUsage = useMemo(() => {
    return (enabled: boolean) => {
      if (!sessionId) return;
      invoke('send_command', {
        sessionId,
        message: JSON.stringify({
          type: 'cmd:config',
          data: { diskUsage: enabled },
        }),
      }).catch(console.error);
    };
  }, [sessionId]);

  return {
    data: config ?? undefined,
    updateSampleRate,
    updateDiskUsage,
  };
}

export const useSampleRate = () => {
  const config = useConfigStore((state) => state.config);
  return config?.sampleRate ?? 1;
};

export const useLanguage = () => {
  const config = useConfigStore((state) => state.config);
  return config?.language ?? 'lua';
};
