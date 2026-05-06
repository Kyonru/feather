import * as React from 'react';
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';

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

export const description = 'An interactive area chart';

const chartConfig = {
  fps: {
    label: 'FPS',
    color: 'var(--chart-2)',
  },
  memory: {
    label: 'Memory',
    color: 'var(--chart-1)',
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
  title,
  data,
  dataKey = 'fps',
}: {
  dataKey?: 'fps' | 'memory';
  title: string;
  data: PerformanceMetrics[];
}) {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState('15s');

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange('15s');
    }
  }, [isMobile]);

  const filteredData = data.filter((item) => {
    const seconds = timeRanges.find((r) => r.value === timeRange)?.seconds ?? 5;
    const referenceDate = new Date(data[data.length - 1].time * 1000);
    const startDate = new Date(referenceDate.getTime() - seconds * 1000);
    return new Date(item.time * 1000) >= startDate;
  });

  const formatXAxis = (value: number) => {
    const lastTime = data[data.length - 1]?.time ?? value;
    const diffSeconds = Math.round(lastTime - value);
    if (diffSeconds === 0) return '0s';
    if (diffSeconds < 60) return `-${diffSeconds}s`;
    const minutes = Math.floor(diffSeconds / 60);
    const seconds = diffSeconds % 60;
    return seconds === 0 ? `-${minutes}m` : `-${minutes}m ${seconds}s`;
  };

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
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
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer config={chartConfig} className="aspect-auto h-[250px] w-full">
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id={'fillMobile'} x1="0" y1="0" x2="0" y2="1">
                {dataKey === 'fps' ? (
                  <>
                    <stop offset="0%" stopColor={`var(--color-${dataKey})`} stopOpacity={1} />
                    <stop offset="50%" stopColor={`var(--color-${dataKey})`} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={`var(--color-red-500)`} stopOpacity={0.1} />
                  </>
                ) : (
                  <>
                    <stop offset="5%" stopColor={`var(--color-red-500)`} stopOpacity={1} />
                    <stop offset="50%" stopColor={`var(--color-${dataKey})`} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={`var(--color-${dataKey})`} stopOpacity={0.3} />
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
              dataKey={dataKey}
              tickLine={true}
              axisLine={true}
              tickMargin={2}
              minTickGap={1}
              tickFormatter={(value) => {
                if (dataKey === 'fps') {
                  return `${value} FPS`;
                }

                return formatMemory(value, 1);
              }}
            />
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
              dataKey={dataKey}
              type="step"
              fill="url(#fillMobile)"
              stroke={`var(--color-${dataKey})`}
              stackId="a"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
