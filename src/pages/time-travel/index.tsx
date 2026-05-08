import { useState, useEffect, useRef } from 'react';
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleIcon,
  DownloadIcon,
  FolderOpenIcon,
  Loader2Icon,
  RefreshCwIcon,
  SquareIcon,
  XIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/utils/styles';
import { useTimeTravel } from '@/hooks/use-time-travel';
import type { TimeTravelFrame } from '@/hooks/use-ws-connection';
import { isWeb } from '@/utils/platform';
import { save, open as openDialog } from '@tauri-apps/plugin-dialog';
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';
import { useSessionStore } from '@/store/session';

const FILE_VERSION = 1;

interface FeathertravelFile {
  version: number;
  exportedAt: string;
  frameCount: number;
  frames: TimeTravelFrame[];
}

async function exportFrames(frames: TimeTravelFrame[], filename = 'recording.feathertravel') {
  const payload: FeathertravelFile = {
    version: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    frameCount: frames.length,
    frames,
  };
  const json = JSON.stringify(payload, null, 2);

  if (isWeb()) {
    const blob = new Blob([json], { type: 'application/json' });
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
    filters: [{ name: 'Feather Time Travel', extensions: ['feathertravel'] }],
  });
  if (path) await writeTextFile(path, json);
}

async function importFrames(): Promise<TimeTravelFrame[] | null> {
  if (isWeb()) return null; // handled via <input type="file"> instead

  const path = await openDialog({
    filters: [{ name: 'Feather Time Travel', extensions: ['feathertravel'] }],
    multiple: false,
  });
  if (!path || typeof path !== 'string') return null;

  const raw = await readTextFile(path);
  const parsed: FeathertravelFile = JSON.parse(raw);
  if (parsed.version !== FILE_VERSION || !Array.isArray(parsed.frames)) throw new Error('Unsupported file format');
  return parsed.frames;
}

type DiffKind = 'changed' | 'added' | 'removed' | 'same';

type DiffEntry = {
  key: string;
  kind: DiffKind;
  from?: string;
  to: string;
};

function diffObservers(prev: Record<string, string> | undefined, curr: Record<string, string>): DiffEntry[] {
  if (!prev) return Object.entries(curr).map(([key, to]) => ({ key, kind: 'same', to }));

  const allKeys = new Set([...Object.keys(prev), ...Object.keys(curr)]);
  const entries: DiffEntry[] = [];

  for (const key of allKeys) {
    const fromVal = prev[key];
    const toVal = curr[key];
    if (fromVal === undefined) {
      entries.push({ key, kind: 'added', to: toVal });
    } else if (toVal === undefined) {
      entries.push({ key, kind: 'removed', from: fromVal, to: fromVal });
    } else if (fromVal !== toVal) {
      entries.push({ key, kind: 'changed', from: fromVal, to: toVal });
    } else {
      entries.push({ key, kind: 'same', to: toVal });
    }
  }

  return entries.sort((a, b) => {
    const order: Record<DiffKind, number> = { changed: 0, added: 1, removed: 2, same: 3 };
    return order[a.kind] - order[b.kind];
  });
}

function EmptyState({ onStart, loading, disabled }: { onStart: () => void; loading: boolean; disabled?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="grid gap-1">
        <p className="text-lg font-semibold">No recording yet</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Record observer snapshots frame-by-frame, then scrub backwards through time to find exactly where things
          break.
        </p>
      </div>
      <Button onClick={onStart} disabled={loading || disabled}>
        {loading ? <Loader2Icon className="size-3 animate-spin" /> : <CircleIcon className="size-3 fill-current" />}
        {loading ? 'Starting…' : 'Start Recording'}
      </Button>
    </div>
  );
}

