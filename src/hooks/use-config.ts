import { useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { debounce } from '@/utils/timers';
import { Config, useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';
import { version } from '../../package.json';

export function useConfig(): {
  data: Config | undefined;
  updateSampleRate: (value: number) => void;
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

  return {
    data: config ?? undefined,
    updateSampleRate,
  };
}

export const useVersionMismatch = () => {
  const config = useConfigStore((state) => state.config);
  return config?.version !== version;
};

export const useSampleRate = () => {
  const config = useConfigStore((state) => state.config);
  return config?.sampleRate ?? 1;
};

export const useLanguage = () => {
  const config = useConfigStore((state) => state.config);
  return config?.language ?? 'lua';
};
