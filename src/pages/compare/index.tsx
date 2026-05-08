import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useShallow } from 'zustand/react/shallow';
import { useSessionStore, type SessionInfo } from '@/store/session';
import { sessionQueryKey } from '@/hooks/use-ws-connection';
import { type PerformanceMetrics } from '@/hooks/use-performance';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/styles';
import { formatMemory } from '@/lib/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useSessionObservers(sessionId: string | null): Record<string, any>[] {
  const defaultData = useRef([]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = useQuery<Record<string, any>[]>({
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

function sessionLabel(s: SessionInfo) {
  return s.name ?? s.deviceId ?? s.id.slice(0, 8);
}

function SessionPicker({
  value,
  onChange,
  sessions,
  placeholder,
}: {
  value: string | null;
  onChange: (id: string) => void;
  sessions: SessionInfo[];
  placeholder: string;
}) {
  return (
    <Select value={value ?? ''} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-52 text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {sessions.length === 0 && (
          <SelectItem value="__none__" disabled>
            No sessions available
          </SelectItem>
        )}
        {sessions.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="flex items-center gap-2">
              <span
                className={cn('size-1.5 rounded-full shrink-0', s.connected ? 'bg-green-500' : 'bg-muted-foreground')}
              />
              {sessionLabel(s)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PerfStrip({ perf, label }: { perf: PerformanceMetrics | null; label: string }) {
  if (!perf) return <span className="text-xs text-muted-foreground italic">No data for {label}</span>;
  return (
    <div className="flex items-center gap-4 font-mono text-xs">
      <span>
        <span className="text-muted-foreground">FPS </span>
        {perf.fps.toFixed(0)}
      </span>
      <span>
        <span className="text-muted-foreground">Mem </span>
        {formatMemory(perf.memory)}
      </span>
      <span>
        <span className="text-muted-foreground">DC </span>
        {perf.stats.drawcalls}
      </span>
      <span>
        <span className="text-muted-foreground">ft </span>
        {(perf.frameTime * 1000).toFixed(1)} ms
      </span>
    </div>
  );
}

export default function ComparePage() {
  const sessions = useSessionStore(useShallow((state) => Object.values(state.sessions)));
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);

  const leftObs = useSessionObservers(leftId);
  const rightObs = useSessionObservers(rightId);
  const leftPerf = useSessionPerformance(leftId);
  const rightPerf = useSessionPerformance(rightId);

  // Build key → value maps from observer arrays
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toMap = (obs: Record<string, any>[]) => {
    const map = new Map<string, string>();
    for (const item of obs) {
      if (item.key != null) map.set(String(item.key), String(item.value ?? ''));
    }
    return map;
  };

  const leftMap = toMap(leftObs);
  const rightMap = toMap(rightObs);
  const allKeys = Array.from(new Set([...leftMap.keys(), ...rightMap.keys()])).sort();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <span className="text-sm font-semibold">Compare</span>
        <div className="ml-auto flex items-center gap-2">
          <SessionPicker value={leftId} onChange={setLeftId} sessions={sessions} placeholder="Session A" />
          <span className="text-xs text-muted-foreground">vs</span>
          <SessionPicker value={rightId} onChange={setRightId} sessions={sessions} placeholder="Session B" />
        </div>
      </div>

      {/* Perf strip */}
      <div className="grid shrink-0 grid-cols-2 divide-x border-b">
        <div className="flex items-center gap-3 px-4 py-2">
          <Badge variant="outline" className="text-[10px]">
            A
          </Badge>
          <PerfStrip perf={leftPerf} label="A" />
        </div>
        <div className="flex items-center gap-3 px-4 py-2">
          <Badge variant="outline" className="text-[10px]">
            B
          </Badge>
          <PerfStrip perf={rightPerf} label="B" />
        </div>
      </div>

      {/* Diff table */}
      {!leftId && !rightId ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Select two sessions to compare their observer values.
        </div>
      ) : allKeys.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          No observer data yet. Call <code className="mx-1 font-mono text-xs">DEBUGGER:observe()</code> in your game.
        </div>
      ) : (
        <div className="h-0 flex-1 overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-background">
              <TableRow>
                <TableHead className="w-1/3">Key</TableHead>
                <TableHead>
                  <span className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      A
                    </Badge>
                    {leftId
                      ? sessions.find((s) => s.id === leftId)
                        ? sessionLabel(sessions.find((s) => s.id === leftId)!)
                        : leftId.slice(0, 8)
                      : '—'}
                  </span>
                </TableHead>
                <TableHead>
                  <span className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      B
                    </Badge>
                    {rightId
                      ? sessions.find((s) => s.id === rightId)
                        ? sessionLabel(sessions.find((s) => s.id === rightId)!)
                        : rightId.slice(0, 8)
                      : '—'}
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allKeys.map((key) => {
                const lv = leftMap.get(key);
                const rv = rightMap.get(key);
                const differs = lv !== rv;
                const onlyLeft = lv !== undefined && rv === undefined;
                const onlyRight = lv === undefined && rv !== undefined;
                return (
                  <TableRow
                    key={key}
                    className={cn({
                      'bg-yellow-500/10 dark:bg-yellow-400/10': differs && !onlyLeft && !onlyRight,
                      'bg-blue-500/10 dark:bg-blue-400/10': onlyLeft || onlyRight,
                    })}
                  >
                    <TableCell className="py-1.5 font-mono text-xs">
                      <span className="flex items-center gap-1.5">
                        {differs && (
                          <span
                            className={cn(
                              'size-1.5 shrink-0 rounded-full',
                              onlyLeft || onlyRight ? 'bg-blue-500' : 'bg-yellow-500',
                            )}
                          />
                        )}
                        {key}
                      </span>
                    </TableCell>
                    <TableCell className={cn('py-1.5 font-mono text-xs', !lv && 'text-muted-foreground italic')}>
                      {lv ?? '—'}
                    </TableCell>
                    <TableCell className={cn('py-1.5 font-mono text-xs', !rv && 'text-muted-foreground italic')}>
                      {rv ?? '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
