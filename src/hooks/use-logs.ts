import { readTextFileLines } from '@tauri-apps/plugin-fs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { timeout } from '@/utils/timers';
import { useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';
import { z } from 'zod';
import { useSettingsStore } from '@/store/settings';
import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
  const emptyLogsRef = useRef<Log[]>([]);

  // --- Live session path: subscribe to query cache updates from useWsConnection ---
  // useSyncExternalStore ensures we re-render whenever setQueryData is called on this key.
  const queryKey = sessionId ? sessionQueryKey.logs(sessionId) : ['noop-logs'];
  const queryCache = queryClient.getQueryCache();
  const liveLogs = useSyncExternalStore(
    (onStoreChange) => {
      const unsubscribe = queryCache.subscribe((event) => {
        if (event.query.queryKey[0] === queryKey[0] && event.query.queryKey[1] === queryKey[1]) {
          onStoreChange();
        }
      });
      return unsubscribe;
    },
    () => queryClient.getQueryData<Log[]>(queryKey) ?? emptyLogsRef.current,
  );

  const filteredLiveLogs = useMemo(
    () => (clearTime > 0 ? liveLogs.filter((log) => log.time > clearTime) : liveLogs),
    [liveLogs, clearTime],
  );

  console.log({ liveLogs });

  // --- Override file path: incremental file read (disk mode / manual open) ---
  const fileQueryKey = ['file', overrideLogFile, clearTime];

  const { isPending, data: fileData } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: fileQueryKey,
    queryFn: async (): Promise<Log[]> => {
      const existing = queryClient.getQueryData<Log[]>(fileQueryKey) ?? [];
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

      const combined = [...existing, ...newLines];
      return combined.filter((log) => log.time > clearTime);
    },
    // Poll override file at 1s — game may still be writing to it (disk mode)
    refetchInterval: 1000,
    enabled: !!overrideLogFile && !pausedLogs,
    placeholderData: (prev) => prev,
  });

  const logs = overrideLogFile ? (fileData ?? []) : filteredLiveLogs;

  const toggleScreenshotsMutation = useMutation({
    mutationFn: async () => {
      if (!sessionId) return;
      setScreenshotEnabled((prev) => !prev);
      try {
        await timeout(
          3000,
          invoke('send_command', {
            sessionId,
            message: JSON.stringify({ type: 'cmd:log', action: 'toggle-screenshots' }),
          }),
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
  };

  return {
    data: { logs, screenshotEnabled },
    isPending: overrideLogFile ? isPending : false,
    clear,
    onScreenshotChange: () => toggleScreenshotsMutation.mutate(),
  };
};
