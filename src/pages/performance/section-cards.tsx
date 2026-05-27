import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DEFAULT_METRIC, PerformanceMetrics } from '@/hooks/use-performance';
import { cn } from '@/utils/styles';
import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import { useMemo } from 'react';
import type { ChartMetricKey } from './chart-area-interactive';
import {
  formatOptionalFixed,
  formatOptionalMemory,
  formatPercent,
  metricNumber,
  metricStatsNumber,
} from '@/utils/performance-metrics';

const TrendingBadge = ({ value }: { value?: number }) => {
  const formatted = metricNumber(value);
  let trend = formatted < -0.001 ? <TrendingDownIcon className="size-3" /> : null;
  if (formatted > 0.001) {
    trend = <TrendingUpIcon className="size-3" />;
  }
  return (
    <Badge variant="outline" className="h-5 px-1.5 font-mono text-[10px]">
      {trend}
      {formatPercent(formatted)}
    </Badge>
  );
};

const cardClass = (active: boolean, tone: 'sky' | 'emerald' | 'amber' | 'violet' | 'cyan' | 'rose', disabled = false) =>
  cn(
    '@container/card justify-between transition-colors',
    disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:bg-muted/70',
    active && {
      'border-sky-500/60 bg-sky-500/10 text-sky-950 dark:text-sky-100': tone === 'sky',
      'border-emerald-500/60 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100': tone === 'emerald',
      'border-amber-500/60 bg-amber-500/10 text-amber-950 dark:text-amber-100': tone === 'amber',
      'border-violet-500/60 bg-violet-500/10 text-violet-950 dark:text-violet-100': tone === 'violet',
      'border-cyan-500/60 bg-cyan-500/10 text-cyan-950 dark:text-cyan-100': tone === 'cyan',
      'border-rose-500/60 bg-rose-500/10 text-rose-950 dark:text-rose-100': tone === 'rose',
    },
  );

function average(data: PerformanceMetrics[], getValue: (metric: PerformanceMetrics) => number) {
  if (!data.length) return 0;
  return data.reduce((acc, item) => acc + getValue(item), 0) / data.length;
}

