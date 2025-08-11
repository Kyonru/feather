/* eslint-disable @typescript-eslint/no-explicit-any */
import { Server, ServerRoute } from '@/constants/server';
import { timeout } from '@/lib/utils';
import { useConfigStore } from '@/store/config';
import { useQuery } from '@tanstack/react-query';

export const useObservability = (): {
  data: Record<string, any>[];
  isPending: boolean;
  error: unknown;
  refetch: () => void;
} => {
  const setDisconnected = useConfigStore((state) => state.setDisconnected);
  const disconnected = useConfigStore((state) => state.disconnected);

  const { isPending, error, data, refetch } = useQuery({
    queryKey: ['observers'],
    queryFn: async (): Promise<Record<string, any>[]> => {
      try {
        const response = await timeout<Response>(3000, fetch(`${Server.LOCAL}${ServerRoute.OBSERVERS}`));

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
