import { useEffect, useMemo, useState } from 'react';
import { ChartAreaInteractive, chartMetrics, type ChartMetricKey } from '@/pages/performance/chart-area-interactive';
import { PageLayout } from '@/components/page-layout';
import { PerformanceMetrics, usePerformance, type FeatherOverheadMetric } from '@/hooks/use-performance';
import { SectionCards } from './section-cards';
import { useConfig } from '@/hooks/use-config';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TriageEmptyState, TriageToolbar } from '@/components/triage';
import {
  CheckCircleIcon,
  ChevronDownIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  RadioIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { downloadFile } from '@/utils/file';
import { ProfilerPanel } from './profiler-panel';
import {
  analyzePerformanceHealth,
  formatOptionalFixed,
  formatOptionalMemory,
  metricNumber,
  metricStatsNumber,
  type PerformanceVerdict,
} from '@/utils/performance-metrics';

function exportPerformance(samples: PerformanceMetrics[], metric: ChartMetricKey) {
  const payload = {
    exportedAt: new Date().toISOString(),
    metric,
    samples,
  };
  const src = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
  void downloadFile(`feather-performance-${Date.now()}.json`, src, 'string');
}

function formatByteCount(bytes: unknown): string {
  const value = metricNumber(bytes);
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(2)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${value.toFixed(0)} B`;
}

function OverheadMetricCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {detail && <div className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</div>}
    </div>
  );
}

function FeatherOverheadPanel({ overhead }: { overhead?: FeatherOverheadMetric }) {
  const topPlugins = overhead?.plugins?.slice(0, 4) ?? [];
  const budgetMisses = overhead?.budgetMisses ?? {};
  const totalPluginCost = topPlugins.reduce(
    (sum, plugin) => sum + metricNumber(plugin.update?.totalMs) + metricNumber(plugin.payload?.totalMs),
    0,
  );

  return (
    <Card data-testid="feather-overhead-panel">
      <CardHeader>
        <CardTitle>Feather Overhead</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!overhead ? (
          <TriageEmptyState title="No Feather overhead samples yet" className="min-h-28" />
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <OverheadMetricCard
                label="Runtime Cost"
                value={`${formatOptionalFixed(metricNumber(overhead.avgMsPerFrame), 3)} ms`}
                detail={`${overhead.frameCount ?? 0} frames sampled`}
              />
              <OverheadMetricCard
                label="Messages"
                value={String(overhead.messages ?? 0)}
                detail={`${formatByteCount(overhead.serializedBytes)} JSON`}
              />
              <OverheadMetricCard
                label="Binary"
                value={formatByteCount(overhead.binaryBytes)}
                detail={`${overhead.deferredTasks ?? 0} deferred tasks`}
              />
              <OverheadMetricCard
                label="Budget"
                value={`${formatOptionalFixed(overhead.budget?.maxFrameMs, 2)} ms`}
                detail={`${Object.values(budgetMisses).reduce((sum, count) => sum + metricNumber(count), 0)} misses`}
              />
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="grid gap-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Top Feather Work
                </div>
                {topPlugins.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No plugin update or payload cost in this sample.</p>
                ) : (
                  topPlugins.map((plugin) => {
                    const total = metricNumber(plugin.update?.totalMs) + metricNumber(plugin.payload?.totalMs);
                    const pct = totalPluginCost > 0 ? Math.max(4, (total / totalPluginCost) * 100) : 0;
                    return (
                      <div
                        key={plugin.id}
                        className="grid gap-1 rounded-md border bg-background px-3 py-2 text-left"
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium">{plugin.id}</span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{total.toFixed(3)} ms</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
                <div className="font-semibold uppercase tracking-wide text-foreground">Active Budget</div>
                <div className="mt-2 grid gap-1">
                  <div>Frame: {formatOptionalFixed(overhead.budget?.maxFrameMs, 2)} ms</div>
                  <div>Messages: {overhead.budget?.maxMessagesPerFrame ?? '—'} / frame</div>
                  <div>JSON: {formatByteCount(overhead.budget?.maxSerializedBytesPerFrame)} / frame</div>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SpikesList({ data }: { data: PerformanceMetrics[] }) {
  const spikes = useMemo(() => {
    return [...data]
      .sort(
        (a, b) =>
          Math.max(metricNumber(b.frameTimeMax), metricNumber(b.frameTime)) -
          Math.max(metricNumber(a.frameTimeMax), metricNumber(a.frameTime)),
      )
      .slice(0, 8);
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Spikes</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead className="text-right">Max Frame</TableHead>
              <TableHead className="text-right">FPS</TableHead>
              <TableHead className="text-right">Draw</TableHead>
              <TableHead className="text-right">Shader</TableHead>
              <TableHead className="text-right">Canvas</TableHead>
              <TableHead className="text-right">Memory</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spikes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="p-4">
                  <TriageEmptyState title="No performance samples yet" className="min-h-32" />
                </TableCell>
              </TableRow>
            ) : (
              spikes.map((sample) => (
                <TableRow key={`${sample.time}-${sample.gameTime}`}>
                  <TableCell className="text-xs tabular-nums">
                    {new Date(sample.time * 1000).toLocaleTimeString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatOptionalFixed(
                      Math.max(metricNumber(sample.frameTimeMax), metricNumber(sample.frameTime)) * 1000,
                      2,
                    )}{' '}
                    ms
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatOptionalFixed(sample.fps)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {metricStatsNumber(sample, 'drawcalls').toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {metricStatsNumber(sample, 'shaderswitches').toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {metricStatsNumber(sample, 'canvasswitches').toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatOptionalMemory(sample.memory)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function verdictClass(verdict: PerformanceVerdict) {
  return verdict.severity === 'critical'
    ? 'border-red-500/50 bg-red-500/10 text-red-950 dark:text-red-100'
    : 'border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100';
}

function HealthVerdicts({ data, latest }: { data: PerformanceMetrics[]; latest: PerformanceMetrics | null }) {
  const verdicts = useMemo(() => analyzePerformanceHealth(data, latest), [data, latest]);
  const [open, setOpen] = useState(false);

  if (!data.length || !latest) {
    return (
      <Card data-testid="performance-verdicts">
        <CardContent className="flex items-center gap-2 py-0 text-sm text-muted-foreground">
          <RadioIcon className="size-4" />
          Waiting for samples
        </CardContent>
      </Card>
    );
  }

  if (verdicts.length === 0) {
    return (
      <Card data-testid="performance-verdicts" className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="flex items-center gap-2 py-0 text-sm text-emerald-700 dark:text-emerald-300">
          <CheckCircleIcon className="size-4" />
          Healthy
          <span className="text-muted-foreground">No actionable performance warnings in the visible window.</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} data-testid="performance-verdicts">
      <Card className="border-amber-500/40 bg-amber-500/5">
        <CardContent className="grid gap-2 py-0">
          <div className="grid min-w-0 grid-cols-[auto_auto_auto_minmax(0,1fr)_auto] items-center gap-2 py-0">
            <TriangleAlertIcon className="size-4 shrink-0 text-amber-600" />
            <span className="shrink-0 text-sm font-semibold">Health Warnings</span>
            <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
              {verdicts.length}
            </span>
            <div className="grid min-w-0 grid-cols-1 gap-1 overflow-hidden sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {verdicts.slice(0, 4).map((verdict) => (
                <span
                  key={verdict.id}
                  className={`min-w-0 truncate rounded border px-1.5 py-0.5 text-xs ${verdictClass(verdict)}`}
                  title={`${verdict.title}: ${verdict.evidence}`}
                >
                  {verdict.title} · {verdict.evidence}
                </span>
              ))}
              {verdicts.length > 4 && (
                <span className="truncate rounded border px-1.5 py-0.5 text-xs text-muted-foreground">
                  +{verdicts.length - 4}
                </span>
              )}
            </div>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2">
                Details
                <ChevronDownIcon className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="grid gap-1 pt-1">
              {verdicts.map((verdict) => (
                <div key={verdict.id} className={`grid gap-1 rounded border px-2 py-1.5 ${verdictClass(verdict)}`}>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{verdict.title}</span>
                    <span className="font-mono text-xs">{verdict.evidence}</span>
                    <span className="rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase">
                      {verdict.severity}
                    </span>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <span>{verdict.cause}</span>
                    <span className="font-medium text-foreground">{verdict.action}</span>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </CardContent>
      </Card>
    </Collapsible>
  );
}

export default function Page() {
  const { data } = usePerformance();
  const [selected, setSelected] = useState<ChartMetricKey>('fps');
  const [diskUsageEnabled, setDiskUsageEnabled] = useState(false);
  const [followTail, setFollowTail] = useState(true);
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<PerformanceMetrics[] | null>(null);
  const [visibleWindow, setVisibleWindow] = useState<PerformanceMetrics[]>([]);

  const { updateDiskUsage } = useConfig();

  useEffect(() => {
    if (paused || !followTail) {
      setSnapshot((current) => current ?? data);
    } else {
      setSnapshot(null);
    }
  }, [data, paused, followTail]);

  const handleDiskUsageToggle = (enabled: boolean) => {
    setDiskUsageEnabled(enabled);
    updateDiskUsage(enabled);
    if (!enabled && selected === 'diskUsage') {
      setSelected('fps');
    }
  };

  const visibleData = snapshot ?? data;
  const cardData = visibleWindow.length ? visibleWindow : visibleData;
  const latestMetric = cardData.at(-1) ?? null;

  return (
    <PageLayout>
      <Tabs defaultValue="health" className="min-h-0 flex-1 px-4 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="health">Health</TabsTrigger>
            <TabsTrigger value="overhead">Overhead</TabsTrigger>
            <TabsTrigger value="profiler">Profiler</TabsTrigger>
          </TabsList>
          <TriageToolbar
            className="border-0 px-0"
            actions={
              <>
            <div className="flex items-center gap-2 pr-2">
              <Switch id="disk-usage-toggle" checked={diskUsageEnabled} onCheckedChange={handleDiskUsageToggle} />
              <Label htmlFor="disk-usage-toggle" className="text-muted-foreground text-sm">
                Track disk usage
              </Label>
            </div>
            <Button variant={paused ? 'default' : 'secondary'} size="sm" onClick={() => setPaused((value) => !value)}>
              {paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              variant={followTail ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setFollowTail((value) => !value)}
            >
              <RadioIcon className="size-4" />
              Follow
            </Button>
            <Button variant="secondary" size="sm" onClick={() => exportPerformance(visibleWindow, selected)}>
              <DownloadIcon className="size-4" />
              Export JSON
            </Button>
              </>
            }
          />
        </div>

        <TabsContent value="health" className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor="performance-metric" className="text-sm text-muted-foreground">
              Metric
            </Label>
            <Select value={selected} onValueChange={(value) => setSelected(value as ChartMetricKey)}>
              <SelectTrigger id="performance-metric" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {chartMetrics.map((metric) => (
                  <SelectItem key={metric.key} value={metric.key}>
                    {metric.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <HealthVerdicts data={cardData} latest={latestMetric} />
          <ChartAreaInteractive
            dataKey={selected}
            data={visibleData}
            onDataWindowChange={setVisibleWindow}
            onExport={(samples) => exportPerformance(samples, selected)}
          />
          <SectionCards
            data={cardData}
            selected={selected}
            onSelect={setSelected}
            diskUsageEnabled={diskUsageEnabled}
          />
          <SpikesList data={cardData} />
        </TabsContent>

        <TabsContent value="overhead" className="grid gap-4">
          <FeatherOverheadPanel overhead={latestMetric?.featherOverhead} />
        </TabsContent>

        <TabsContent value="profiler">
          <ProfilerPanel />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
