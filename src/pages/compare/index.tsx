import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  TriageCopyButton,
  TriageEmptyState,
  TriageFilterBar,
  TriageSearch,
  TriageSummaryChip,
  TriageToolbar,
} from '@/components/triage';
import { sessionQueryKey } from '@/hooks/use-ws-connection';
import { type PerformanceMetrics } from '@/hooks/use-performance';
import { finiteNumber, formatOptionalFixed, formatOptionalMemory, formatSignedMemory } from '@/utils/performance-metrics';
import { useSessionStore, type SessionInfo } from '@/store/session';
import { cn } from '@/utils/styles';

type ObserverEntry = {
  key?: unknown;
  value?: unknown;
  type?: string;
};

type CompareStatus = 'changed' | 'onlyA' | 'onlyB' | 'equal';
type CompareFilter = 'all' | CompareStatus;
type CompareSortKey = 'key' | 'status' | 'left' | 'right' | 'length';
type SortDirection = 'asc' | 'desc';

type CompareRow = {
  key: string;
  group: string;
  left?: string;
  right?: string;
  leftType?: string;
  rightType?: string;
  status: CompareStatus;
  valueLength: number;
};

function useSessionObservers(sessionId: string | null): ObserverEntry[] {
  const defaultData = useRef([]);

  const { data } = useQuery<ObserverEntry[]>({
    queryKey: sessionQueryKey.observers(sessionId ?? '__none__'),
    queryFn: () => [],
    enabled: false,
  });
  return data ?? defaultData.current;
}

function useSessionPerformance(sessionId: string | null): PerformanceMetrics | null {
  const defaultData = useRef([]);
  const { data } = useQuery<PerformanceMetrics[]>({
    queryKey: sessionQueryKey.performance(sessionId ?? '__none__'),
    queryFn: () => [],
    enabled: false,
  });
  return (data ?? defaultData.current).at(-1) ?? null;
}

function sessionLabel(session?: SessionInfo | null) {
  return session?.name ?? session?.deviceId ?? session?.id.slice(0, 8) ?? '—';
}

function groupForKey(key: string) {
  return key.match(/^([^.:/\s]+)/)?.[1] ?? 'ungrouped';
}

function statusLabel(status: CompareStatus) {
  if (status === 'onlyA') return 'Only A';
  if (status === 'onlyB') return 'Only B';
  return status[0].toUpperCase() + status.slice(1);
}

function statusClass(status: CompareStatus) {
  if (status === 'changed') return 'border-amber-500/40 text-amber-700 dark:text-amber-300';
  if (status === 'onlyA') return 'border-blue-500/40 text-blue-700 dark:text-blue-300';
  if (status === 'onlyB') return 'border-cyan-500/40 text-cyan-700 dark:text-cyan-300';
  return 'border-muted-foreground/30 text-muted-foreground';
}

function buildRows(left: ObserverEntry[], right: ObserverEntry[]): CompareRow[] {
  const leftMap = new Map<string, ObserverEntry>();
  const rightMap = new Map<string, ObserverEntry>();

  for (const item of left) {
    if (item.key != null) leftMap.set(String(item.key), item);
  }
  for (const item of right) {
    if (item.key != null) rightMap.set(String(item.key), item);
  }

  return Array.from(new Set([...leftMap.keys(), ...rightMap.keys()]))
    .sort()
    .map((key) => {
      const leftItem = leftMap.get(key);
      const rightItem = rightMap.get(key);
      const leftValue = leftItem ? String(leftItem.value ?? '') : undefined;
      const rightValue = rightItem ? String(rightItem.value ?? '') : undefined;
      const status: CompareStatus =
        leftValue === undefined ? 'onlyB' : rightValue === undefined ? 'onlyA' : leftValue === rightValue ? 'equal' : 'changed';

      return {
        key,
        group: groupForKey(key),
        left: leftValue,
        right: rightValue,
        leftType: leftItem?.type,
        rightType: rightItem?.type,
        status,
        valueLength: Math.max(leftValue?.length ?? 0, rightValue?.length ?? 0),
      };
    });
}

