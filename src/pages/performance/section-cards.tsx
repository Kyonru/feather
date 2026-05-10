import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { DEFAULT_METRIC, PerformanceMetrics } from '@/hooks/use-performance';
import { cn } from '@/utils/styles';
import { formatMemory } from '@/lib/utils';
import { TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import { useMemo } from 'react';

const TrendingBadge = ({ value }: { value?: number }) => {
  const formatted = value ? value : 0;
  let trend = formatted < 0 ? <TrendingDownIcon /> : null;
  if (formatted > 0) {
    trend = <TrendingUpIcon />;
  }
  return (
    <Badge variant="outline">
      {trend}
      {(formatted * 100).toFixed(2)}%
    </Badge>
  );
};

export function SectionCards({
  onSelect,
  selected,
  data,
  diskUsageEnabled,
}: {
  data: PerformanceMetrics[];
  selected: string;
  onSelect: (key: 'fps' | 'memory' | 'diskUsage') => void;
  diskUsageEnabled: boolean;
}) {
  const metric = useMemo(() => {
    const defaultMetric = DEFAULT_METRIC;
    return data[data.length - 1] || defaultMetric;
  }, [data]);

  const FPSAverage = useMemo(() => {
    const sum = data.reduce((acc, item) => {
      return acc + item.fps;
    }, 0);

    return sum / data.length;
  }, [data]);

  const FPSIncrease = useMemo(() => {
    if (!FPSAverage) return 0;
    const last = data[data.length - 1] || DEFAULT_METRIC;
    return (last.fps - FPSAverage) / FPSAverage;
  }, [data, FPSAverage]);

  const MemoryAverage = useMemo(() => {
    if (!data.length) return 0;
    return data.reduce((acc, item) => acc + item.memory, 0) / data.length;
  }, [data]);

  const MemoryIncrease = useMemo(() => {
    if (!MemoryAverage) return 0;
    const last = data[data.length - 1] || DEFAULT_METRIC;
    return (last.memory - MemoryAverage) / MemoryAverage;
  }, [data, MemoryAverage]);

  const ftMinMs = ((metric.frameTimeMin ?? 0) * 1000).toFixed(2);
  const ftMaxMs = ((metric.frameTimeMax ?? 0) * 1000).toFixed(2);

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-3 @5xl/main:grid-cols-3 @7xl/main:grid-cols-6">
      <Card
        className={cn({
          '@container/card': true,
          'justify-between': true,
          'hover:bg-sky-500': true,
          'active:bg-sky-900': true,
          'bg-sky-700': selected === 'fps',
          'dark:active:border-sky-900': true,
          'dark:hover:border-sky-500': true,
          'dark:border-sky-700': selected === 'fps',
        })}
        onClick={() => onSelect('fps')}
      >
        <CardHeader>
          <CardDescription>FPS</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {metric.fps.toFixed(2)}
          </CardTitle>
          <CardAction>
            <TrendingBadge value={FPSIncrease} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">Frame Time</div>
          <div className="text-muted-foreground">{(metric.frameTime * 1000).toFixed(2)} ms</div>
        </CardFooter>
      </Card>
      <Card
        className={cn({
          '@container/card': true,
          'justify-between': true,
          'hover:bg-sky-500': true,
          'active:bg-sky-900': true,
          'bg-sky-700': selected === 'memory',
          'dark:active:border-sky-900': true,
          'dark:hover:border-sky-500': true,
          'dark:border-sky-700': selected === 'memory',
        })}
        onClick={() => onSelect('memory')}
      >
        <CardHeader>
          <CardDescription>Memory</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {formatMemory(metric.memory)}
          </CardTitle>
          <CardAction>
            <TrendingBadge value={MemoryIncrease} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">Peak / Texture</div>
          <div className="text-muted-foreground">
            {formatMemory(metric.peakMemory ?? 0)} / {formatMemory(metric.stats.texturememory)}
          </div>
        </CardFooter>
      </Card>
      <Card
        className={cn({
          '@container/card': true,
          'justify-between': true,
          'hover:bg-sky-500': true,
          'active:bg-sky-900': true,
          'bg-sky-700': selected === 'diskUsage',
          'dark:active:border-sky-900': true,
          'dark:hover:border-sky-500': true,
          'dark:border-sky-700': selected === 'diskUsage',
        })}
        onClick={() => diskUsageEnabled && onSelect('diskUsage')}
      >
        <CardHeader>
          <CardDescription>Disk Usage</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {diskUsageEnabled ? formatMemory(metric.diskUsage ?? 0) : '—'}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">Save directory</div>
          <div className="text-muted-foreground">{diskUsageEnabled ? 'Updated every 5s' : 'Disabled'}</div>
        </CardFooter>
      </Card>
      <Card className="@container/card justify-between">
        <CardHeader>
          <CardDescription>Frame Time</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {((metric.frameTimeAvg ?? 0) * 1000).toFixed(2)} ms
          </CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-4">
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">Min</div>
            <div className="text-muted-foreground">{ftMinMs} ms</div>
          </CardFooter>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">Max</div>
            <div className="text-muted-foreground">{ftMaxMs} ms</div>
          </CardFooter>
        </div>
      </Card>
      <Card className="@container/card justify-between">
        <CardHeader>
          <CardDescription>Draw Calls</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {metric.stats.drawcalls}
          </CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-4">
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">Batched</div>
            <div className="text-muted-foreground">{metric.stats.drawcallsbatched}</div>
          </CardFooter>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">Canvases</div>
            <div className="text-muted-foreground">{metric.stats.canvases}</div>
          </CardFooter>
        </div>
      </Card>
      <Card className="@container/card justify-between">
        <CardHeader>
          <CardDescription>Assets</CardDescription>
        </CardHeader>
        <div className="grid grid-cols-2 gap-4">
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">Fonts</div>
            <div className="text-muted-foreground">{metric.stats.fonts}</div>
          </CardFooter>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">Images</div>
            <div className="text-muted-foreground">{metric.stats.images}</div>
          </CardFooter>
        </div>
      </Card>
    </div>
  );
}
