import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sendCommand } from '@/lib/send-command';
import { useSessionStore } from '@/store/session';
import { sessionQueryKey } from './use-ws-connection';

export type ProfilerRow = {
  name: string;
  group: string;
  calls: number;
  percent: number;
  callsPerSecond: number;
  totalTimeRaw: number;
  avgTimeRaw: number;
  minTimeRaw: number;
  maxTimeRaw: number;
  totalTime?: string;
  avgTime?: string;
  minTime?: string;
  maxTime?: string;
};

export type ProfilerSnapshot = {
  label?: string;
  capturedAt?: number;
  captureElapsed?: number;
  totalCapturedTime?: number;
  rows?: Record<string, Partial<ProfilerRow>>;
};

export type ProfilerState = {
  type: 'profiler';
  loading?: boolean;
  recording: boolean;
  captureStartedAt?: number;
  captureElapsed: number;
  totalCapturedTime: number;
  snapshots: ProfilerSnapshot[];
  data: ProfilerRow[];
};

export const EMPTY_PROFILER_STATE: ProfilerState = {
  type: 'profiler',
  loading: false,
  recording: false,
  captureElapsed: 0,
  totalCapturedTime: 0,
  snapshots: [],
  data: [],
};

type ProfilerAction = 'start' | 'stop' | 'reset' | 'snapshot' | 'refresh';

export function useProfiler() {
  const sessionId = useSessionStore((state) => state.sessionId);

  const { data } = useQuery<ProfilerState>({
    queryKey: sessionQueryKey.profiler(sessionId ?? ''),
    queryFn: () => EMPTY_PROFILER_STATE,
    enabled: false,
  });

  const onAction = useCallback(
    (action: ProfilerAction, params?: Record<string, unknown>) => {
      if (!sessionId) return Promise.resolve();
      return sendCommand(sessionId, {
        type: 'cmd:profiler',
        action,
        params: params ?? {},
      }).catch((error) => {
        toast.error(`Profiler action failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    },
    [sessionId],
  );

  return {
    data: data ?? EMPTY_PROFILER_STATE,
    onAction,
  };
}
