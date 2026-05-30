import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { CameraIcon, DownloadIcon, PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TriageEmptyState, TriageSearch, TriageSummaryChip, TriageToolbar } from '@/components/triage';
import { type ProfilerRow, useProfiler } from '@/hooks/use-profiler';
import { downloadFile } from '@/utils/file';
import { cn } from '@/utils/styles';

type SortKey = 'percent' | 'totalTimeRaw' | 'avgTimeRaw' | 'maxTimeRaw' | 'calls' | 'callsPerSecond' | 'name';

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

export function ProfilerPanel() {
  const { data, onAction } = useProfiler();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('percent');
  const [minTotalMs, setMinTotalMs] = useState('');
  const [minAvgMs, setMinAvgMs] = useState('');
  const [hideOneCall, setHideOneCall] = useState(false);
  const [groupFilter, setGroupFilter] = useState('all');
  const [compareSnapshot, setCompareSnapshot] = useState('none');

  useEffect(() => {
    void onAction('refresh').catch(() => {});
  }, [onAction]);

  const tableData = data.data ?? [];
  const recording = data.recording === true;
  const captureElapsed = data.captureElapsed ?? 0;
  const totalCapturedTime = data.totalCapturedTime ?? 0;
  const snapshots = data.snapshots ?? [];
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.label === compareSnapshot);

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

  return (
    <div className="grid gap-4">
      <TriageToolbar
        className="rounded-md border"
        actions={
          <>
            <Button size="sm" variant={recording ? 'secondary' : 'default'} onClick={() => void onAction('start')}>
              <PlayIcon className="size-4" />
              Start
            </Button>
            <Button size="sm" variant={!recording ? 'secondary' : 'outline'} onClick={() => void onAction('stop')}>
              <PauseIcon className="size-4" />
              Stop
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onAction('reset')}>
              <RotateCcwIcon className="size-4" />
              Reset
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onAction('snapshot', { label: 'Before' })}>
              <CameraIcon className="size-4" />
              Before
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onAction('snapshot', { label: 'After' })}>
              <CameraIcon className="size-4" />
              After
            </Button>
            <Button size="sm" variant="outline" onClick={() => void onAction('snapshot', { label: 'Last capture' })}>
              <CameraIcon className="size-4" />
              Snapshot
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
            >
              <DownloadIcon className="size-4" />
              Export JSON
            </Button>
          </>
        }
        summary={
          <>
            <span className={cn('size-2 rounded-full', recording ? 'bg-green-500' : 'bg-muted-foreground')} />
            <TriageSummaryChip label={recording ? 'Recording' : 'Stopped'} tone={recording ? 'good' : 'muted'} />
            <TriageSummaryChip label="Capture" value={`${captureElapsed.toFixed(1)}s`} />
            <TriageSummaryChip label="Total" value={formatSeconds(totalCapturedTime)} />
          </>
        }
      />

      <div
        className="grid gap-2 rounded-md border p-3 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[minmax(14rem,1.4fr)_repeat(3,minmax(8rem,1fr))_repeat(3,minmax(7rem,0.8fr))]"
        id="filters-container-row"
      >
        <ProfilerFilterField label="Function" className="md:col-span-2 lg:col-span-1 xl:col-span-1">
          <TriageSearch value={search} onChange={setSearch} placeholder="Search functions..." className="min-w-0" />
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
                  <TableRow key={textValue(row, 'name')}>
                    <TableCell className="font-mono">{textValue(row, 'name')}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{textValue(row, 'group')}</TableCell>
                    <TableCell className="text-right tabular-nums">{numberValue(row, 'percent').toFixed(1)}%</TableCell>
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
    </div>
  );
}
