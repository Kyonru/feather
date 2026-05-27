import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CameraIcon, DownloadIcon, PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TriageEmptyState, TriageSearch, TriageSummaryChip, TriageToolbar } from '@/components/triage';
import { PluginTableRow, usePlugin, usePluginAction } from '@/hooks/use-plugin';
import { useConfigStore } from '@/store/config';
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

function numberValue(row: PluginTableRow, key: string) {
  const value = row[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function textValue(row: PluginTableRow, key: string) {
  const value = row[key];
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

function exportProfiler(rows: PluginTableRow[], metadata: Record<string, unknown>) {
  const payload = {
    exportedAt: new Date().toISOString(),
    metadata,
    rows,
  };
  const src = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
  void downloadFile(`feather-profiler-${Date.now()}.json`, src, 'string');
}

export function ProfilerPanel() {
  const plugin = useConfigStore((state) => state.config?.plugins?.profiler);
  const { data } = usePlugin('profiler');
  const { onAction } = usePluginAction('profiler');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('percent');
  const [minTotalMs, setMinTotalMs] = useState('');
  const [minAvgMs, setMinAvgMs] = useState('');
  const [hideOneCall, setHideOneCall] = useState(false);
  const [groupFilter, setGroupFilter] = useState('all');
  const [compareSnapshot, setCompareSnapshot] = useState('none');

  const tableData = data.type === 'table' ? data.data : [];
  const recording = data.type === 'table' ? data.recording !== false : false;
  const captureElapsed = data.type === 'table' ? data.captureElapsed ?? 0 : 0;
  const totalCapturedTime = data.type === 'table' ? data.totalCapturedTime ?? 0 : 0;
  const snapshots = data.type === 'table' ? (data.snapshots ?? []) : [];
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
        if (Number.isFinite(minTotalSeconds) && minTotalMs.trim() && numberValue(row, 'totalTimeRaw') < minTotalSeconds) return false;
        if (Number.isFinite(minAvgSeconds) && minAvgMs.trim() && numberValue(row, 'avgTimeRaw') < minAvgSeconds) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return textValue(a, 'name').localeCompare(textValue(b, 'name'));
        return numberValue(b, sortBy) - numberValue(a, sortBy);
      });
  }, [tableData, search, minTotalMs, minAvgMs, sortBy, groupFilter, hideOneCall]);

  if (!plugin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profiler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>The profiler plugin is not available in this session.</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/session">Review session plugins</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (plugin.disabled || plugin.incompatible) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profiler</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{plugin.incompatible ? 'The profiler plugin is incompatible with this session.' : 'The profiler plugin is disabled.'}</p>
          <Button asChild variant="outline" size="sm">
            <Link to="/plugins/profiler">Open profiler plugin</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <TriageToolbar
        className="rounded-md border"
        actions={
          <>
          <Button size="sm" variant={recording ? 'secondary' : 'default'} onClick={() => onAction('start')}>
            <PlayIcon className="size-4" />
            Start
          </Button>
          <Button size="sm" variant={!recording ? 'secondary' : 'outline'} onClick={() => onAction('stop')}>
            <PauseIcon className="size-4" />
            Stop
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction('reset')}>
            <RotateCcwIcon className="size-4" />
            Reset
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction('snapshot', { label: 'Before' })}>
            <CameraIcon className="size-4" />
            Before
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction('snapshot', { label: 'After' })}>
            <CameraIcon className="size-4" />
            After
          </Button>
          <Button size="sm" variant="outline" onClick={() => onAction('snapshot', { label: 'Last capture' })}>
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

      <div className="grid gap-2 rounded-md border p-3 lg:grid-cols-[minmax(16rem,1fr)_11rem_11rem_11rem_10rem_10rem]">
        <TriageSearch value={search} onChange={setSearch} placeholder="Search functions..." />
        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger>
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
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortKey)}>
          <SelectTrigger>
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
        <Select value={compareSnapshot} onValueChange={setCompareSnapshot}>
          <SelectTrigger>
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
        <div className="grid gap-1">
          <Label htmlFor="profiler-min-total" className="text-[10px] text-muted-foreground">
            Min total ms
          </Label>
          <Input id="profiler-min-total" inputMode="decimal" value={minTotalMs} onChange={(event) => setMinTotalMs(event.target.value)} />
        </div>
        <div className="grid gap-1">
          <Label htmlFor="profiler-min-avg" className="text-[10px] text-muted-foreground">
            Min avg ms
          </Label>
          <Input id="profiler-min-avg" inputMode="decimal" value={minAvgMs} onChange={(event) => setMinAvgMs(event.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground lg:col-span-6">
          <Checkbox checked={hideOneCall} onCheckedChange={(checked) => setHideOneCall(checked === true)} />
          Hide one-call entries
        </label>
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
                  <TriageEmptyState title="No profiler samples collected yet" className="min-h-32" />
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => {
                const previous = selectedSnapshot?.rows?.[textValue(row, 'name')];
                const deltaTotal = numberValue(row, 'totalTimeRaw') - (previous ? numberValue(previous, 'totalTimeRaw') : 0);
                const deltaCalls = numberValue(row, 'calls') - (previous ? numberValue(previous, 'calls') : 0);

                return (
                  <TableRow key={textValue(row, 'name')}>
                    <TableCell className="font-mono">{textValue(row, 'name')}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{textValue(row, 'group')}</TableCell>
                    <TableCell className="text-right tabular-nums">{numberValue(row, 'percent').toFixed(1)}%</TableCell>
                    <TableCell className="text-right tabular-nums">{numberValue(row, 'callsPerSecond').toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{numberValue(row, 'calls').toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{textValue(row, 'totalTime') || formatSeconds(numberValue(row, 'totalTimeRaw'))}</TableCell>
                    {selectedSnapshot ? <TableCell className="text-right tabular-nums">{deltaTotal >= 0 ? '+' : ''}{formatSeconds(deltaTotal)}</TableCell> : null}
                    {selectedSnapshot ? <TableCell className="text-right tabular-nums">{deltaCalls >= 0 ? '+' : ''}{deltaCalls.toLocaleString()}</TableCell> : null}
                    <TableCell className="text-right tabular-nums">{textValue(row, 'avgTime') || formatSeconds(numberValue(row, 'avgTimeRaw'))}</TableCell>
                    <TableCell className="text-right tabular-nums">{textValue(row, 'minTime') || formatSeconds(numberValue(row, 'minTimeRaw'))}</TableCell>
                    <TableCell className="text-right tabular-nums">{textValue(row, 'maxTime') || formatSeconds(numberValue(row, 'maxTimeRaw'))}</TableCell>
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
