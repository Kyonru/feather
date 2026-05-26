import * as React from 'react';
import { Area, AreaChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from 'recharts';

import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/components/ui/combobox';
import { PerformanceMetrics } from '@/hooks/use-performance';
import { formatMemory } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DownloadIcon } from 'lucide-react';

export const description = 'An interactive area chart';

export type ChartMetricKey =
  | 'fps'
  | 'frameTime'
  | 'frameTimeMax'
  | 'memory'
  | 'peakMemory'
  | 'textureMemory'
  | 'drawcalls'
  | 'drawcallsbatched'
  | 'canvasswitches'
  | 'shaderswitches'
  | 'diskUsage';

export type ChartMetricDefinition = {
  key: ChartMetricKey;
  label: string;
  color: string;
  kind: 'count' | 'fps' | 'memory' | 'milliseconds';
  getValue: (metric: PerformanceMetrics) => number;
};

export const chartMetrics: ChartMetricDefinition[] = [
  { key: 'fps', label: 'FPS', color: 'var(--chart-2)', kind: 'fps', getValue: (metric) => metric.fps },
  { key: 'frameTime', label: 'Frame Time', color: 'var(--chart-4)', kind: 'milliseconds', getValue: (metric) => metric.frameTime * 1000 },
  { key: 'frameTimeMax', label: 'Frame Max', color: 'var(--chart-5)', kind: 'milliseconds', getValue: (metric) => metric.frameTimeMax * 1000 },
  { key: 'memory', label: 'Memory', color: 'var(--chart-1)', kind: 'memory', getValue: (metric) => metric.memory },
  { key: 'peakMemory', label: 'Peak Memory', color: 'var(--chart-3)', kind: 'memory', getValue: (metric) => metric.peakMemory },
  { key: 'textureMemory', label: 'Texture Memory', color: 'var(--chart-2)', kind: 'memory', getValue: (metric) => metric.stats.texturememory },
  { key: 'drawcalls', label: 'Draw Calls', color: 'var(--chart-1)', kind: 'count', getValue: (metric) => metric.stats.drawcalls },
  { key: 'drawcallsbatched', label: 'Batched Draw Calls', color: 'var(--chart-3)', kind: 'count', getValue: (metric) => metric.stats.drawcallsbatched },
  { key: 'canvasswitches', label: 'Canvas Switches', color: 'var(--chart-4)', kind: 'count', getValue: (metric) => metric.stats.canvasswitches },
  { key: 'shaderswitches', label: 'Shader Switches', color: 'var(--chart-5)', kind: 'count', getValue: (metric) => metric.stats.shaderswitches },
  { key: 'diskUsage', label: 'Disk Usage', color: 'var(--chart-3)', kind: 'memory', getValue: (metric) => metric.diskUsage },
];

export const chartMetricMap = Object.fromEntries(chartMetrics.map((metric) => [metric.key, metric])) as Record<
  ChartMetricKey,
  ChartMetricDefinition
>;

