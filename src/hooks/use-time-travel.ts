import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/store/session';
import { sessionQueryKey, type TimeTravelFrame, type TimeTravelStatus } from './use-ws-connection';

const DEFAULT_STATUS: TimeTravelStatus = {
  recording: false,
  frame_count: 0,
  buffer_size: 1000,
  first_frame_id: 0,
  last_frame_id: 0,
};

export const useTimeTravel = () => {
  const sessionId = useSessionStore((state) => state.sessionId);
  const queryClient = useQueryClient();

  const { data: status } = useQuery<TimeTravelStatus>({
    queryKey: sessionQueryKey.timeTravel(sessionId ?? ''),
    queryFn: () => DEFAULT_STATUS,
    enabled: !!sessionId,
    initialData: DEFAULT_STATUS,
  });

  const { data: frames, dataUpdatedAt: framesUpdatedAt } = useQuery<TimeTravelFrame[]>({
    queryKey: sessionQueryKey.timeTravelFrames(sessionId ?? ''),
    queryFn: () => [],
    enabled: false,
  });

  const startRecording = () => {
    if (!sessionId) return;
    // Optimistically clear stale frames from a previous session
    queryClient.setQueryData(sessionQueryKey.timeTravelFrames(sessionId), []);
    invoke('send_command', {
      sessionId,
      message: JSON.stringify({ type: 'cmd:time_travel:start' }),
    }).catch(() => {});
  };

  const stopRecording = () => {
    if (!sessionId) return;
    // Optimistically mark stopped — status messages only push while recording is active,
    // so without this the UI would stay stuck on isRecording=true after the command is sent.
    queryClient.setQueryData<TimeTravelStatus>(sessionQueryKey.timeTravel(sessionId), (prev) =>
      prev ? { ...prev, recording: false } : DEFAULT_STATUS,
    );
    invoke('send_command', {
      sessionId,
      message: JSON.stringify({ type: 'cmd:time_travel:stop' }),
    }).catch(() => {});
  };

  const requestFrames = (fromFrame?: number, toFrame?: number) => {
    if (!sessionId) return;
    invoke('send_command', {
      sessionId,
      message: JSON.stringify({
        type: 'cmd:time_travel:request_frames',
        data: { from_frame: fromFrame, to_frame: toFrame },
      }),
    }).catch(() => {});
  };

  return {
    status: status ?? DEFAULT_STATUS,
    frames: frames ?? [],
    framesUpdatedAt,
    startRecording,
    stopRecording,
    requestFrames,
  };
};
