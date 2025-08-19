import { ServerRoute } from '@/constants/server';
import { timeout } from '@/utils/timers';
import { Config, useConfigStore } from '@/store/config';
import { useQuery } from '@tanstack/react-query';
import { useServer } from './use-server';
import { version } from '../../package.json';

export function useConfig(): {
  data: Config | undefined;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
} {
  const setConfig = useConfigStore((state) => state.setConfig);
  const setDisconnected = useConfigStore((state) => state.setDisconnected);
  const { url: serverUrl } = useServer();

  const { isFetching, error, data, refetch } = useQuery({
    queryKey: ['config'],
    queryFn: async () => {
      try {
        const response = await timeout<Response>(3000, fetch(`${serverUrl}${ServerRoute.CONFIG}?p=feather`));
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

  return {
    data,
    isFetching,
    error,
    refetch,
  };
}

export const useVersionMismatch = () => {
  const config = useConfigStore((state) => state.config);
  const isVersionMismatch = config?.version !== version;

  return isVersionMismatch;
};
