import { useEffect, useMemo, useState } from 'react';
import { PageLayout } from '@/components/page-layout';
import { SectionCards } from './section-cards';
import { useObservability, ObserverEntry } from '@/hooks/use-observability';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, CopyButton } from '@/components/ui/button';
import { LuaBlock } from '@/components/code';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { useConfig } from '@/hooks/use-config';
import { lineDiff, hasDiff } from '@/utils/diff';
import { cn } from '@/utils/styles';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ActivityIcon, DownloadIcon, EyeIcon, SearchIcon } from 'lucide-react';
import { downloadFile } from '@/utils/file';

type ObserverSortKey = 'changed' | 'key' | 'group' | 'type' | 'changes' | 'lastChanged' | 'lastSeen' | 'size';
type ChangeWindowKey = '5000' | '10000' | '30000' | '60000' | 'sticky';

const CHANGE_WINDOW_STORAGE_KEY = 'feather-observability-change-window';

const sortLabels: Record<ObserverSortKey, string> = {
  changed: 'Changed first',
  key: 'Key',
  group: 'Group',
  type: 'Type',
  changes: 'Most changes',
  lastChanged: 'Last changed',
  lastSeen: 'Last seen',
  size: 'Largest value',
};

const changeWindowLabels: Record<ChangeWindowKey, string> = {
  '5000': 'Changed: 5s',
  '10000': 'Changed: 10s',
  '30000': 'Changed: 30s',
  '60000': 'Changed: 1m',
  sticky: 'Changed: sticky',
};

function readStoredChangeWindow(): ChangeWindowKey {
  if (typeof window === 'undefined') return 'sticky';
  const stored = window.localStorage.getItem(CHANGE_WINDOW_STORAGE_KEY);
  return stored && stored in changeWindowLabels ? (stored as ChangeWindowKey) : 'sticky';
}

function applyChangeWindow(entry: ObserverEntry, changeWindow: ChangeWindowKey, now: number): ObserverEntry {
  const changed =
    changeWindow === 'sticky'
      ? (entry.changeCount ?? 0) > 0
      : entry.lastChanged !== undefined && now - entry.lastChanged <= Number(changeWindow);
  return entry.changed === changed ? entry : { ...entry, changed };
}

function formatObservedTime(time?: number) {
  if (!time) return 'Never';
  return new Date(time).toLocaleTimeString();
}

function exportObservers(data: ObserverEntry[]) {
  const payload = {
    exportedAt: new Date().toISOString(),
    count: data.length,
    observers: data,
  };
  const src = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
  void downloadFile(`feather-observers-${Date.now()}.json`, src, 'string');
}

function DiffView({ oldValue, newValue }: { oldValue: string; newValue: string }) {
  const lines = lineDiff(oldValue, newValue);
  return (
    <div className="rounded-md bg-muted font-mono text-xs leading-5 overflow-auto p-3">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn('px-1 whitespace-pre', {
            'bg-green-500/20 text-green-400': line.kind === 'added',
            'bg-red-500/20 text-red-400 line-through': line.kind === 'removed',
            'text-muted-foreground': line.kind === 'same',
          })}
        >
          {line.kind === 'added' ? '+ ' : line.kind === 'removed' ? '- ' : '  '}
          {line.text}
        </div>
      ))}
    </div>
  );
}

