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
  samples?: ProfilerInvocationSample[];
};

export type ProfilerInvocationSample = {
  id: number;
  index: number;
  startedAt: number;
  endedAt: number;
  durationRaw: number;
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

/**
 * What a new session inherits from the run before it.
 *
 * Comparing before and after a change is the entire point of a profiler, and
 * making that change means restarting the game. The session migration carried
 * logs, metrics, observers and assets across but not this, so the one comparison
 * the feature exists for was the one it could not make.
 *
 * Only the snapshots travel. Live capture state belongs to the process that
 * produced it: `recording: true` in a fresh run shows a capture in progress that
 * nothing is filling, and a carried-over elapsed time silently attributes the old
 * run's duration to the new one. Both would be the tool lying about what it is
 * measuring, which is worse than losing the baseline.
 *
 * Returns null when there is nothing worth carrying, so the caller can skip the
 * write rather than replacing real state with an empty shell.
 *
 * See V4-ENHANCED.md §6.3.
 */
export function profilerStateForNewSession(previous: ProfilerState | undefined): ProfilerState | null {
  if (!previous?.snapshots?.length) return null;
  return { ...EMPTY_PROFILER_STATE, snapshots: previous.snapshots };
}

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
