import { readTextFileLines } from '@tauri-apps/plugin-fs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ServerRoute } from '@/constants/server';
import { timeout } from '@/utils/timers';
import { useConfigStore } from '@/store/config';
import { unionBy } from '@/utils/arrays';
import { z } from 'zod';
import { useServer } from './use-server';
import { useSettingsStore } from '@/store/settings';
import { useMemo, useState } from 'react';
import { useSampleRate } from './use-config';
import { isWeb } from '@/utils/platform';
import { toast } from 'sonner';

export enum LogType {
  OUTPUT = 'output',
  ERROR = 'error',
  FATAL = 'fatal',
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

function parseLogLine(line: string): Log | null {
  const jsonStart = line.indexOf('{');

  if (jsonStart === -1) {
    return null; // no JSON in this line
  }

  const jsonPart = line.slice(jsonStart);

  try {
    return JSON.parse(jsonPart);
  } catch (err) {
    console.error('Failed to parse log JSON:', err);
    return null;
  }
}

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
  const logFile = useConfigStore((state) => state.config?.outfile || '');
  const overrideLogFile = useConfigStore((state) => state.overrideConfig?.outfile || '');
  const pausedLogs = useSettingsStore((state) => state.pausedLogs);
  const { url: serverUrl, apiKey } = useServer();
  const [screenshotEnabled, setScreenshotEnabled] = useState(false);
  const sampleRate = useSampleRate();
  const [clearTime, setClearTime] = useState(0);

  const enabled = useMemo(() => {
    if (overrideLogFile) {
      return true;
    }

    return !pausedLogs;
  }, [pausedLogs, overrideLogFile]);

  const logFilePathname = overrideLogFile || logFile;
  const queryKey = [serverUrl, apiKey, 'logs', logFilePathname, clearTime];

  const { isPending, error, data, refetch } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: queryKey,
    queryFn: async (): Promise<Log[]> => {
      const dataLogs: Log[] = [];

      if (isWeb()) {
        const response = await fetch(logFilePathname);
        const raw = await response.text();
        const lines = raw.split('\n');
        for (const line of lines) {
          const log = parseLogLine(line);
          if (log) {
            dataLogs.push(log);
          }
        }
      } else {
        const lines = await readTextFileLines(logFilePathname);

        for await (const line of lines) {
          const log = parseLogLine(line);
          if (log) {
            dataLogs.push(log);
          }
        }
      }
      const existing = queryClient.getQueryData<Log[]>(queryKey) || [];

      const logs = unionBy<Log, string>(existing, dataLogs, (item) => item.id) as Log[];

      return logs.filter((log) => log.time > clearTime);
    },
    refetchInterval: sampleRate * 1000,
    enabled: enabled,
    placeholderData: (previousData) => previousData,
  });

  const enableScreenshotsMutation = useMutation({
    mutationFn: async () => {
      try {
        // Optimistic update
        setScreenshotEnabled((prev) => !prev);

        await timeout<Response>(
          3000,
          fetch(`${serverUrl}${ServerRoute.LOG}?action=toggle-screenshots`, {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
            },
          }),
        );

        return [];
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to toggle screenshots');
        return [];
      }
    },
    onSuccess: () => {},
  });

  const clear = () => {
    const lastNow = data?.[data.length - 1]?.time || 0;

    setClearTime(lastNow);
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