const chartConfig = {
  value: {
    label: 'Value',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig;

const timeRanges: { label: string; value: string; seconds: number }[] = [
  { label: 'Last 3 seconds', value: '3s', seconds: 3 },
  { label: 'Last 5 seconds', value: '5s', seconds: 5 },
  { label: 'Last 10 seconds', value: '10s', seconds: 10 },
  { label: 'Last 15 seconds', value: '15s', seconds: 15 },
  { label: 'Last 30 seconds', value: '30s', seconds: 30 },
  { label: 'Last 1 minute', value: '60s', seconds: 60 },
  { label: 'Last 2 minutes', value: '120s', seconds: 120 },
  { label: 'Last 5 minutes', value: '300s', seconds: 300 },
  { label: 'Last 10 minutes', value: '600s', seconds: 600 },
];

export function ChartAreaInteractive({
  data,
  dataKey = 'fps',
  onDataWindowChange,
  onExport,
}: {
  dataKey?: ChartMetricKey;
  data: PerformanceMetrics[];
  onDataWindowChange?: (data: PerformanceMetrics[]) => void;
  onExport?: (data: PerformanceMetrics[]) => void;
}) {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState('15s');
  const metric = chartMetricMap[dataKey];

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange('15s');
    }
  }, [isMobile]);

  const filteredData = React.useMemo(() => {
    const seconds = timeRanges.find((r) => r.value === timeRange)?.seconds ?? 5;
    const lastTime = data[data.length - 1]?.time ?? 0;
    const startTime = lastTime - seconds;
    return data.filter((item) => item.time >= startTime);
  }, [data, timeRange]);

  const chartData = React.useMemo(
    () =>
      filteredData.map((item) => ({
        time: item.time,
        value: metric.getValue(item),
      })),
    [filteredData, metric],
  );

  React.useEffect(() => {
    onDataWindowChange?.(filteredData);
  }, [filteredData, onDataWindowChange]);

  const formatXAxis = (value: number) => {
    const lastTime = data[data.length - 1]?.time ?? value;
    const diffSeconds = Math.round(lastTime - value);
    if (diffSeconds === 0) return '0s';
    if (diffSeconds < 60) return `-${diffSeconds}s`;
    const minutes = Math.floor(diffSeconds / 60);
    const seconds = diffSeconds % 60;
    return seconds === 0 ? `-${minutes}m` : `-${minutes}m ${seconds}s`;
  };

  const formatValue = (value: number) => {
    if (metric.kind === 'fps') return `${value.toFixed(0)} FPS`;
    if (metric.kind === 'milliseconds') return `${value.toFixed(1)} ms`;
    if (metric.kind === 'memory') return formatMemory(value, 1);
    return value.toLocaleString();
  };

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{metric.label}</CardTitle>
        <CardAction className="flex items-center gap-2">
          <Combobox value={timeRange} onValueChange={(v) => v && setTimeRange(v)}>
            <ComboboxInput
              className="w-36 text-xs"
              showClear={false}
              placeholder="Select range…"
              value={timeRanges.find((r) => r.value === timeRange)?.label ?? ''}
            />
            <ComboboxContent className="w-36">
              <ComboboxEmpty>No results</ComboboxEmpty>
              <ComboboxList>
                {timeRanges.map((item) => (
                  <ComboboxItem key={item.value} value={item.value}>
                    {item.label}
                  </ComboboxItem>
                ))}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          {onExport && (
            <Button type="button" variant="secondary" size="icon" className="size-8" onClick={() => onExport(filteredData)}>
              <DownloadIcon className="size-4" />
              <span className="sr-only">Export visible performance data</span>
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={'fillMobile'} x1="0" y1="0" x2="0" y2="1">
                {metric.kind === 'fps' ? (
                  <>
                    <stop offset="0%" stopColor={metric.color} stopOpacity={1} />
                    <stop offset="50%" stopColor={metric.color} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={`var(--color-red-500)`} stopOpacity={0.1} />
                  </>
                ) : (
                  <>
                    <stop offset="5%" stopColor={metric.color} stopOpacity={1} />
                    <stop offset="50%" stopColor={metric.color} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={metric.color} stopOpacity={0.3} />
                  </>
                )}
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="time"
              tickLine={true}
              axisLine={true}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                return formatXAxis(value);
              }}
            />
            <YAxis
              dataKey="value"
              tickLine={true}
              axisLine={true}
              tickMargin={2}
              minTickGap={1}
              tickFormatter={(value) => formatValue(value)}
            />
            {(dataKey === 'frameTime' || dataKey === 'frameTimeMax') && (
              <>
                <ReferenceLine y={16.67} stroke="var(--color-green-500)" strokeDasharray="4 4" label="60 FPS" />
                <ReferenceLine y={33.33} stroke="var(--color-red-500)" strokeDasharray="4 4" label="30 FPS" />
              </>
            )}
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(_, payload) => {
                    const value = payload?.[0]?.payload?.time || 0;

                    return formatXAxis(value);
                  }}
                  indicator="dot"
                />
              }
            />
            <Area
              isAnimationActive={false}
              dataKey="value"
              type="step"
              fill="url(#fillMobile)"
              stroke={metric.color}
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