function RecordingState({ frameCount, bufferSize }: { frameCount: number; bufferSize: number }) {
  const pct = bufferSize > 0 ? Math.round((frameCount / bufferSize) * 100) : 0;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div className="flex items-center gap-2">
        <span className="inline-block size-3 animate-pulse rounded-full bg-red-500" />
        <span className="text-sm font-medium">Recording…</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {frameCount.toLocaleString()} / {bufferSize.toLocaleString()} frames ({pct}%)
      </p>
      <div className="h-1.5 w-64 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-red-500 transition-all duration-500"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

function FrameSnapshot({ current, prev }: { current: TimeTravelFrame; prev: TimeTravelFrame | undefined }) {
  const entries = diffObservers(prev?.observers, current.observers);
  const changedCount = entries.filter((e) => e.kind !== 'same').length;

  if (entries.length === 0) {
    return (
      <p className="px-1 text-xs italic text-muted-foreground">
        No observer values. Call <code>DEBUGGER:observe()</code> to track values.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {prev && changedCount > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {changedCount} value{changedCount !== 1 ? 's' : ''} changed vs previous frame
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-1/3">Key</TableHead>
            <TableHead>Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map(({ key, kind, from, to }) => (
            <TableRow
              key={key}
              className={cn({
                'bg-yellow-500/10 dark:bg-yellow-400/10': kind === 'changed',
                'bg-green-500/10 dark:bg-green-400/10': kind === 'added',
                'bg-red-500/10 dark:bg-red-400/10': kind === 'removed',
              })}
            >
              <TableCell className="py-1.5 font-mono text-xs">
                <span className="flex items-center gap-1.5">
                  {kind !== 'same' && (
                    <span
                      className={cn('size-1.5 shrink-0 rounded-full', {
                        'bg-yellow-500': kind === 'changed',
                        'bg-green-500': kind === 'added',
                        'bg-red-500': kind === 'removed',
                      })}
                    />
                  )}
                  {key}
                </span>
              </TableCell>
              <TableCell className="py-1.5 font-mono text-xs">
                {kind === 'changed' ? (
                  <span className="flex flex-wrap items-center gap-1">
                    <span className="text-muted-foreground line-through">{from}</span>
                    <ArrowRightIcon className="size-3 shrink-0 text-muted-foreground" />
                    <span>{to}</span>
                  </span>
                ) : (
                  <span className={cn({ 'text-muted-foreground': kind === 'same' })}>{to}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function TimeTravelPage() {
  const { status, frames, framesUpdatedAt, startRecording, stopRecording, requestFrames } = useTimeTravel();
  const sessionId = useSessionStore((state) => state.sessionId);
  const [scrubIndex, setScrubIndex] = useState(0);
  const [starting, setStarting] = useState(false);
  const [loadingFrames, setLoadingFrames] = useState(false);
  const [offlineFrames, setOfflineFrames] = useState<TimeTravelFrame[] | null>(null);
  const [offlineError, setOfflineError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Frames to display: offline file takes precedence over live frames
  const displayFrames = offlineFrames ?? frames;
  const isOffline = offlineFrames !== null;

  // Clear 'starting' once Lua confirms recording has begun
  useEffect(() => {
    if (starting && status.recording) setStarting(false);
  }, [starting, status.recording]);

  // Clear 'loadingFrames' when React Query registers a new frames payload from Lua.
  // dataUpdatedAt is a timestamp that increments on every setQueryData call — more
  // reliable than reference comparison since ?? [] creates a new array each render.
  const requestedAtRef = useRef(0);
  useEffect(() => {
    if (loadingFrames && framesUpdatedAt > requestedAtRef.current) setLoadingFrames(false);
  }, [loadingFrames, framesUpdatedAt]);

  const isRecording = status.recording;
  const hasFrames = displayFrames.length > 0;
  const clampedIndex = Math.min(scrubIndex, Math.max(0, displayFrames.length - 1));
  const currentFrame = hasFrames ? displayFrames[clampedIndex] : null;
  const prevFrame = clampedIndex > 0 ? displayFrames[clampedIndex - 1] : undefined;

  const handleStart = () => {
    setStarting(true);
    startRecording();
  };

  const handleStopAndFetch = () => {
    requestedAtRef.current = Date.now();
    setLoadingFrames(true);
    stopRecording();
    setTimeout(() => requestFrames(), 200);
  };

  const handleRefresh = () => {
    requestedAtRef.current = Date.now();
    setLoadingFrames(true);
    requestFrames();
  };

  const handleExport = () => {
    exportFrames(displayFrames).catch(console.error);
  };

  const handleImport = async () => {
    try {
      setOfflineError(null);
      if (isWeb()) {
        fileInputRef.current?.click();
        return;
      }
      const loaded = await importFrames();
      if (loaded) {
        setOfflineFrames(loaded);
        setScrubIndex(loaded.length - 1);
      }
    } catch (e) {
      setOfflineError(String(e));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed: FeathertravelFile = JSON.parse(ev.target?.result as string);
        setOfflineFrames(parsed.frames);
        setScrubIndex(parsed.frames.length - 1);
      } catch {
        setOfflineError('Invalid file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex h-full flex-col">
      <input ref={fileInputRef} type="file" accept=".feathertravel" className="hidden" onChange={handleFileInput} />

      <div className="flex shrink-0 items-center gap-2 border-b px-6 py-2.5">
        {!isOffline &&
          (isRecording ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleStopAndFetch}
              disabled={loadingFrames}
              className="gap-1.5"
            >
              {loadingFrames ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <SquareIcon className="size-3 fill-current" />
              )}
              {loadingFrames ? 'Loading…' : 'Stop & Load'}
            </Button>
          ) : (
            <Button size="sm" onClick={handleStart} disabled={starting || !sessionId} className="gap-1.5">
              {starting ? (
                <Loader2Icon className="size-3 animate-spin" />
              ) : (
                <CircleIcon className="size-3 fill-current" />
              )}
              {starting ? 'Starting…' : 'Start Recording'}
            </Button>
          ))}

        {!isOffline && !isRecording && hasFrames && (
          <>
            <Separator orientation="vertical" className="h-5" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              onClick={handleRefresh}
              disabled={loadingFrames}
              title="Re-fetch all frames from game"
            >
              <RefreshCwIcon className={cn('size-3', { 'animate-spin': loadingFrames })} />
              {loadingFrames ? 'Loading…' : 'Refresh'}
            </Button>
          </>
        )}

        {hasFrames && !isRecording && (
          <>
            <Separator orientation="vertical" className="h-5" />
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs"
              onClick={handleExport}
              title="Export to .feathertravel file"
            >
              <DownloadIcon className="size-3" /> Export
            </Button>
          </>
        )}

        <Separator orientation="vertical" className="h-5" />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-2 text-xs"
          onClick={handleImport}
          title="Open a .feathertravel file"
        >
          <FolderOpenIcon className="size-3" /> Open file
        </Button>

        {isOffline && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 px-2 text-xs text-muted-foreground"
            onClick={() => setOfflineFrames(null)}
            title="Close file and return to live mode"
          >
            <XIcon className="size-3" /> Close file
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          {offlineError && (
            <span className="flex items-center gap-1 text-destructive" title={offlineError}>
              Failed to open file
              <button className="underline" onClick={() => setOfflineError(null)}>
                dismiss
              </button>
            </span>
          )}
          {isOffline && <Badge variant="secondary">Offline</Badge>}
          {!isOffline && isRecording && (
            <Badge variant="destructive" className="gap-1">
              <span className="size-1.5 animate-pulse rounded-full bg-white" /> REC
            </Badge>
          )}
          {hasFrames && !isRecording && !loadingFrames && <span>{displayFrames.length.toLocaleString()} frames</span>}
          {loadingFrames && (
            <span className="flex items-center gap-1">
              <Loader2Icon className="size-3 animate-spin" /> Fetching…
            </span>
          )}
        </div>
      </div>

      {!isOffline && !isRecording && !hasFrames && !loadingFrames && (
        <EmptyState onStart={handleStart} loading={starting} disabled={!sessionId} />
      )}
      {!isOffline && !isRecording && !hasFrames && loadingFrames && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Fetching frames from game…</p>
        </div>
      )}
      {!isOffline && isRecording && <RecordingState frameCount={status.frame_count} bufferSize={status.buffer_size} />}

      {hasFrames && (
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-6 py-4">
          <div className="space-y-1.5">
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Frame {displayFrames[0]?.id}</span>
              <span className="font-medium text-foreground">
                Frame #{currentFrame?.id}&nbsp;·&nbsp;t={currentFrame?.time.toFixed(3)}s&nbsp;·&nbsp;dt=
                {(currentFrame ? currentFrame.dt * 1000 : 0).toFixed(1)}ms
              </span>
              <span>Frame {displayFrames[displayFrames.length - 1]?.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 shrink-0 p-0"
                disabled={clampedIndex === 0}
                onClick={() => setScrubIndex((i) => Math.max(0, i - 1))}
              >
                <ChevronLeftIcon className="size-3" />
              </Button>
              <input
                type="range"
                min={0}
                max={frames.length - 1}
                value={clampedIndex}
                onChange={(e) => setScrubIndex(Number(e.target.value))}
                className="w-full cursor-pointer accent-primary"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-7 shrink-0 p-0"
                disabled={clampedIndex === frames.length - 1}
                onClick={() => setScrubIndex((i) => Math.min(frames.length - 1, i + 1))}
              >
                <ChevronRightIcon className="size-3" />
              </Button>
            </div>
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>oldest</span>
              <span>
                {clampedIndex + 1} / {frames.length}
              </span>
              <span>newest</span>
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">Observer Snapshot</p>
            {currentFrame && <FrameSnapshot current={currentFrame} prev={prevFrame} />}
          </div>
        </div>
      )}
    </div>
  );
}
