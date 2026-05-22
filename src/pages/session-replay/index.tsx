import { useMemo, useRef, useState } from 'react';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  DownloadIcon,
  FolderOpenIcon,
  Loader2Icon,
  PlayIcon,
  RefreshCwIcon,
  SquareIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { open as openDialog, save } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile } from '@tauri-apps/plugin-fs';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  checkpointsFromRecording,
  useSessionReplay,
  type SessionReplayFile,
  type SessionReplayRecording,
} from '@/hooks/use-session-replay';
import { isWeb } from '@/utils/platform';

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0.0s';
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds - minutes * 60).toFixed(0)}s`;
}

function isResolved(recording: SessionReplayRecording | null) {
  return Boolean(
    recording?.files?.length && recording.files.every((file) => !String(file.content ?? '').startsWith('feather-binary:')),
  );
}

function archiveName(recording: SessionReplayRecording | null) {
  const id = typeof recording?.manifest?.id === 'string' ? recording.manifest.id : 'session-replay';
  return `${id}.featherreplay`;
}

function createArchive(recording: SessionReplayRecording) {
  const files: Record<string, Uint8Array> = {};
  for (const file of recording.files) {
    files[file.path] = strToU8(file.content ?? '');
  }
  return zipSync(files);
}

function filesFromArchive(bytes: Uint8Array): SessionReplayFile[] {
  const archive = unzipSync(bytes);
  return Object.entries(archive)
    .map(([path, data]) => ({ path, content: strFromU8(data), bytes: data.length }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

async function exportRecording(recording: SessionReplayRecording) {
  const bytes = createArchive(recording);
  const filename = archiveName(recording);

  if (isWeb()) {
    const blob = new Blob([bytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }

  const path = await save({
    defaultPath: filename,
    filters: [{ name: 'Feather Session Replay', extensions: ['featherreplay'] }],
  });
  if (path) await writeFile(path, bytes);
}

async function importArchiveFromDisk(): Promise<SessionReplayFile[] | null> {
  if (isWeb()) return null;
  const path = await openDialog({
    filters: [{ name: 'Feather Session Replay', extensions: ['featherreplay'] }],
    multiple: false,
  });
  if (!path || typeof path !== 'string') return null;
  const bytes = await readFile(path);
  return filesFromArchive(bytes);
}

export default function SessionReplayPage() {
  const {
    status,
    recording,
    replaySummaries,
    selectedReplayId,
    selectReplay,
    startRecording,
    stopRecording,
    requestRecording,
    requestReplayList,
    playRecording,
    seekRecording,
    stopReplay,
    importRecording,
    deleteRecording,
  } = useSessionReplay();
  const [loading, setLoading] = useState(false);
  const [expandedReplayId, setExpandedReplayId] = useState<string | null>(null);
  const [seekTime, setSeekTime] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resolved = isResolved(recording);
  const selectionLocked = status.recording || status.replaying;
  const loadedRecordingId = typeof recording?.manifest?.id === 'string' ? recording.manifest.id : null;
  const checkpoints = useMemo(() => checkpointsFromRecording(recording), [recording]);
  const canSeek = checkpoints.length > 0 && Boolean(selectedReplayId || status.replayId);

  const handleSelectReplay = (id: string) => {
    if (selectionLocked) return;
    if (expandedReplayId === id) {
      setExpandedReplayId(null);
      return;
    }
    selectReplay(id);
    requestRecording(id);
    setExpandedReplayId(id);
  };

  const handleStop = () => {
    setLoading(true);
    stopRecording();
    setTimeout(() => setLoading(false), 800);
  };

  const handleRefresh = () => {
    setLoading(true);
    requestReplayList();
    if (selectedReplayId && !selectionLocked) requestRecording(selectedReplayId);
    setTimeout(() => setLoading(false), 800);
  };

  const handleExport = () => {
    if (!recording || !resolved) return;
    exportRecording(recording)
      .then(() => toast.success('Session replay exported'))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Export failed'));
  };

  const handleImport = async () => {
    try {
      if (isWeb()) {
        fileInputRef.current?.click();
        return;
      }
      const files = await importArchiveFromDisk();
      if (files) {
        importRecording(files);
        toast.success('Session replay imported');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Import failed');
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      try {
        const bytes = new Uint8Array(readerEvent.target?.result as ArrayBuffer);
        importRecording(filesFromArchive(bytes));
        toast.success('Session replay imported');
      } catch {
        toast.error('Invalid session replay file');
      }
    };
    reader.readAsArrayBuffer(file);
    event.target.value = '';
  };

  const handleSeek = (play = false) => {
    const target = Number(seekTime);
    if (!Number.isFinite(target) || target < 0) return;
    seekRecording(target, play);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <input
        ref={fileInputRef}
        type="file"
        accept=".featherreplay"
        className="hidden"
        onChange={handleFileInput}
      />

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-6 py-2.5">
        {status.recording && !status.replaying ? (
          <Button size="sm" variant="destructive" onClick={handleStop} disabled={loading}>
            {loading ? <Loader2Icon className="size-3 animate-spin" /> : <SquareIcon className="size-3 fill-current" />}
            Stop & Load
          </Button>
        ) : (
          <Button size="sm" onClick={startRecording} disabled={status.replaying}>
            <CircleIcon className="size-3 fill-current" />
            Start Recording
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            if (status.replaying) stopReplay();
            else playRecording(selectedReplayId ?? status.replayId ?? undefined);
          }}
          disabled={status.recording || (!selectedReplayId && !status.replayId)}
        >
          {status.replaying ? <SquareIcon className="size-3" /> : <PlayIcon className="size-3" />}
          {status.replaying ? 'Stop Replay' : 'Replay'}
        </Button>
        <Button size="sm" variant="outline" onClick={handleRefresh} disabled={selectionLocked || loading}>
          {loading ? <Loader2Icon className="size-3 animate-spin" /> : <RefreshCwIcon className="size-3" />}
          Load
        </Button>
        <Button size="sm" variant="outline" onClick={handleExport} disabled={selectionLocked || !recording || !resolved}>
          <DownloadIcon className="size-3" />
          Export
        </Button>
        <Button size="sm" variant="outline" onClick={handleImport} disabled={selectionLocked}>
          <UploadIcon className="size-3" />
          Import
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => deleteRecording(selectedReplayId ?? status.replayId)}
          disabled={selectionLocked || (!selectedReplayId && !status.replayId)}
        >
          <Trash2Icon className="size-3" />
          Delete
        </Button>
      </div>

      <div className="grid shrink-0 gap-3 border-b px-6 py-4 sm:grid-cols-2 lg:grid-cols-7">
        <div>
          <p className="text-xs text-muted-foreground">Status</p>
          <Badge variant={status.replaying ? 'default' : status.recording ? 'destructive' : 'secondary'}>
            {status.replaying ? 'Replaying' : status.recording ? 'Recording' : 'Idle'}
          </Badge>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Duration</p>
          <p className="text-sm font-medium">{formatSeconds(status.duration)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Inputs</p>
          <p className="text-sm font-medium">{status.inputCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">State Events</p>
          <p className="text-sm font-medium">{status.stateCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Initial States</p>
          <p className="text-sm font-medium">{status.initialStateCount.toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Checkpoints</p>
          <p className="text-sm font-medium">{(status.checkpointCount ?? 0).toLocaleString()}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Streams</p>
          <p className="text-sm font-medium">{status.streamCount.toLocaleString()}</p>
        </div>
      </div>

      {status.missingRestorers.length > 0 && (
        <div className="border-b bg-yellow-500/10 px-6 py-3 text-sm">
          Missing restore handlers for {status.missingRestorers.join(', ')}. Add `DEBUGGER:replayRegister()` for
          deterministic playback.
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Replay Sessions</p>
            <p className="text-xs text-muted-foreground">
              {replaySummaries.length.toLocaleString()} replay{replaySummaries.length === 1 ? '' : 's'} available.
              Expand a replay to preview its files.
            </p>
          </div>
        </div>

        {selectionLocked && (
          <p className="text-xs text-muted-foreground">
            Replay selection is locked while {status.recording ? 'recording' : 'replaying'}.
          </p>
        )}

        {canSeek && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card/20 px-3 py-2">
            <span className="text-xs font-medium">Seek</span>
            <Input
              className="h-8 w-28"
              type="number"
              min="0"
              step="0.1"
              value={seekTime}
              onChange={(event) => setSeekTime(event.target.value)}
              placeholder="seconds"
              disabled={status.recording}
            />
            <Button size="sm" variant="outline" onClick={() => handleSeek(false)} disabled={status.recording || !seekTime}>
              Seek
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleSeek(true)} disabled={status.recording || !seekTime}>
              <PlayIcon className="size-3" />
              Play From
            </Button>
          </div>
        )}

        {replaySummaries.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <FolderOpenIcon className="size-8 text-muted-foreground" />
            <div>
              <p className="text-base font-semibold">No session replays yet</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Start a recording or import a `.featherreplay` file.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {replaySummaries.map((replay) => {
              const expanded = expandedReplayId === replay.id;
              const selected = selectedReplayId === replay.id;
              const loaded = loadedRecordingId === replay.id;
              const canPreviewFiles = expanded && selected && loaded && recording;
              return (
                <div
                  key={replay.id}
                  className={
                    expanded || selected
                      ? 'rounded-md border border-primary/40 bg-primary/15 text-card-foreground shadow-sm'
                      : 'rounded-md border bg-card/15 text-card-foreground'
                  }
                  data-state={selected ? 'selected' : undefined}
                >
                  <button
                    type="button"
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={() => handleSelectReplay(replay.id)}
                    disabled={selectionLocked}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {expanded ? <ChevronDownIcon className="size-4 shrink-0" /> : <ChevronRightIcon className="size-4 shrink-0" />}
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-xs">{replay.id}</span>
                        <span className="block text-xs text-muted-foreground">
                          {formatSeconds(replay.duration)} · {replay.inputCount.toLocaleString()} inputs ·{' '}
                          {(replay.initialStateCount ?? 0).toLocaleString()} initial ·{' '}
                          {replay.stateCount.toLocaleString()} state events ·{' '}
                          {(replay.checkpointCount ?? 0).toLocaleString()} checkpoints
                        </span>
                      </span>
                    </span>
                    <Badge variant={replay.status === 'recording' ? 'destructive' : 'secondary'}>
                      {replay.status ?? 'unknown'}
                    </Badge>
                  </button>

                  {expanded && (
                    <div className="border-t px-3 py-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-xs text-muted-foreground">
                          {canPreviewFiles
                            ? resolved
                              ? 'Replay files are ready to export or replay.'
                              : 'Waiting for binary replay chunks...'
                            : 'Loading replay files from the connected game...'}
                        </p>
                        <Badge variant={canPreviewFiles && resolved ? 'secondary' : 'outline'}>
                          {canPreviewFiles && resolved ? 'Ready' : 'Loading'}
                        </Badge>
                      </div>
                      <Separator className="mb-3" />
                      {canPreviewFiles ? (
                        <div className="space-y-3">
                          {checkpoints.length > 0 && (
                            <div className="space-y-2">
                              <p className="text-xs font-medium">Checkpoints</p>
                              <div className="grid gap-1">
                                {checkpoints.map((checkpoint) => (
                                  <div
                                    key={checkpoint.id}
                                    className="grid grid-cols-[1fr_auto] items-center gap-2 rounded border px-2 py-1.5"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-medium">{checkpoint.label || checkpoint.id}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {formatSeconds(checkpoint.time)} · {checkpoint.id} · {checkpoint.source ?? 'manual'} ·{' '}
                                        {(checkpoint.stateCount ?? 0).toLocaleString()} states
                                      </p>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => playRecording(replay.id, { seekTo: checkpoint.id })}
                                      disabled={status.recording}
                                    >
                                      <PlayIcon className="size-3" />
                                      Play From
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>File</TableHead>
                                <TableHead className="w-32 text-right">Size</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {recording.files.map((file) => (
                                <TableRow key={file.path}>
                                  <TableCell className="font-mono text-xs">{file.path}</TableCell>
                                  <TableCell className="text-right text-xs text-muted-foreground">
                                    {(file.bytes ?? file.content.length).toLocaleString()} bytes
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2Icon className="size-3 animate-spin" />
                          Loading replay content
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
