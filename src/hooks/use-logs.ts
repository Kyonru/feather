import { ServerRoute } from '@/constants/server';
import { timeout } from '@/utils/timers';
import { useConfigStore } from '@/store/config';
import { unionBy } from '@/utils/arrays';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { useServer } from './use-server';
import { useSettingsStore } from '@/store/settings';
import { useState } from 'react';

export enum LogType {
  OUTPUT = 'output',
  ERROR = 'error',
  FEATHER_START = 'feather:start',
  FEATHER_FINISH = 'feather:finish',
}

export const schema = z.object({
  id: z.string(),
  count: z.number(),
  time: z.number(),
  type: z.enum(Object.values(LogType)),
  str: z.string(),
  trace: z.string(),
  screenshot: z.string().optional(),
});

export type Log = z.infer<typeof schema>;

export const useLogs = (): {
  data: {
    logs: Log[];
    screenshotEnabled: boolean;
  };
  isPending: boolean;
  error: unknown;
  refetch: () => void;
  clear: () => void;
  onScreenshotChange: () => void;
} => {
  const queryClient = useQueryClient();
  const setDisconnected = useConfigStore((state) => state.setDisconnected);
  const disconnected = useConfigStore((state) => state.disconnected);
  const pausedLogs = useSettingsStore((state) => state.pausedLogs);
  const { url: serverUrl } = useServer();
  const [screenshotEnabled, setScreenshotEnabled] = useState(false);

  const { isPending, error, data, refetch } = useQuery({
    queryKey: ['logs'],
    queryFn: async (): Promise<Log[]> => {
      try {
        const response = await timeout<Response>(3000, fetch(`${serverUrl}${ServerRoute.LOG}`));

        const raw = await response.json();

        setScreenshotEnabled(raw.screenshotEnabled);
        const dataLogs = raw.data as Log[];

        const logs = unionBy<Log, string>(data || [], dataLogs, (item) => item.id) as Log[];
        return logs;
      } catch {
        setDisconnected(true);
        return (data || []) as Log[];
      }
    },
    // TODO: use config
    refetchInterval: 1000,
    enabled: !disconnected && !pausedLogs,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      try {
        await timeout<Response>(
          3000,
          fetch(`${serverUrl}${ServerRoute.LOG}?action=clear`, {
            method: 'POST',
          }),
        );

        return [];
      } catch {
        setDisconnected(true);
        return [];
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logs'] });
    },
  });

  const enableScreenshotsMutation = useMutation({
    mutationFn: async () => {
      try {
        await timeout<Response>(
          3000,
          fetch(`${serverUrl}${ServerRoute.LOG}?action=toggle-screenshots`, {
            method: 'POST',
          }),
        );

        return [];
      } catch {
        setDisconnected(true);
        return [];
      }
    },
    onSuccess: () => {},
  });

  const clear = () => {
    mutation.mutate();

    queryClient.cancelQueries({
      queryKey: ['logs'],
      exact: true,
    });

    queryClient.setQueryData(['logs'], []);
  };

  const onScreenshotChange = () => {
    enableScreenshotsMutation.mutate();
  };

  return {
    data: {
      logs: data || [],
      screenshotEnabled,
    },
    isPending,
    error,
    refetch,
    clear,
    onScreenshotChange,
  };
};
