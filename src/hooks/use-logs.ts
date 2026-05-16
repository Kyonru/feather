import { readTextFileLines } from '@tauri-apps/plugin-fs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sendCommand } from '@/lib/send-command';
import { timeout } from '@/utils/timers';
import { useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';
import { z } from 'zod';
import { useSettingsStore } from '@/store/settings';
import { useEffect, useMemo, useRef, useState } from 'react';
import { sessionQueryKey } from './use-ws-connection';
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
  if (jsonStart === -1) return null;
  try {
    return JSON.parse(line.slice(jsonStart));
  } catch {
    return null;
  }
}

export const useLogs = (): {
  data: { logs: Log[]; screenshotEnabled: boolean };
  isPending: boolean;
  clear: () => void;
  onScreenshotChange: () => void;
} => {
  const queryClient = useQueryClient();
  const sessionId = useSessionStore((state) => state.sessionId);
  const overrideLogFile = useConfigStore((state) => state.overrideConfig?.outfile || '');
  const captureScreenshot = useConfigStore((state) => state.config?.captureScreenshot || false);
  const pausedLogs = useSettingsStore((state) => state.pausedLogs);
  const [screenshotEnabled, setScreenshotEnabled] = useState(false);
  const [clearTime, setClearTime] = useState(0);
  const lineOffsetRef = useRef<number>(0);

  useEffect(() => {
    setClearTime(0);
  }, [sessionId]);

  // --- Live session path: reactive subscription to query cache ---
  const queryKey = sessionId ? sessionQueryKey.logs(sessionId) : ['noop-logs'];

  const { data: liveLogs } = useQuery<Log[]>({
    queryKey,
    queryFn: () => [],
    enabled: false, // data is pushed via WS or file reader, not fetched
  });

  const filteredLiveLogs = useMemo(
    () => {
      const logs = liveLogs ?? [];
      return clearTime > 0 ? logs.filter((log) => log.time > clearTime) : logs;
    },
    [liveLogs, clearTime],
  );


  // --- Override file path: incremental file read (disk mode / manual open) ---
  // Reads the file and pushes parsed logs into the active session's query cache,
  // so the useSyncExternalStore live path picks them up naturally.
  const fileQueryKey = ['file-reader', overrideLogFile];

  /* eslint-disable @tanstack/query/exhaustive-deps */
  const { isPending } = useQuery({
    queryKey: fileQueryKey,
    queryFn: async (): Promise<null> => {
      if (!sessionId) return null;

      const existing = queryClient.getQueryData<Log[]>(queryKey) ?? [];
      if (existing.length === 0) lineOffsetRef.current = 0;

      const newLines: Log[] = [];
      const lines = await readTextFileLines(overrideLogFile);
      let lineIndex = 0;

      for await (const line of lines) {
        if (lineIndex < lineOffsetRef.current) {
          lineIndex++;
          continue;
        }
        lineIndex++;
        const log = parseLogLine(line);
        if (log) newLines.push(log);
      }

      lineOffsetRef.current = lineIndex;
      setScreenshotEnabled(captureScreenshot);

      if (newLines.length > 0) {
        queryClient.setQueryData<Log[]>(queryKey, [...existing, ...newLines]);
      }

      return null;
    },
    // Poll override file at 1s — game may still be writing to it (disk mode).
    // When paused, still do the initial read but stop polling.
    refetchInterval: pausedLogs ? false : 1000,
    enabled: !!overrideLogFile && !!sessionId,
  });
  /* eslint-enable @tanstack/query/exhaustive-deps */

  const logs = filteredLiveLogs;

  const toggleScreenshotsMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) return;
      setScreenshotEnabled((prev) => !prev);
      try {
        await timeout(
          3000,
          sendCommand(sessionId, { type: 'cmd:log', action: 'toggle-screenshots' }),
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to toggle screenshots');
      }
    },
  });

  const clear = () => {
    const lastNow = logs[logs.length - 1]?.time ?? 0;
    setClearTime(lastNow);
    if (sessionId) {
      queryClient.setQueryData(sessionQueryKey.logs(sessionId), []);
    }
    // Reset file reader offset so re-read starts fresh if override is active
    if (overrideLogFile) {
      lineOffsetRef.current = 0;
    }
  };

  return {
    data: { logs, screenshotEnabled },
    isPending: overrideLogFile ? isPending : false,
    clear,
    onScreenshotChange: () => toggleScreenshotsMutation.mutate(),
  };
};
