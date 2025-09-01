import { ServerRoute } from '@/constants/server';
import { debounce, timeout } from '@/utils/timers';
import { Config, useConfigStore } from '@/store/config';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useServer } from './use-server';
import { version } from '../../package.json';
import { useMemo } from 'react';

export function useConfig(): {
  data: Config | undefined;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
  updateSampleRate: (...[value]: [number]) => void;
} {
  const setConfig = useConfigStore((state) => state.setConfig);
  const setDisconnected = useConfigStore((state) => state.setDisconnected);
  const setSampleRate = useConfigStore((state) => state.setSampleRate);
  const { url: serverUrl, apiKey } = useServer();

  const { isFetching, error, data, refetch } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      try {
        const response = await timeout<Response>(
          3000,
          fetch(`${serverUrl}${ServerRoute.CONFIG}?p=feather`, {
            headers: {
              'x-api-key': apiKey,
            },
          }),
        );
        const config = await response.json();

        setConfig(config);
        setDisconnected(false);
        return config;
      } catch {
        setConfig(null);
        setDisconnected(true);
        return null;
      }
    },
  });

  const update = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string | number | boolean }) => {
      try {
        await timeout<Response>(
          3000,
          fetch(`${serverUrl}${ServerRoute.CONFIG}?${key}=${value}`, {
            method: 'PUT',
            headers: {
              'x-api-key': apiKey,
            },
          }),
        );

        return [];
      } catch (e) {
        console.log('error', e);
        return [];
      }
    },
  });

  const updateSampleRate = useMemo(
    () =>
      debounce((...[value]) => {
        update.mutate({
          key: 'sampleRate',
          value: value as number,
        });
      }, 1000),
    [],
  );

  const onUpdateSampleRate = (value: number) => {
    setSampleRate(value as number);
    updateSampleRate(value);
  };

  return {
    data,
    isFetching,
    error,
    refetch,
    updateSampleRate: onUpdateSampleRate,
  };
}

export const useVersionMismatch = () => {
  const config = useConfigStore((state) => state.config);
  const isVersionMismatch = config?.version !== version;

  return isVersionMismatch;
};

export const useSampleRate = () => {
  const config = useConfigStore((state) => state.config);
  const sampleRate = config?.sampleRate;

  return sampleRate || 1;
};

export const useLanguage = () => {
  const config = useConfigStore((state) => state.config);
  const language = config?.language;

  return language || 'lua';
};
