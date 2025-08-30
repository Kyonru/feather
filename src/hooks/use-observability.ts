/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServerRoute } from '@/constants/server';
import { timeout } from '@/utils/timers';
import { useConfigStore } from '@/store/config';
import { useQuery } from '@tanstack/react-query';
import { useServer } from './use-server';

export const useObservability = (): {
  data: Record<string, any>[];
  isPending: boolean;
  error: unknown;
  refetch: () => void;
} => {
  const setDisconnected = useConfigStore((state) => state.setDisconnected);
  const disconnected = useConfigStore((state) => state.disconnected);
  const { url: serverUrl, apiKey } = useServer();

  const { isPending, error, data, refetch } = useQuery({
    queryKey: ['observers'],
    queryFn: async (): Promise<Record<string, any>[]> => {
      try {
        const response = await timeout<Response>(
          3000,
          fetch(`${serverUrl}${ServerRoute.OBSERVERS}`, {
            headers: {
              'x-api-key': apiKey,
            },
          }),
        );

        const observers = (await response.json()) as Record<string, any>;
        return observers as Record<string, any>[];
      } catch {
        setDisconnected(true);
        return [];
      }
    },
    // TODO: use config
    refetchInterval: 1000,
    enabled: !disconnected,
  });

  return {
    data: data || [],
    isPending,
    error,
    refetch,
  };
};
