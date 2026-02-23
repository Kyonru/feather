import { readTextFileLines } from '@tauri-apps/plugin-fs';
import { useMutation, useQuery } from '@tanstack/react-query';
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
  const setDisconnected = useConfigStore((state) => state.setDisconnected);
  const disconnected = useConfigStore((state) => state.disconnected);
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

    return !disconnected && !pausedLogs;
  }, [disconnected, pausedLogs, overrideLogFile]);

  const logFilePathname = overrideLogFile || logFile;

  const { isPending, error, data, refetch } = useQuery({
    queryKey: ['logs', logFilePathname, clearTime],
    queryFn: async (): Promise<Log[]> => {
      try {
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

        console.log({ dataLogs });

        const logs = unionBy<Log, string>(data || [], dataLogs, (item) => item.id) as Log[];

        return logs.filter((log) => log.time > clearTime);
      } catch (e) {
        console.log('error', e);
        setDisconnected(true);
        return (data || []) as Log[];
      }
    },
    refetchInterval: sampleRate * 1000,
    enabled: enabled,
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
      } catch {
        setDisconnected(true);
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
