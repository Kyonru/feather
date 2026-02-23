/* eslint-disable @typescript-eslint/no-explicit-any */
import { ServerRoute } from '@/constants/server';
import { timeout } from '@/utils/timers';
import { useQuery } from '@tanstack/react-query';
import { useServer } from './use-server';
import { useSampleRate } from './use-config';

export const useObservability = (): {
  data: Record<string, any>[];
  isPending: boolean;
  error: unknown;
  refetch: () => void;
} => {
  const sampleRate = useSampleRate();
  const { url: serverUrl, apiKey } = useServer();
  const queryKey = [serverUrl, apiKey, 'observers'];

  const { isPending, error, data, refetch } = useQuery({
    queryKey: queryKey,
    queryFn: async (): Promise<Record<string, any>[]> => {
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
    },
    refetchInterval: sampleRate * 1000,
    placeholderData: (previousData) => previousData,
  });

  return {
    data: data || [],
    isPending,
    error,
    refetch,
  };
};
