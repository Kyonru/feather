import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sendCommand } from '@/lib/send-command';
import { useSessionStore } from '@/store/session';
import { sessionQueryKey } from './use-ws-connection';

export type SessionReplayStatus = {
  recording: boolean;
  replaying: boolean;
  replayId?: string | null;
  duration: number;
  inputCount: number;
  stateCount: number;
  initialStateCount: number;
  checkpointCount: number;
  streamCount: number;
  missingRestorers: string[];
};

export type SessionReplayFile = {
  path: string;
  content: string;
  bytes?: number;
  binary?: { id: string; mime: string };
};

export type SessionReplayRecording = {
  manifest?: Record<string, unknown>;
  files: SessionReplayFile[];
};

export type SessionReplayCheckpoint = {
  id: string;
  time: number;
  label?: string;
  source?: string;
  inputIndex?: number;
  stateIndex?: number;
  stateCount?: number;
};

export type SessionReplaySummary = {
  id: string;
  status?: string;
  startedAt?: string;
  updatedAt?: string;
  duration: number;
  inputCount: number;
  stateCount: number;
  initialStateCount?: number;
  keyframeCount?: number;
  checkpointCount?: number;
  streamCount: number;
};

export type SessionReplayRecordings = Record<string, SessionReplayRecording>;

const DEFAULT_STATUS: SessionReplayStatus = {
  recording: false,
  replaying: false,
  replayId: null,
  duration: 0,
  inputCount: 0,
  stateCount: 0,
  initialStateCount: 0,
  checkpointCount: 0,
  streamCount: 0,
  missingRestorers: [],
};

export function replayRecordingId(recording: SessionReplayRecording | null | undefined): string | null {
  return typeof recording?.manifest?.id === 'string' ? recording.manifest.id : null;
}

function recordingFromFiles(files: SessionReplayFile[]): SessionReplayRecording | null {
  const manifestFile = files.find((file) => file.path === 'manifest.json');
  if (!manifestFile) return null;
  try {
    const manifest = JSON.parse(manifestFile.content) as Record<string, unknown>;
    return { manifest, files };
  } catch {
    return null;
  }
}

export function checkpointsFromRecording(recording: SessionReplayRecording | null | undefined): SessionReplayCheckpoint[] {
  const manifestId = replayRecordingId(recording);
  if (!recording || !manifestId) return [];
  let initialStateCount: number | undefined;
  const initialContent = recording.files.find((file) => file.path === 'initial.json')?.content;
  if (initialContent) {
    try {
      const initialStates = JSON.parse(initialContent) as unknown;
      initialStateCount = Array.isArray(initialStates) ? initialStates.length : undefined;
    } catch {
      initialStateCount = undefined;
    }
  }
  const initial = {
    id: '0',
    time: 0,
    label: 'Start',
    source: 'initial',
    inputIndex: 1,
    stateIndex: 1,
    stateCount: initialStateCount,
  };
  const index = recording.files.find((file) => file.path === 'checkpoints.jsonl')?.content ?? '';
  const checkpoints: SessionReplayCheckpoint[] = [];
  for (const line of index.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const checkpoint = JSON.parse(trimmed) as Partial<SessionReplayCheckpoint>;
      if (checkpoint.id === undefined || checkpoint.id === null) continue;
      const id = String(checkpoint.id);
      checkpoints.push({
        ...checkpoint,
        id,
        label: checkpoint.label || id,
        time: Number(checkpoint.time ?? 0),
      });
    } catch {
      // Ignore malformed checkpoint lines so older/corrupt replays can still load.
    }
  }
  return [initial, ...checkpoints].sort((a, b) => (a.time ?? 0) - (b.time ?? 0));
}

