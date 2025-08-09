import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { useIsMobile } from "@/hooks/use-mobile";
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PerformanceMetrics } from "@/hooks/use-performance";

export const description = "An interactive area chart";

const chartConfig = {
  fps: {
    label: "FPS",
    color: "var(--chart-2)",
  },
  memory: {
    label: "Memory",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const timeRanges = [
  {
    label: "Last 3 seconds",
    value: "3s",
  },
  {
    label: "Last 5 seconds",
    value: "5s",
  },
  {
    label: "Last 15 seconds",
    value: "15s",
  },
];

export function ChartAreaInteractive({
  title,
  data,
  dataKey = "fps",
}: {
  dataKey?: "fps" | "memory";
  title: string;
  data: PerformanceMetrics[];
}) {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState("5s");

  React.useEffect(() => {
    if (isMobile) {
      setTimeRange("3s");
    }
  }, [isMobile]);

  const filteredData = data.filter((item) => {
    const date = new Date(item.time * 1000);
    const referenceDate = new Date(data[data.length - 1].time * 1000);
    let secondsToSubtract = 3;
    if (timeRange === "5s") {
      secondsToSubtract = 5;
    } else if (timeRange === "15s") {
      secondsToSubtract = 15;
    }
    const startDate = new Date(
      referenceDate.getTime() - secondsToSubtract * 1000
    );
    return date >= startDate;
  });

  const formatXAxis = (value: number) => {
    const date = new Date(value * 1000);

    const rtf1 = new Intl.RelativeTimeFormat("en", {
      style: "short",
    });

    const diff = (new Date().getTime() - date.getTime()) / 1000;

    console.log({
      diff,
      value,
      date,
      now: new Date().getTime(),
    });

    return rtf1.format(-Math.round(diff), "second");
  };

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardAction>
          <ToggleGroup
            type="single"
            value={timeRange}
            onValueChange={setTimeRange}
            variant="outline"
            className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
          >
            {timeRanges.map((item) => (
              <ToggleGroupItem value={item.value}>{item.label}</ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger
              className="flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden"
              size="sm"
              aria-label="Select a value"
            >
              <SelectValue placeholder="Last 3 months" />
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {timeRanges.map((item) => (
                <SelectItem value={item.value} className="rounded-lg">
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <AreaChart data={filteredData}>
            <defs>
              <linearGradient id={"fillMobile"} x1="0" y1="0" x2="0" y2="1">
                {dataKey === "fps" ? (
                  <>
                    <stop
                      offset="0%"
                      stopColor={`var(--color-${dataKey})`}
                      stopOpacity={1}
                    />
                    <stop
                      offset="50%"
                      stopColor={`var(--color-${dataKey})`}
                      stopOpacity={0.6}
                    />
                    <stop
                      offset="100%"
                      stopColor={`var(--color-red-500)`}
                      stopOpacity={0.1}
                    />
                  </>
                ) : (
                  <>
                    <stop
                      offset="5%"
                      stopColor={`var(--color-red-500)`}
                      stopOpacity={1}
                    />
                    <stop
                      offset="95%"
                      stopColor={`var(--color-${dataKey})`}
                      stopOpacity={0.3}
                    />
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
                if (dataKey === "fps") {
                  return `${value} FPS`;
                }

                return `${value} MB`;
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
              dataKey={dataKey}
              type="basis"
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