export function SectionCards({
  onSelect,
  selected,
  data,
  diskUsageEnabled,
}: {
  data: PerformanceMetrics[];
  selected: ChartMetricKey;
  onSelect: (key: ChartMetricKey) => void;
  diskUsageEnabled: boolean;
}) {
  const metric = useMemo(() => data[data.length - 1] || DEFAULT_METRIC, [data]);

  const FPSAverage = useMemo(() => average(data, (item) => metricNumber(item.fps)), [data]);

  const FPSIncrease = useMemo(() => {
    if (!FPSAverage) return 0;
    return (metricNumber(metric.fps) - FPSAverage) / FPSAverage;
  }, [FPSAverage, metric.fps]);

  const MemoryAverage = useMemo(() => average(data, (item) => metricNumber(item.memory)), [data]);

  const MemoryIncrease = useMemo(() => {
    if (!MemoryAverage) return 0;
    return (metricNumber(metric.memory) - MemoryAverage) / MemoryAverage;
  }, [MemoryAverage, metric.memory]);

  const ftMinMs = formatOptionalFixed(metricNumber(metric.frameTimeMin) * 1000, 2);
  const ftMaxMs = formatOptionalFixed(metricNumber(metric.frameTimeMax) * 1000, 2);

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-2 *:data-[slot=card]:gap-2 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:py-3 *:data-[slot=card]:shadow-xs @xl/main:grid-cols-3 @5xl/main:grid-cols-3 @7xl/main:grid-cols-6">
      <Card className={cardClass(selected === 'fps', 'sky')} onClick={() => onSelect('fps')} title="Chart FPS">
        <CardHeader className="gap-1 px-3">
          <CardDescription className="text-xs">FPS</CardDescription>
          <CardTitle className="text-xl font-semibold tabular-nums">
            {formatOptionalFixed(metric.fps, 2)}
          </CardTitle>
          <CardAction>
            <TrendingBadge value={FPSIncrease} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-0.5 px-3 text-xs">
          <div className="line-clamp-1 flex gap-2 font-medium">Frame Time</div>
          <div className="text-muted-foreground">{formatOptionalFixed(metricNumber(metric.frameTime) * 1000, 2)} ms</div>
        </CardFooter>
      </Card>

      <Card
        className={cardClass(selected === 'memory' || selected === 'peakMemory', 'emerald')}
        onClick={() => onSelect('memory')}
        title="Chart Lua memory"
      >
        <CardHeader className="gap-1 px-3">
          <CardDescription className="text-xs">Memory</CardDescription>
          <CardTitle className="text-xl font-semibold tabular-nums">
            {formatOptionalMemory(metric.memory)}
          </CardTitle>
          <CardAction>
            <TrendingBadge value={MemoryIncrease} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-0.5 px-3 text-xs">
          <div className="line-clamp-1 flex gap-2 font-medium">Peak / Texture</div>
          <div className="text-muted-foreground">
            {formatOptionalMemory(metric.peakMemory)} / {formatOptionalMemory(metricStatsNumber(metric, 'texturememory'))}
          </div>
        </CardFooter>
      </Card>

      <Card
        className={cardClass(selected === 'diskUsage' && diskUsageEnabled, 'amber', !diskUsageEnabled)}
        onClick={() => diskUsageEnabled && onSelect('diskUsage')}
        title={diskUsageEnabled ? 'Chart save directory disk usage' : 'Enable disk usage tracking first'}
      >
        <CardHeader className="gap-1 px-3">
          <CardDescription className="text-xs">Disk Usage</CardDescription>
          <CardTitle className="text-xl font-semibold tabular-nums">
            {diskUsageEnabled ? formatOptionalMemory(metric.diskUsage) : '—'}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-0.5 px-3 text-xs">
          <div className="line-clamp-1 flex gap-2 font-medium">Save directory</div>
          <div className="text-muted-foreground">{diskUsageEnabled ? 'Updated every 5s' : 'Disabled'}</div>
        </CardFooter>
      </Card>

      <Card
        className={cardClass(selected === 'frameTime' || selected === 'frameTimeMax', 'rose')}
        onClick={() => onSelect('frameTimeMax')}
        title="Chart maximum frame time"
      >
        <CardHeader className="gap-1 px-3">
          <CardDescription className="text-xs">Frame Time</CardDescription>
          <CardTitle className="text-xl font-semibold tabular-nums">
            {formatOptionalFixed(metricNumber(metric.frameTimeAvg) * 1000, 2)} ms
          </CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-2">
          <CardFooter className="flex-col items-start gap-0.5 px-3 text-xs">
            <div className="line-clamp-1 flex gap-2 font-medium">Min</div>
            <div className="text-muted-foreground">{ftMinMs} ms</div>
          </CardFooter>
          <CardFooter className="flex-col items-start gap-0.5 px-3 text-xs">
            <div className="line-clamp-1 flex gap-2 font-medium">Max</div>
            <div className="text-muted-foreground">{ftMaxMs} ms</div>
          </CardFooter>
        </div>
      </Card>

      <Card
        className={cardClass(selected === 'drawcalls' || selected === 'drawcallsbatched', 'violet')}
        onClick={() => onSelect('drawcalls')}
        title="Chart draw calls"
      >
        <CardHeader className="gap-1 px-3">
          <CardDescription className="text-xs">Draw Calls</CardDescription>
          <CardTitle className="text-xl font-semibold tabular-nums">
            {metricStatsNumber(metric, 'drawcalls').toLocaleString()}
          </CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-2">
          <CardFooter className="flex-col items-start gap-0.5 px-3 text-xs">
            <div className="line-clamp-1 flex gap-2 font-medium">Batched</div>
            <div className="text-muted-foreground">{metricStatsNumber(metric, 'drawcallsbatched').toLocaleString()}</div>
          </CardFooter>
          <CardFooter className="flex-col items-start gap-0.5 px-3 text-xs">
            <div className="line-clamp-1 flex gap-2 font-medium">Canvases</div>
            <div className="text-muted-foreground">{metricStatsNumber(metric, 'canvases').toLocaleString()}</div>
          </CardFooter>
        </div>
      </Card>

      <Card className={cardClass(selected === 'textureMemory', 'cyan')} onClick={() => onSelect('textureMemory')} title="Chart texture memory">
        <CardHeader className="gap-1 px-3">
          <CardDescription className="text-xs">Assets</CardDescription>
        </CardHeader>
        <div className="grid grid-cols-2 gap-2">
          <CardFooter className="flex-col items-start gap-0.5 px-3 text-xs">
            <div className="line-clamp-1 flex gap-2 font-medium">Fonts</div>
            <div className="text-muted-foreground">{metricStatsNumber(metric, 'fonts').toLocaleString()}</div>
          </CardFooter>
          <CardFooter className="flex-col items-start gap-0.5 px-3 text-xs">
            <div className="line-clamp-1 flex gap-2 font-medium">Images</div>
            <div className="text-muted-foreground">{metricStatsNumber(metric, 'images').toLocaleString()}</div>
          </CardFooter>
        </div>
      </Card>
    </div>
  );
}
