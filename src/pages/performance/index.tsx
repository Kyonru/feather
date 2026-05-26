import { useEffect, useMemo, useState } from "react";
import { ChartAreaInteractive, chartMetrics, type ChartMetricKey } from "@/pages/performance/chart-area-interactive";
import { PageLayout } from "@/components/page-layout";
import { PerformanceMetrics, usePerformance } from "@/hooks/use-performance";
import { SectionCards } from "./section-cards";
import { useConfig } from "@/hooks/use-config";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DownloadIcon, PauseIcon, PlayIcon, RadioIcon } from "lucide-react";
import { formatMemory } from "@/lib/utils";
import { downloadFile } from "@/utils/file";
import { ProfilerPanel } from "./profiler-panel";

function exportPerformance(samples: PerformanceMetrics[], metric: ChartMetricKey) {
  const payload = {
    exportedAt: new Date().toISOString(),
    metric,
    samples,
  };
  const src = `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(payload, null, 2))}`;
  void downloadFile(`feather-performance-${Date.now()}.json`, src, 'string');
}

function SpikesList({ data }: { data: PerformanceMetrics[] }) {
  const spikes = useMemo(() => {
    return [...data]
      .sort((a, b) => (b.frameTimeMax ?? b.frameTime) - (a.frameTimeMax ?? a.frameTime))
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
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No performance samples yet
                </TableCell>
              </TableRow>
            ) : (
              spikes.map((sample) => (
                <TableRow key={`${sample.time}-${sample.gameTime}`}>
                  <TableCell className="text-xs tabular-nums">{new Date(sample.time * 1000).toLocaleTimeString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{((sample.frameTimeMax ?? sample.frameTime) * 1000).toFixed(2)} ms</TableCell>
                  <TableCell className="text-right tabular-nums">{sample.fps.toFixed(0)}</TableCell>
                  <TableCell className="text-right tabular-nums">{sample.stats.drawcalls}</TableCell>
                  <TableCell className="text-right tabular-nums">{sample.stats.shaderswitches}</TableCell>
                  <TableCell className="text-right tabular-nums">{sample.stats.canvasswitches}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMemory(sample.memory)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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

  return (
    <PageLayout>
      <Tabs defaultValue="health" className="min-h-0 flex-1 px-4 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="health">Health</TabsTrigger>
            <TabsTrigger value="profiler">Profiler</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 pr-2">
              <Switch
                id="disk-usage-toggle"
                checked={diskUsageEnabled}
                onCheckedChange={handleDiskUsageToggle}
              />
              <Label htmlFor="disk-usage-toggle" className="text-muted-foreground text-sm">
                Track disk usage
              </Label>
            </div>
            <Button variant={paused ? 'default' : 'secondary'} size="sm" onClick={() => setPaused((value) => !value)}>
              {paused ? <PlayIcon className="size-4" /> : <PauseIcon className="size-4" />}
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button variant={followTail ? 'default' : 'secondary'} size="sm" onClick={() => setFollowTail((value) => !value)}>
              <RadioIcon className="size-4" />
              Follow
            </Button>
            <Button variant="secondary" size="sm" onClick={() => exportPerformance(visibleWindow, selected)}>
              <DownloadIcon className="size-4" />
              Export JSON
            </Button>
          </div>
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
          <ChartAreaInteractive
            dataKey={selected}
            data={visibleData}
            onDataWindowChange={setVisibleWindow}
            onExport={(samples) => exportPerformance(samples, selected)}
          />
          <SectionCards
            data={visibleData}
            selected={selected}
            onSelect={setSelected}
            diskUsageEnabled={diskUsageEnabled}
          />
          <SpikesList data={visibleData} />
        </TabsContent>

        <TabsContent value="profiler">
          <ProfilerPanel />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}