function SessionPicker({
  value,
  onChange,
  sessions,
  placeholder,
  excludeId,
}: {
  value: string | null;
  onChange: (id: string) => void;
  sessions: SessionInfo[];
  placeholder: string;
  excludeId?: string | null;
}) {
  return (
    <Select value={value ?? ''} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-52 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {sessions.map((session) => (
          <SelectItem key={session.id} value={session.id} disabled={session.id === excludeId}>
            <span className="flex items-center gap-2">
              <span className="size-1.5 shrink-0 rounded-full bg-green-500" />
              {sessionLabel(session)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SessionCard({
  label,
  session,
  perf,
  observerCount,
}: {
  label: 'A' | 'B';
  session?: SessionInfo;
  perf: PerformanceMetrics | null;
  observerCount: number;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-background px-3 py-2">
      <div className="mb-2 flex min-w-0 items-center gap-2">
        <Badge variant="outline" className="h-5 text-[10px]">
          {label}
        </Badge>
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={sessionLabel(session)}>
          {sessionLabel(session)}
        </span>
        <Badge variant="outline" className="h-5 border-emerald-500/40 text-[10px] text-emerald-600">
          Connected
        </Badge>
      </div>
      <div className="grid grid-cols-4 gap-2 font-mono text-xs text-muted-foreground">
        <span title={session?.kind ?? session?.os ?? 'Session kind'}>{session?.kind ?? session?.os ?? 'session'}</span>
        <span>Obs {observerCount}</span>
        <span>FPS {formatOptionalFixed(perf?.fps)}</span>
        <span>{finiteNumber(perf?.frameTime) == null ? '—' : `${(perf!.frameTime * 1000).toFixed(1)} ms`}</span>
        <span>Mem {formatOptionalMemory(perf?.memory)}</span>
        <span>DC {formatOptionalFixed(perf?.stats?.drawcalls)}</span>
        <span>Tex {formatOptionalMemory(perf?.stats?.texturememory)}</span>
        <span>Batch {formatOptionalFixed(perf?.stats?.drawcallsbatched)}</span>
      </div>
    </div>
  );
}

function SummaryStrip({ rows }: { rows: CompareRow[] }) {
  const counts = {
    changed: rows.filter((row) => row.status === 'changed').length,
    onlyA: rows.filter((row) => row.status === 'onlyA').length,
    onlyB: rows.filter((row) => row.status === 'onlyB').length,
    equal: rows.filter((row) => row.status === 'equal').length,
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
      <TriageSummaryChip label="Total" value={rows.length} />
      <TriageSummaryChip label="Changed" value={counts.changed} tone={counts.changed > 0 ? 'warning' : 'default'} />
      <TriageSummaryChip label="Only A" value={counts.onlyA} tone={counts.onlyA > 0 ? 'default' : 'muted'} />
      <TriageSummaryChip label="Only B" value={counts.onlyB} tone={counts.onlyB > 0 ? 'default' : 'muted'} />
      <TriageSummaryChip label="Equal" value={counts.equal} tone="muted" />
      {rows.length === 0 && <span className="text-xs text-muted-foreground">No observer values have arrived yet.</span>}
    </div>
  );
}

function deltaClass(metric: string, delta: number) {
  if (delta === 0) return '';
  const lowerIsBetter = metric !== 'FPS';
  const worse = lowerIsBetter ? delta > 0 : delta < 0;
  return worse ? 'border-amber-500/40 text-amber-700 dark:text-amber-300' : 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300';
}

function DeltaBadge({ label, left, right, formatter }: { label: string; left?: number; right?: number; formatter?: (value: number) => string }) {
  const leftValue = finiteNumber(left);
  const rightValue = finiteNumber(right);
  if (leftValue == null || rightValue == null) {
    return (
      <Badge variant="secondary" className="h-6 font-mono text-xs">
        {label} —
      </Badge>
    );
  }
  const delta = rightValue - leftValue;
  const format = formatter ?? ((value: number) => value.toFixed(0));
  return (
    <Badge variant="outline" className={cn('h-6 font-mono text-xs', deltaClass(label, delta))}>
      {label} {delta > 0 ? '+' : ''}
      {format(delta)}
    </Badge>
  );
}

function PerformanceDeltas({ left, right }: { left: PerformanceMetrics | null; right: PerformanceMetrics | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2">
      <span className="text-xs font-medium text-muted-foreground">B - A</span>
      <DeltaBadge label="FPS" left={left?.fps} right={right?.fps} />
      <DeltaBadge label="Frame" left={left?.frameTime} right={right?.frameTime} formatter={(value) => `${(value * 1000).toFixed(1)} ms`} />
      <DeltaBadge label="Mem" left={left?.memory} right={right?.memory} formatter={formatSignedMemory} />
      <DeltaBadge label="Texture" left={left?.stats?.texturememory} right={right?.stats?.texturememory} formatter={formatSignedMemory} />
      <DeltaBadge label="Draw" left={left?.stats?.drawcalls} right={right?.stats?.drawcalls} />
      <DeltaBadge label="Batched" left={left?.stats?.drawcallsbatched} right={right?.stats?.drawcallsbatched} />
      <DeltaBadge label="Canvas" left={left?.stats?.canvasswitches} right={right?.stats?.canvasswitches} />
      <DeltaBadge label="Shader" left={left?.stats?.shaderswitches} right={right?.stats?.shaderswitches} />
    </div>
  );
}

function SortButton({
  label,
  keyName,
  sortKey,
  sortDirection,
  onSort,
}: {
  label: string;
  keyName: CompareSortKey;
  sortKey: CompareSortKey;
  sortDirection: SortDirection;
  onSort: (key: CompareSortKey) => void;
}) {
  return (
    <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs font-medium" onClick={() => onSort(keyName)}>
      {label}
      {sortKey === keyName ? (
        sortDirection === 'asc' ? (
          <ArrowUpIcon className="size-3" />
        ) : (
          <ArrowDownIcon className="size-3" />
        )
      ) : (
        <ArrowUpDownIcon className="size-3 text-muted-foreground" />
      )}
    </Button>
  );
}

export default function ComparePage() {
  const sessions = useSessionStore(useShallow((state) => Object.values(state.sessions)));
  const connectedSessions = useMemo(() => sessions.filter((session) => session.connected), [sessions]);
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CompareFilter>('all');
  const [group, setGroup] = useState('all');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<CompareSortKey>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const canCompare = connectedSessions.length >= 2;

  useEffect(() => {
    if (!canCompare) {
      setLeftId(null);
      setRightId(null);
      return;
    }

    const isConnected = (id: string | null) => !!id && connectedSessions.some((session) => session.id === id);
    const nextLeft = isConnected(leftId) ? leftId : connectedSessions[0]?.id;
    const nextRight =
      isConnected(rightId) && rightId !== nextLeft
        ? rightId
        : connectedSessions.find((session) => session.id !== nextLeft)?.id;

    if (nextLeft !== leftId) setLeftId(nextLeft ?? null);
    if (nextRight !== rightId) setRightId(nextRight ?? null);
  }, [canCompare, connectedSessions, leftId, rightId]);

  const leftSession = connectedSessions.find((session) => session.id === leftId);
  const rightSession = connectedSessions.find((session) => session.id === rightId);
  const leftObs = useSessionObservers(leftId);
  const rightObs = useSessionObservers(rightId);
  const leftPerf = useSessionPerformance(leftId);
  const rightPerf = useSessionPerformance(rightId);
  const rows = useMemo(() => buildRows(leftObs, rightObs), [leftObs, rightObs]);
  const groups = useMemo(() => Array.from(new Set(rows.map((row) => row.group))).sort(), [rows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const next = rows.filter((row) => {
      if (filter !== 'all' && row.status !== filter) return false;
      if (group !== 'all' && row.group !== group) return false;
      if (!query) return true;
      return (
        row.key.toLowerCase().includes(query) ||
        (row.left ?? '').toLowerCase().includes(query) ||
        (row.right ?? '').toLowerCase().includes(query)
      );
    });

    return next.sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      const statusRank: Record<CompareStatus, number> = { changed: 0, onlyA: 1, onlyB: 2, equal: 3 };
      const aValue =
        sortKey === 'key'
          ? a.key
          : sortKey === 'status'
            ? statusRank[a.status]
            : sortKey === 'left'
              ? (a.left ?? '')
              : sortKey === 'right'
                ? (a.right ?? '')
                : a.valueLength;
      const bValue =
        sortKey === 'key'
          ? b.key
          : sortKey === 'status'
            ? statusRank[b.status]
            : sortKey === 'left'
              ? (b.left ?? '')
              : sortKey === 'right'
                ? (b.right ?? '')
                : b.valueLength;
      if (typeof aValue === 'number' && typeof bValue === 'number') return (aValue - bValue) * direction;
      return String(aValue).localeCompare(String(bValue)) * direction;
    });
  }, [filter, group, rows, search, sortDirection, sortKey]);

  const handleSort = (key: CompareSortKey) => {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'length' ? 'desc' : 'asc');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-b px-4 py-2">
        <span className="shrink-0 text-sm font-semibold">Compare</span>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SessionPicker value={leftId} onChange={setLeftId} sessions={connectedSessions} placeholder="Session A" excludeId={rightId} />
          <span className="text-xs text-muted-foreground">vs</span>
          <SessionPicker value={rightId} onChange={setRightId} sessions={connectedSessions} placeholder="Session B" excludeId={leftId} />
        </div>
      </div>

      {!canCompare ? (
        <TriageEmptyState
          className="m-4 flex-1"
          title="Compare needs at least two connected sessions"
          description="Connect another session to compare runtime data."
        />
      ) : (
        <>
          <div className="grid shrink-0 grid-cols-1 gap-2 border-b p-3 lg:grid-cols-2">
            <SessionCard label="A" session={leftSession} perf={leftPerf} observerCount={leftObs.length} />
            <SessionCard label="B" session={rightSession} perf={rightPerf} observerCount={rightObs.length} />
          </div>
          <SummaryStrip rows={rows} />
          <PerformanceDeltas left={leftPerf} right={rightPerf} />

          <TriageToolbar
            filters={
              <>
                <TriageFilterBar
                  value={filter}
                  onChange={setFilter}
                  options={(['all', 'changed', 'onlyA', 'onlyB', 'equal'] as CompareFilter[]).map((value) => ({
                    value,
                    label: value === 'all' ? 'All' : statusLabel(value),
                  }))}
                />
                <Select value={group} onValueChange={setGroup}>
                  <SelectTrigger className="h-8 w-40 text-xs">
                    <SelectValue placeholder="Group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All groups</SelectItem>
                    {groups.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            }
            search={<TriageSearch value={search} onChange={setSearch} placeholder="Search key or value" />}
            summary={<TriageSummaryChip label="Showing" value={filteredRows.length} />}
          />

          {rows.length === 0 ? (
            <TriageEmptyState
              className="m-4 flex-1"
              title="No observer data yet"
              description={
                <>
                  Call <code className="font-mono">DEBUGGER:observe()</code> in your game.
                </>
              }
            />
          ) : filteredRows.length === 0 ? (
            <TriageEmptyState className="m-4 flex-1" title="No compare rows match the current filters." />
          ) : (
            <div className="h-0 flex-1 overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-1/4">
                      <SortButton label="Key" keyName="key" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="w-28">
                      <SortButton label="Status" keyName="status" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                    </TableHead>
                    <TableHead>
                      <SortButton label="A Value" keyName="left" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                    </TableHead>
                    <TableHead>
                      <SortButton label="B Value" keyName="right" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="w-24">
                      <SortButton label="Size" keyName="length" sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
                    </TableHead>
                    <TableHead className="w-28 text-right">Copy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((row) => (
                    <TableRow
                      key={row.key}
                      className={cn({
                        'bg-amber-500/10': row.status === 'changed',
                        'bg-blue-500/10': row.status === 'onlyA',
                        'bg-cyan-500/10': row.status === 'onlyB',
                      })}
                    >
                      <TableCell className="py-1.5 font-mono text-xs">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="min-w-0 truncate" title={row.key}>
                            {row.key}
                          </span>
                          <Badge variant="secondary" className="h-5 shrink-0 text-[10px]">
                            {row.group}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="py-1.5">
                        <Badge variant="outline" className={cn('h-5 text-[10px]', statusClass(row.status))}>
                          {statusLabel(row.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className={cn('max-w-96 py-1.5 font-mono text-xs', row.left == null && 'text-muted-foreground italic')}>
                        <span className="block truncate" title={row.left ?? '—'}>
                          {row.left ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className={cn('max-w-96 py-1.5 font-mono text-xs', row.right == null && 'text-muted-foreground italic')}>
                        <span className="block truncate" title={row.right ?? '—'}>
                          {row.right ?? '—'}
                        </span>
                      </TableCell>
                      <TableCell className="py-1.5 font-mono text-xs text-muted-foreground">{row.valueLength}</TableCell>
                      <TableCell className="py-1.5 text-right">
                        <div className="flex justify-end gap-1">
                          <TriageCopyButton value={row.key} label="key" />
                          <TriageCopyButton value={row.left} label="A value">
                            A
                          </TriageCopyButton>
                          <TriageCopyButton value={row.right} label="B value">
                            B
                          </TriageCopyButton>
                          <TriageCopyButton value={JSON.stringify(row, null, 2)} label="row JSON">
                            {'{}'}
                          </TriageCopyButton>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
