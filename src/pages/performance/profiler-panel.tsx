import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  CameraIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TriageEmptyState, TriageSearch, TriageSummaryChip } from '@/components/triage';
import { type ProfilerInvocationSample, type ProfilerRow, useProfiler } from '@/hooks/use-profiler';
import { downloadFile } from '@/utils/file';
import { cn } from '@/utils/styles';

type SortKey = 'percent' | 'totalTimeRaw' | 'avgTimeRaw' | 'maxTimeRaw' | 'calls' | 'callsPerSecond' | 'name';
type BaselineMode = 'ab' | 'previous' | 'first' | 'best' | 'median';

const RUN_STRIP_MIN_ZOOM = 0.25;
const RUN_STRIP_MAX_ZOOM = 5;
const RUN_STRIP_ZOOM_STEP = 0.25;

const sortLabels: Record<SortKey, string> = {
  percent: '% Total',
  totalTimeRaw: 'Total',
  avgTimeRaw: 'Average',
  maxTimeRaw: 'Max',
  calls: 'Calls',
  callsPerSecond: 'Calls/s',
  name: 'Name',
};

function numberValue(row: Partial<ProfilerRow> | undefined, key: string) {
  if (!row) return 0;
  const value = (row as Record<string, unknown>)[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function textValue(row: Partial<ProfilerRow> | undefined, key: string) {
  if (!row) return '';
  const value = (row as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : String(value ?? '');
}

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds === 0) return '0.0 ms';
  const sign = seconds < 0 ? '-' : '';
  const value = Math.abs(seconds);
  if (value >= 1) return `${sign}${value.toFixed(3)} s`;
  if (value >= 0.001) return `${sign}${(value * 1000).toFixed(3)} ms`;
  return `${sign}${(value * 1000000).toFixed(1)} us`;
}

function formatRatio(value: number) {
  if (!Number.isFinite(value)) return '-';
  return `${value.toFixed(value >= 10 ? 1 : 2)}x`;
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function sampleLabel(sample: ProfilerInvocationSample | undefined) {
  return sample ? `Run ${sample.index}` : '-';
}

function sampleById(samples: ProfilerInvocationSample[], id: number | null) {
  if (id == null) return undefined;
  return samples.find((sample) => sample.id === id);
}

function bestSample(samples: ProfilerInvocationSample[]) {
  return samples.reduce<ProfilerInvocationSample | undefined>((best, sample) => {
    if (!best || sample.durationRaw < best.durationRaw) return sample;
    return best;
  }, undefined);
}

function exportProfiler(rows: ProfilerRow[], metadata: Record<string, unknown>) {
  const payload = {
    exportedAt: new Date().toISOString(),
    metadata,
    rows,
  };
  const src = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
  void downloadFile(`feather-profiler-${Date.now()}.json`, src, 'string');
}

function ProfilerFilterField({
  label,
  htmlFor,
  className,
  children,
}: {
  label: string;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('grid min-w-0 content-start gap-1', className)}>
      <Label
        htmlFor={htmlFor}
        className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </Label>
      {children}
    </div>
  );
}

function ProfilerRunComparisonDrawer({
  row,
  baselineMode,
  selectedSampleAId,
  selectedSampleBId,
  onBaselineModeChange,
  onSampleClick,
  onOpenChange,
}: {
  row: ProfilerRow | undefined;
  baselineMode: BaselineMode;
  selectedSampleAId: number | null;
  selectedSampleBId: number | null;
  onBaselineModeChange: (mode: BaselineMode) => void;
  onSampleClick: (sample: ProfilerInvocationSample) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [runStripZoom, setRunStripZoom] = useState(1);
  const samples = row?.samples ?? [];
  const durations = samples.map((sample) => sample.durationRaw);
  const medianDuration = median(durations);
  const maxDuration = Math.max(...durations, 0);
  const minDuration = Math.min(...durations, Number.POSITIVE_INFINITY);
  const selectedA = sampleById(samples, selectedSampleAId);
  const selectedB = sampleById(samples, selectedSampleBId);
  const selectedRun = selectedB ?? selectedA ?? samples[samples.length - 1];
  const previousRun = selectedRun
    ? samples[Math.max(0, samples.findIndex((sample) => sample.id === selectedRun.id) - 1)]
    : undefined;
  const firstRun = samples[0];
  const fastestRun = bestSample(samples);
  const baseline =
    baselineMode === 'ab'
      ? selectedA
      : baselineMode === 'previous'
      ? previousRun
      : baselineMode === 'first'
      ? firstRun
      : baselineMode === 'best'
      ? fastestRun
      : medianDuration > 0
      ? ({
          id: -1,
          index: 0,
          startedAt: 0,
          endedAt: 0,
          durationRaw: medianDuration,
        } satisfies ProfilerInvocationSample)
      : undefined;
  const compared = baselineMode === 'ab' ? selectedB : selectedRun;
  const delta = baseline && compared ? compared.durationRaw - baseline.durationRaw : 0;
  const percentChange = baseline && compared && baseline.durationRaw > 0 ? (delta / baseline.durationRaw) * 100 : 0;
  const ratio = baseline && compared && baseline.durationRaw > 0 ? compared.durationRaw / baseline.durationRaw : Number.NaN;
  const speedLabel =
    baseline && compared && Number.isFinite(ratio)
      ? ratio >= 1
        ? `${formatRatio(ratio)} slower`
        : `${formatRatio(1 / ratio)} faster`
      : '-';
  const comparisonLabel =
    baselineMode === 'ab'
      ? `${sampleLabel(selectedA)} -> ${sampleLabel(selectedB)}`
      : baselineMode === 'median'
      ? `Median -> ${sampleLabel(selectedRun)}`
      : `${sampleLabel(baseline)} -> ${sampleLabel(selectedRun)}`;
  const runBarWidth = Math.round(12 + runStripZoom * 16);
  const runStripWidth = samples.length * (runBarWidth + 6) + 16;

  return (
    <Sheet open={Boolean(row)} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-[min(92vw,38rem)] gap-0 overflow-hidden p-0 sm:max-w-xl"
        data-testid="profiler-run-comparison-drawer"
      >
        <SheetHeader className="border-b pr-12">
          <SheetTitle className="truncate font-mono text-base">{row ? textValue(row, 'name') : 'Run Comparison'}</SheetTitle>
          <SheetDescription>
            Compare exact invocations from the current capture. Snapshots remain aggregate-only.
          </SheetDescription>
        </SheetHeader>
        {!row ? null : (
          <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <TriageSummaryChip label="Runs" value={(row.samples?.length ?? 0).toLocaleString()} />
              <TriageSummaryChip
                label="Min"
                value={Number.isFinite(minDuration) ? formatSeconds(minDuration) : formatSeconds(numberValue(row, 'minTimeRaw'))}
              />
              <TriageSummaryChip label="Median" value={formatSeconds(medianDuration)} />
              <TriageSummaryChip label="Max" value={formatSeconds(maxDuration || numberValue(row, 'maxTimeRaw'))} />
            </div>

            {samples.length === 0 ? (
              <TriageEmptyState
                title="Aggregate-only profiler row"
                description="This capture does not include exact invocation samples for this function yet."
                className="min-h-40"
              />
            ) : (
              <>
                <div className="grid min-w-0 gap-3 rounded-md border p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">Run Strip</h3>
                      <p className="text-xs text-muted-foreground">Click two runs to compare A and B.</p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <span className="inline-block size-2 rounded-full bg-primary" />
                        Normal
                        <span className="ml-2 inline-block size-2 rounded-full bg-amber-500" />
                        Slow
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-7"
                          title="Zoom out run strip"
                          aria-label="Zoom out run strip"
                          onClick={() =>
                            setRunStripZoom((value) =>
                              Math.max(RUN_STRIP_MIN_ZOOM, Number((value - RUN_STRIP_ZOOM_STEP).toFixed(2))),
                            )
                          }
                        >
                          <ZoomOutIcon className="size-3.5" />
                        </Button>
                        <input
                          type="range"
                          min={RUN_STRIP_MIN_ZOOM}
                          max={RUN_STRIP_MAX_ZOOM}
                          step={RUN_STRIP_ZOOM_STEP}
                          value={runStripZoom}
                          aria-label="Profiler run strip zoom"
                          className="h-7 w-24 accent-primary"
                          onChange={(event) => setRunStripZoom(Number(event.target.value))}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="size-7"
                          title="Zoom in run strip"
                          aria-label="Zoom in run strip"
                          onClick={() =>
                            setRunStripZoom((value) =>
                              Math.min(RUN_STRIP_MAX_ZOOM, Number((value + RUN_STRIP_ZOOM_STEP).toFixed(2))),
                            )
                          }
                        >
                          <ZoomInIcon className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div
                    className="max-w-full overflow-x-auto overscroll-x-contain rounded-md bg-muted/20"
                    data-testid="profiler-run-strip-scroll"
                  >
                    <div
                      className="flex h-36 items-end gap-1 border-b border-muted px-2 pb-2"
                      style={{ minWidth: '100%', width: runStripWidth }}
                    >
                      {samples.map((sample) => {
                        const isA = selectedSampleAId === sample.id;
                        const isB = selectedSampleBId === sample.id;
                        const height = maxDuration > 0 ? Math.max(8, (sample.durationRaw / maxDuration) * 104) : 8;
                        const slow = medianDuration > 0 && sample.durationRaw > medianDuration * 1.5;
                        return (
                          <button
                            key={sample.id}
                            type="button"
                            data-testid={`profiler-run-sample-${sample.index}`}
                            className="group flex shrink-0 flex-col items-center justify-end gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            title={`${sampleLabel(sample)}: ${formatSeconds(sample.durationRaw)}`}
                            style={{ width: runBarWidth }}
                            onClick={() => onSampleClick(sample)}
                          >
                            <span
                              className={cn(
                                'grid size-5 place-items-center rounded-full border text-[10px] font-semibold opacity-0 transition-opacity',
                                (isA || isB) && 'opacity-100',
                                isA && 'border-primary bg-primary text-primary-foreground',
                                isB && 'border-amber-500 bg-amber-500 text-white',
                              )}
                            >
                              {isA ? 'A' : isB ? 'B' : ''}
                            </span>
                            <span
                              className={cn(
                                'w-4 rounded-t-sm bg-primary/65 transition-colors group-hover:bg-primary',
                                slow && 'bg-amber-500/75 group-hover:bg-amber-500',
                                isA && 'bg-primary',
                                isB && 'bg-amber-500',
                              )}
                              style={{ height }}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 rounded-md border p-3" data-testid="profiler-run-comparison-summary">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">Comparison</h3>
                      <p className="text-xs text-muted-foreground">{comparisonLabel}</p>
                    </div>
                    <Select value={baselineMode} onValueChange={(value) => onBaselineModeChange(value as BaselineMode)}>
                      <SelectTrigger
                        size="sm"
                        aria-label="Profiler run baseline"
                        className="h-8 w-36 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ab">A / B</SelectItem>
                        <SelectItem value="previous">Previous</SelectItem>
                        <SelectItem value="first">First</SelectItem>
                        <SelectItem value="best">Best</SelectItem>
                        <SelectItem value="median">Median</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded-md bg-muted/40 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Baseline</div>
                      <div className="mt-1 font-mono text-sm">
                        {baselineMode === 'median' ? 'Median' : sampleLabel(baseline)}
                      </div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {baseline ? formatSeconds(baseline.durationRaw) : '-'}
                      </div>
                    </div>
                    <div className="rounded-md bg-muted/40 p-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Compared</div>
                      <div className="mt-1 font-mono text-sm">{sampleLabel(compared)}</div>
                      <div className="text-xs tabular-nums text-muted-foreground">
                        {compared ? formatSeconds(compared.durationRaw) : '-'}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3">
                    <Badge variant={delta >= 0 ? 'destructive' : 'secondary'} className="justify-start">
                      Delta {delta >= 0 ? '+' : ''}
                      {formatSeconds(delta)}
                    </Badge>
                    <Badge variant={percentChange >= 0 ? 'outline' : 'secondary'} className="justify-start">
                      {percentChange >= 0 ? '+' : ''}
                      {Number.isFinite(percentChange) ? percentChange.toFixed(1) : '0.0'}%
                    </Badge>
                    <Badge variant="outline" className="justify-start">
                      {speedLabel}
                    </Badge>
                  </div>

                  {compared ? (
                    <p className="text-xs text-muted-foreground">
                      {compared.durationRaw > medianDuration
                        ? `${sampleLabel(compared)} is ${formatSeconds(compared.durationRaw - medianDuration)} above median.`
                        : `${sampleLabel(compared)} is ${formatSeconds(medianDuration - compared.durationRaw)} below median.`}
                    </p>
                  ) : null}
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function ProfilerPanel() {
  const { data, onAction } = useProfiler();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('percent');
  const [minTotalMs, setMinTotalMs] = useState('');
  const [minAvgMs, setMinAvgMs] = useState('');
  const [hideOneCall, setHideOneCall] = useState(false);
  const [groupFilter, setGroupFilter] = useState('all');
  const [compareSnapshot, setCompareSnapshot] = useState('none');
  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>(null);
  const [baselineMode, setBaselineMode] = useState<BaselineMode>('ab');
  const [selectedSampleAId, setSelectedSampleAId] = useState<number | null>(null);
  const [selectedSampleBId, setSelectedSampleBId] = useState<number | null>(null);

  useEffect(() => {
    void onAction('refresh').catch(() => {});
  }, [onAction]);

  const tableData = data.data ?? [];
  const recording = data.recording === true;
  const captureElapsed = data.captureElapsed ?? 0;
  const totalCapturedTime = data.totalCapturedTime ?? 0;
  const snapshots = data.snapshots ?? [];
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.label === compareSnapshot);
  const hasRows = tableData.length > 0;
  const sampleCount = tableData.reduce((total, row) => total + numberValue(row, 'calls'), 0);
  const hottestRow = useMemo(
    () =>
      [...tableData].sort((a, b) => {
        const percentDiff = numberValue(b, 'percent') - numberValue(a, 'percent');
        return percentDiff === 0 ? numberValue(b, 'totalTimeRaw') - numberValue(a, 'totalTimeRaw') : percentDiff;
      })[0],
    [tableData],
  );
  const hotspots = useMemo(
    () =>
      [...tableData]
        .filter((row) => numberValue(row, 'percent') > 0 || numberValue(row, 'totalTimeRaw') > 0)
        .sort((a, b) => numberValue(b, 'percent') - numberValue(a, 'percent'))
        .slice(0, 5),
    [tableData],
  );
  const selectedRow = useMemo(() => {
    if (!selectedHotspot) return undefined;
    return tableData.find((row) => textValue(row, 'name') === selectedHotspot);
  }, [selectedHotspot, tableData]);

  const groups = useMemo(() => {
    return Array.from(new Set(tableData.map((row) => textValue(row, 'group')).filter(Boolean))).sort();
  }, [tableData]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const minTotalSeconds = Number(minTotalMs) / 1000;
    const minAvgSeconds = Number(minAvgMs) / 1000;

    return tableData
      .filter((row) => {
        if (needle && !textValue(row, 'name').toLowerCase().includes(needle)) return false;
        if (groupFilter !== 'all' && textValue(row, 'group') !== groupFilter) return false;
        if (hideOneCall && numberValue(row, 'calls') <= 1) return false;
        if (Number.isFinite(minTotalSeconds) && minTotalMs.trim() && numberValue(row, 'totalTimeRaw') < minTotalSeconds)
          return false;
        if (Number.isFinite(minAvgSeconds) && minAvgMs.trim() && numberValue(row, 'avgTimeRaw') < minAvgSeconds)
          return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return textValue(a, 'name').localeCompare(textValue(b, 'name'));
        return numberValue(b, sortBy) - numberValue(a, sortBy);
      });
  }, [tableData, search, minTotalMs, minAvgMs, sortBy, groupFilter, hideOneCall]);

  const captureButtonLabel = recording ? 'Finish Capture' : hasRows ? 'Record New Capture' : 'Record Capture';
  const openSnapshotDialog = () => {
    const nextLabel = `Capture ${snapshots.length + 1}`;
    setSnapshotLabel(nextLabel);
    setSnapshotDialogOpen(true);
  };
  const saveSnapshot = () => {
    const label = snapshotLabel.trim() || `Capture ${snapshots.length + 1}`;
    void onAction('snapshot', { label });
    setSnapshotDialogOpen(false);
  };
  const handleCaptureClick = async () => {
    if (recording) {
      await onAction('stop');
      return;
    }
    if (hasRows) {
      await onAction('reset');
    }
    await onAction('start');
  };
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setSelectedHotspot(null);
  };
  const openRunComparison = (row: ProfilerRow, focusSearch: boolean) => {
    const name = textValue(row, 'name');
    if (selectedHotspot !== name) {
      setSelectedSampleAId(null);
      setSelectedSampleBId(null);
      setBaselineMode('ab');
    }
    setSelectedHotspot(name);
    if (focusSearch) {
      setSearch(name);
    }
  };
  const handleSampleClick = (sample: ProfilerInvocationSample) => {
    setBaselineMode('ab');
    if (selectedSampleBId !== null) {
      setSelectedSampleAId(sample.id);
      setSelectedSampleBId(null);
      return;
    }
    if (selectedSampleAId === null || selectedSampleAId === sample.id) {
      setSelectedSampleAId(sample.id);
      return;
    }
    setSelectedSampleBId(sample.id);
  };

  useEffect(() => {
    const samples = selectedRow?.samples ?? [];
    if (samples.length === 0) {
      setSelectedSampleAId(null);
      setSelectedSampleBId(null);
      return;
    }

    const hasA = selectedSampleAId != null && samples.some((sample) => sample.id === selectedSampleAId);
    const hasB = selectedSampleBId != null && samples.some((sample) => sample.id === selectedSampleBId);
    if (selectedSampleAId === null && selectedSampleBId === null) {
      setSelectedSampleAId(samples[0].id);
      setSelectedSampleBId(samples.length > 1 ? samples[samples.length - 1].id : null);
      return;
    }
    if (!hasA) {
      setSelectedSampleAId(samples[0].id);
    }
    if (!hasB && selectedSampleBId !== null) {
      setSelectedSampleBId(null);
    }
  }, [selectedRow, selectedSampleAId, selectedSampleBId]);

  return (
    <div className="grid gap-4">
      <div className="rounded-md border bg-card p-4" data-testid="profiler-capture-workspace">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('size-2 rounded-full', recording ? 'bg-green-500' : 'bg-muted-foreground')} />
              <TriageSummaryChip label={recording ? 'Recording capture' : 'Capture stopped'} tone={recording ? 'good' : 'muted'} />
              <TriageSummaryChip label="Elapsed" value={`${captureElapsed.toFixed(1)}s`} />
              <TriageSummaryChip label="Samples" value={sampleCount.toLocaleString()} />
              <TriageSummaryChip label="Total" value={formatSeconds(totalCapturedTime)} />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold tracking-tight">Profiler Capture</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {hottestRow
                  ? `Hottest path: ${textValue(hottestRow, 'name')} at ${numberValue(hottestRow, 'percent').toFixed(1)}% of captured time.`
                  : 'Record a capture or trigger debugger profiler probes to collect instrumented samples.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Button size="sm" variant={recording ? 'secondary' : 'default'} onClick={() => void handleCaptureClick()}>
              {recording ? <PauseIcon className="size-4" /> : <PlayIcon className="size-4" />}
              {captureButtonLabel}
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onAction('refresh')}>
              <RefreshCwIcon className="size-4" />
              Refresh
            </Button>
            <Button size="sm" variant="outline" onClick={openSnapshotDialog} disabled={!hasRows}>
              <CameraIcon className="size-4" />
              Save Snapshot
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onAction('reset')} disabled={!hasRows && !recording}>
              <RotateCcwIcon className="size-4" />
              Reset
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                exportProfiler(filteredRows, {
                  recording,
                  captureElapsed,
                  totalCapturedTime,
                })
              }
              disabled={!filteredRows.length}
            >
              <DownloadIcon className="size-4" />
              Export JSON
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border p-3" data-testid="profiler-hotspots">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Hotspots</h3>
            <p className="text-xs text-muted-foreground">Top functions by captured time.</p>
          </div>
          {selectedHotspot ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedHotspot(null);
                setSearch('');
              }}
            >
              Clear focus
            </Button>
          ) : null}
        </div>
        {hotspots.length === 0 ? (
          <TriageEmptyState
            title="No hotspots yet"
            description="Record a capture, use debugger start/stop probes, or wrap a function to see hot paths."
            className="min-h-28"
          />
        ) : (
          <div className="grid gap-2">
            {hotspots.map((row) => {
              const name = textValue(row, 'name');
              const percent = Math.max(0, Math.min(100, numberValue(row, 'percent')));
              return (
                <button
                  key={name}
                  type="button"
                  data-testid={`profiler-hotspot-${name}`}
                  className={cn(
                    'grid gap-2 rounded-md border p-3 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    selectedHotspot === name && 'border-primary bg-primary/5',
                  )}
                  onClick={() => openRunComparison(row, true)}
                >
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-sm font-medium">{name}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{textValue(row, 'group')}</div>
                    </div>
                    <div className="flex flex-wrap justify-end gap-3 text-xs tabular-nums text-muted-foreground">
                      <span>{percent.toFixed(1)}%</span>
                      <span>{textValue(row, 'totalTime') || formatSeconds(numberValue(row, 'totalTimeRaw'))}</span>
                      <span>{textValue(row, 'avgTime') || formatSeconds(numberValue(row, 'avgTimeRaw'))} avg</span>
                      <span>{numberValue(row, 'calls').toLocaleString()} calls</span>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div
        className="grid gap-2 rounded-md border p-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[minmax(18rem,1.8fr)_repeat(3,minmax(8rem,1fr))_repeat(3,minmax(7rem,0.8fr))]"
        id="filters-container-row"
      >
        <ProfilerFilterField label="Function" className="md:col-span-2 lg:col-span-4 xl:col-span-1">
          <TriageSearch value={search} onChange={handleSearchChange} placeholder="Search functions..." className="min-w-0" />
        </ProfilerFilterField>
        <ProfilerFilterField label="Group" htmlFor="profiler-group-filter">
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger
              id="profiler-group-filter"
              size="sm"
              aria-label="Profiler group filter"
              className="w-full min-w-0 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group} value={group}>
                  {group}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ProfilerFilterField>
        <ProfilerFilterField label="Sort" htmlFor="profiler-sort">
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortKey)}>
            <SelectTrigger
              id="profiler-sort"
              size="sm"
              aria-label="Profiler sort"
              className="w-full min-w-0 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(sortLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ProfilerFilterField>
        <ProfilerFilterField label="Diff" htmlFor="profiler-diff-snapshot">
          <Select value={compareSnapshot} onValueChange={setCompareSnapshot}>
            <SelectTrigger
              id="profiler-diff-snapshot"
              size="sm"
              aria-label="Profiler diff snapshot"
              className="w-full min-w-0 text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No diff</SelectItem>
              {snapshots.map((snapshot) => (
                <SelectItem key={snapshot.label ?? 'snapshot'} value={snapshot.label ?? 'snapshot'}>
                  Compare {snapshot.label ?? 'Snapshot'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </ProfilerFilterField>
        <ProfilerFilterField label="Min total" htmlFor="profiler-min-total">
          <Input
            id="profiler-min-total"
            inputMode="decimal"
            value={minTotalMs}
            onChange={(event) => setMinTotalMs(event.target.value)}
            className="h-8 text-xs"
          />
        </ProfilerFilterField>
        <ProfilerFilterField label="Min avg" htmlFor="profiler-min-avg">
          <Input
            id="profiler-min-avg"
            inputMode="decimal"
            value={minAvgMs}
            onChange={(event) => setMinAvgMs(event.target.value)}
            className="h-8 text-xs"
          />
        </ProfilerFilterField>
        <ProfilerFilterField label="Call filter">
          <label
            data-testid="profiler-hide-one-call-control"
            className="flex h-8 min-w-0 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-xs text-muted-foreground shadow-xs dark:bg-input/30"
          >
            <Checkbox
              id="profiler-hide-one-call"
              checked={hideOneCall}
              onCheckedChange={(checked) => setHideOneCall(checked === true)}
            />
            <span className="truncate">Hide one-call entries</span>
          </label>
        </ProfilerFilterField>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Function</TableHead>
              <TableHead>Group</TableHead>
              <TableHead className="text-right">% Total</TableHead>
              <TableHead className="text-right">Calls/s</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">Total</TableHead>
              {selectedSnapshot ? <TableHead className="text-right">Δ Total</TableHead> : null}
              {selectedSnapshot ? <TableHead className="text-right">Δ Calls</TableHead> : null}
              <TableHead className="text-right">Avg</TableHead>
              <TableHead className="text-right">Min</TableHead>
              <TableHead className="text-right">Max</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={selectedSnapshot ? 11 : 9} className="p-4">
                  <TriageEmptyState
                    title="No profiler samples collected yet"
                    description="Start recording and instrument code with DEBUGGER.profiler to collect samples."
                    className="min-h-32"
                  />
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => {
                const previous = selectedSnapshot?.rows?.[textValue(row, 'name')];
                const deltaTotal =
                  numberValue(row, 'totalTimeRaw') - (previous ? numberValue(previous, 'totalTimeRaw') : 0);
                const deltaCalls = numberValue(row, 'calls') - (previous ? numberValue(previous, 'calls') : 0);

                return (
                  <TableRow
                    key={textValue(row, 'name')}
                    data-testid={`profiler-row-${textValue(row, 'name')}`}
                    className={cn('cursor-pointer', selectedHotspot === textValue(row, 'name') && 'bg-muted/70')}
                    onClick={() => openRunComparison(row, false)}
                  >
                    <TableCell className="font-mono">{textValue(row, 'name')}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{textValue(row, 'group')}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-muted sm:block">
                          <div
                            className="h-full rounded-full bg-primary/70"
                            style={{ width: `${Math.max(0, Math.min(100, numberValue(row, 'percent')))}%` }}
                          />
                        </div>
                        <span>{numberValue(row, 'percent').toFixed(1)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {numberValue(row, 'callsPerSecond').toFixed(1)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {numberValue(row, 'calls').toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {textValue(row, 'totalTime') || formatSeconds(numberValue(row, 'totalTimeRaw'))}
                    </TableCell>
                    {selectedSnapshot ? (
                      <TableCell className="text-right tabular-nums">
                        {deltaTotal >= 0 ? '+' : ''}
                        {formatSeconds(deltaTotal)}
                      </TableCell>
                    ) : null}
                    {selectedSnapshot ? (
                      <TableCell className="text-right tabular-nums">
                        {deltaCalls >= 0 ? '+' : ''}
                        {deltaCalls.toLocaleString()}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-right tabular-nums">
                      {textValue(row, 'avgTime') || formatSeconds(numberValue(row, 'avgTimeRaw'))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {textValue(row, 'minTime') || formatSeconds(numberValue(row, 'minTimeRaw'))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {textValue(row, 'maxTime') || formatSeconds(numberValue(row, 'maxTimeRaw'))}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <ProfilerRunComparisonDrawer
        row={selectedRow}
        baselineMode={baselineMode}
        selectedSampleAId={selectedSampleAId}
        selectedSampleBId={selectedSampleBId}
        onBaselineModeChange={setBaselineMode}
        onSampleClick={handleSampleClick}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedHotspot(null);
          }
        }}
      />

      <Dialog open={snapshotDialogOpen} onOpenChange={setSnapshotDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Profiler Snapshot</DialogTitle>
            <DialogDescription>
              Name this capture point so you can compare future profiler results against it.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="profiler-snapshot-label">Snapshot label</Label>
            <Input
              id="profiler-snapshot-label"
              value={snapshotLabel}
              onChange={(event) => setSnapshotLabel(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  saveSnapshot();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSnapshotDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveSnapshot}>Save Snapshot</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