export function useSessionReplay() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const queryClient = useQueryClient();

  const { data: status } = useQuery<SessionReplayStatus>({
    queryKey: sessionQueryKey.sessionReplay(sessionId ?? ''),
    queryFn: () => DEFAULT_STATUS,
    enabled: !!sessionId,
    initialData: DEFAULT_STATUS,
  });

  const { data: recording, dataUpdatedAt: recordingUpdatedAt } = useQuery<SessionReplayRecording | null>({
    queryKey: sessionQueryKey.sessionReplayRecording(sessionId ?? ''),
    queryFn: () => null,
    enabled: false,
    initialData: null,
  });

  const { data: recordings } = useQuery<SessionReplayRecordings>({
    queryKey: sessionQueryKey.sessionReplayRecordings(sessionId ?? ''),
    queryFn: () => ({}),
    enabled: !!sessionId,
    initialData: {},
  });

  const { data: replaySummaries } = useQuery<SessionReplaySummary[]>({
    queryKey: sessionQueryKey.sessionReplayList(sessionId ?? ''),
    queryFn: () => [],
    enabled: !!sessionId,
    initialData: [],
  });

  const { data: selectedReplayId } = useQuery<string | null>({
    queryKey: sessionQueryKey.sessionReplaySelected(sessionId ?? ''),
    queryFn: () => null,
    enabled: !!sessionId,
    initialData: null,
  });

  useEffect(() => {
    if (!sessionId) return;
    sendCommand(sessionId, { type: 'cmd:session_replay:list' }).catch(() => {});
  }, [sessionId]);

  const startRecording = () => {
    if (!sessionId) return;
    if (status?.recording) return;
    sendCommand(sessionId, { type: 'cmd:session_replay:start' }).catch(() => {});
  };

  const stopRecording = () => {
    if (!sessionId) return;
    queryClient.setQueryData<SessionReplayStatus>(sessionQueryKey.sessionReplay(sessionId), (prev) => ({
      ...(prev ?? DEFAULT_STATUS),
      recording: false,
    }));
    sendCommand(sessionId, { type: 'cmd:session_replay:stop' }).catch(() => {});
  };

  const requestRecording = (id?: string | null) => {
    if (!sessionId) return;
    if (status?.recording || status?.replaying) return;
    sendCommand(sessionId, { type: 'cmd:session_replay:request', data: id ? { id } : {} }).catch(() => {});
  };

  const requestReplayList = () => {
    if (!sessionId) return;
    sendCommand(sessionId, { type: 'cmd:session_replay:list' }).catch(() => {});
  };

  const selectReplay = (id: string | null) => {
    if (!sessionId) return;
    if (status?.recording || status?.replaying) return;
    queryClient.setQueryData(sessionQueryKey.sessionReplaySelected(sessionId), id);
    queryClient.setQueryData(sessionQueryKey.sessionReplayRecording(sessionId), id ? (recordings ?? {})[id] ?? null : null);
  };

  const playRecording = (id?: string, opts?: { seekTo?: string | number }) => {
    if (!sessionId) return;
    if (status?.recording) return;
    const replayId = id ?? selectedReplayId ?? status?.replayId ?? undefined;
    sendCommand(sessionId, { type: 'cmd:session_replay:play', data: { ...(replayId ? { id: replayId } : {}), ...opts } }).catch(
      () => {},
    );
  };

  const seekRecording = (target: string | number, play = false) => {
    if (!sessionId) return;
    if (status?.recording) return;
    sendCommand(sessionId, { type: 'cmd:session_replay:seek', data: { target, play } }).catch(() => {});
  };

  const stopReplay = () => {
    if (!sessionId) return;
    queryClient.setQueryData<SessionReplayStatus>(sessionQueryKey.sessionReplay(sessionId), (prev) => ({
      ...(prev ?? DEFAULT_STATUS),
      replaying: false,
    }));
    sendCommand(sessionId, { type: 'cmd:session_replay:stop_replay' }).catch(() => {});
  };

  const importRecording = (files: SessionReplayFile[]) => {
    if (!sessionId) return;
    const imported = recordingFromFiles(files);
    const id = replayRecordingId(imported);
    if (imported && id) {
      queryClient.setQueryData<SessionReplayRecordings>(sessionQueryKey.sessionReplayRecordings(sessionId), (prev) => ({
        ...(prev ?? {}),
        [id]: imported,
      }));
      queryClient.setQueryData(sessionQueryKey.sessionReplayRecording(sessionId), imported);
      queryClient.setQueryData(sessionQueryKey.sessionReplaySelected(sessionId), id);
    }
    sendCommand(sessionId, { type: 'cmd:session_replay:import', data: { files } }).catch(() => {});
  };

  const deleteRecording = (id?: string | null) => {
    if (!sessionId) return;
    const replayId = id ?? selectedReplayId ?? status?.replayId ?? null;
    sendCommand(sessionId, { type: 'cmd:session_replay:delete', data: replayId ? { id: replayId } : {} }).catch(() => {});
    if (replayId) {
      queryClient.setQueryData<SessionReplayRecordings>(sessionQueryKey.sessionReplayRecordings(sessionId), (prev) => {
        const next = { ...(prev ?? {}) };
        delete next[replayId];
        return next;
      });
      queryClient.setQueryData<SessionReplaySummary[]>(sessionQueryKey.sessionReplayList(sessionId), (prev) =>
        (prev ?? []).filter((item) => item.id !== replayId),
      );
    }
    queryClient.setQueryData(sessionQueryKey.sessionReplayRecording(sessionId), null);
    queryClient.setQueryData(sessionQueryKey.sessionReplaySelected(sessionId), null);
  };

  return {
    status: status ?? DEFAULT_STATUS,
    recording: recording ?? null,
    recordings: recordings ?? {},
    replaySummaries: replaySummaries ?? [],
    selectedReplayId: selectedReplayId ?? replayRecordingId(recording),
    selectReplay,
    recordingUpdatedAt,
    startRecording,
    stopRecording,
    requestRecording,
    requestReplayList,
    playRecording,
    seekRecording,
    stopReplay,
    importRecording,
    deleteRecording,
  };
}