function HistoryEntry({ value, index, total }: { value: string; index: number; total: number }) {
  const [expanded, setExpanded] = useState(false);
  const isLatest = index === total - 1;
  const preview = value.split('\n')[0];

  return (
    <div className="text-xs border rounded-md overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="font-mono truncate text-muted-foreground">{preview}</span>
        <span className="text-muted-foreground ml-2 shrink-0">{isLatest ? 'previous' : `${total - index} ago`}</span>
      </button>
      {expanded && (
        <div className="border-t">
          <LuaBlock code={value} showLineNumbers={false} className="text-xs" />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-muted/25 px-3 py-2">
      <p className="text-[11px] uppercase text-muted-foreground">{label}</p>
      <p className="font-mono text-lg font-semibold">{value}</p>
    </div>
  );
}

export function ObserveSidePanel({ data, onClose }: { onClose: (o: boolean) => void; data: ObserverEntry }) {
  const diffLines = data.previous !== undefined ? lineDiff(data.previous, data.value) : [];
  const showDiff = hasDiff(diffLines);
  const defaultTab = showDiff ? 'diff' : 'current';

  return (
    <Card className="w-[min(640px,45vw)] min-w-[420px] rounded-none rounded-br-xl flex flex-col">
      <CardHeader className="flex items-center justify-between shrink-0">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <CardTitle className="truncate font-mono text-base">{data.key}</CardTitle>
            {data.changed && <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" title="Value changed" />}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-[10px]">
              {data.type}
            </Badge>
            {data.group && (
              <Badge variant="outline" className="font-mono text-[10px]">
                {data.group}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">{data.value.length.toLocaleString()} chars</span>
          </div>
        </div>
        <Button onClick={() => onClose(false)} variant="secondary">
          Dismiss
        </Button>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden">
        <Tabs defaultValue={defaultTab} className="h-full flex flex-col">
          <TabsList className="shrink-0">
            <TabsTrigger value="current">Current</TabsTrigger>
            <TabsTrigger value="diff" disabled={!showDiff}>
              Diff {showDiff && <span className="ml-1 h-1.5 w-1.5 rounded-full bg-yellow-400 inline-block" />}
            </TabsTrigger>
            <TabsTrigger value="history" disabled={data.history.length === 0}>
              History{' '}
              {data.history.length > 0 && <span className="ml-1 text-muted-foreground">({data.history.length})</span>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="current" className="flex-1 overflow-auto space-y-4 mt-3">
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
              <Stat label="Changes" value={data.changeCount ?? 0} />
              <Stat label="First Seen" value={formatObservedTime(data.firstSeen)} />
              <Stat label="Last Seen" value={formatObservedTime(data.lastSeen)} />
              <Stat label="Last Changed" value={formatObservedTime(data.lastChanged)} />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Value</span>
                <CopyButton value={data.value} />
              </div>
              <LuaBlock className="max-h-[100%]" code={data.value} showLineNumbers={false} />
            </div>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">Observer JSON</span>
                <CopyButton value={JSON.stringify(data, null, 2)} />
              </div>
              <LuaBlock className="mt-1" code={JSON.stringify(data, null, 2)} showLineNumbers={false} />
            </div>
          </TabsContent>

          <TabsContent value="diff" className="flex-1 overflow-auto mt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Changes from previous value</span>
            </div>
            <DiffView oldValue={data.previous ?? ''} newValue={data.value} />
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-hidden mt-3">
            <ScrollArea className="h-full">
              <div className="space-y-2 pr-3">
                {[...data.history].reverse().map((v, i) => (
                  <HistoryEntry key={i} value={v} index={data.history.length - 1 - i} total={data.history.length} />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export default function Page() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [sortBy, setSortBy] = useState<ObserverSortKey>('changed');
  const [changeWindow, setChangeWindow] = useState<ChangeWindowKey>(readStoredChangeWindow);
  const [now, setNow] = useState(() => Date.now());
  const [changedOnly, setChangedOnly] = useState(false);
  const { data: searchedDataRaw, all: allRaw } = useObservability(search);
  const [selected, setSelected] = useState<string | null>(null);

  const onSelect = (key: string) => setSelected(key);
  const onClose = () => setSelected(null);

  useConfig();

  useEffect(() => {
    window.localStorage.setItem(CHANGE_WINDOW_STORAGE_KEY, changeWindow);
  }, [changeWindow]);

  useEffect(() => {
    if (changeWindow === 'sticky') return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [changeWindow]);

  const all = useMemo(() => allRaw.map((item) => applyChangeWindow(item, changeWindow, now)), [allRaw, changeWindow, now]);
  const searchedData = useMemo(
    () => searchedDataRaw.map((item) => applyChangeWindow(item, changeWindow, now)),
    [searchedDataRaw, changeWindow, now],
  );

  const typeOptions = useMemo(() => Array.from(new Set(all.map((item) => item.type))).sort(), [all]);
  const groupOptions = useMemo(() => Array.from(new Set(all.map((item) => item.group ?? 'ungrouped'))).sort(), [all]);
  const data = useMemo(() => {
    return searchedData
      .filter((item) => typeFilter === 'all' || item.type === typeFilter)
      .filter((item) => groupFilter === 'all' || (item.group ?? 'ungrouped') === groupFilter)
      .filter((item) => !changedOnly || item.changed)
      .sort((a, b) => {
        if (sortBy === 'key') return a.key.localeCompare(b.key);
        if (sortBy === 'group') return (a.group ?? '').localeCompare(b.group ?? '') || a.key.localeCompare(b.key);
        if (sortBy === 'type') return a.type.localeCompare(b.type) || a.key.localeCompare(b.key);
        if (sortBy === 'changes') return (b.changeCount ?? 0) - (a.changeCount ?? 0) || a.key.localeCompare(b.key);
        if (sortBy === 'lastChanged') return (b.lastChanged ?? 0) - (a.lastChanged ?? 0) || a.key.localeCompare(b.key);
        if (sortBy === 'lastSeen') return (b.lastSeen ?? 0) - (a.lastSeen ?? 0) || a.key.localeCompare(b.key);
        if (sortBy === 'size') return (b.valueLength ?? b.value.length) - (a.valueLength ?? a.value.length) || a.key.localeCompare(b.key);
        return Number(b.changed) - Number(a.changed) || a.key.localeCompare(b.key);
      });
  }, [searchedData, typeFilter, groupFilter, changedOnly, sortBy]);

  const selectedEntry = data.find((item) => item.key === selected);
  const changedCount = all.filter((item) => item.changed).length;
  const historyCount = all.reduce((count, item) => count + item.history.length, 0);
  const totalChanges = all.reduce((count, item) => count + (item.changeCount ?? 0), 0);

  useEffect(() => {
    if (selected && !selectedEntry) setSelected(null);
  }, [selected, selectedEntry]);

  if (all.length === 0 && !search) {
    return (
      <PageLayout>
        <div className="flex flex-col items-center justify-center h-full gap-6 px-4 py-16 text-center">
          <div className="grid gap-1">
            <p className="text-lg font-semibold">No observers yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Call <code className="font-mono">DEBUGGER:observe()</code> anywhere in your game loop to watch values in
              real time.
            </p>
          </div>
          <LuaBlock
            className="w-full max-w-lg text-left"
            showLineNumbers={false}
            code={`-- Call this each frame (or whenever the value changes)
function love.update(dt)
  DEBUGGER:observe("player.x", player.x)
  DEBUGGER:observe("player.y", player.y)
  DEBUGGER:observe("health", player.health)
  DEBUGGER:observe("state", player.state)
end`}
          />
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout right={selected && selectedEntry && <ObserveSidePanel data={selectedEntry} onClose={onClose} />}>
      <div className="space-y-3 px-4 pb-1 lg:px-6">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="Observers" value={all.length} />
          <Stat label="Changed" value={changedCount} />
          <Stat label="Types" value={typeOptions.length} />
          <Stat label="Changes" value={totalChanges} />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-64 flex-1 max-w-xl">
            <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search keys or values..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-7"
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="all">All types</SelectItem>

              {typeOptions.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="All groups" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>

              {groupOptions.map((group) => (
                <SelectItem key={group} value={group}>
                  {group}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as ObserverSortKey)}>
            <SelectTrigger className="h-9 w-[180px]">
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
          <Select value={changeWindow} onValueChange={(value) => setChangeWindow(value as ChangeWindowKey)}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(changeWindowLabels).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={changedOnly ? 'default' : 'outline'}
            size="default"
            onClick={() => setChangedOnly((value) => !value)}
          >
            <ActivityIcon className="size-4" />
            Changed
          </Button>
          <Button variant="outline" size="default" onClick={() => exportObservers(data)}>
            <DownloadIcon className="size-4" />
            Export JSON
          </Button>
          {data.length > 0 && (
            <Badge variant="secondary" className="h-9 gap-1.5 px-3 text-sm">
              <EyeIcon className="size-4" />
              {data.length.toLocaleString()} of {all.length.toLocaleString()} shown
              {historyCount > 0 ? `, ${historyCount.toLocaleString()} history` : ''}
            </Badge>
          )}
        </div>
      </div>
      {data.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-sm text-muted-foreground">
          No observers match the current filters.
        </div>
      ) : (
        <SectionCards data={data} selected={selected} onSelect={onSelect} />
      )}
    </PageLayout>
  );
}
