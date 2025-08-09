import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DEFAULT_METRIC, PerformanceMetrics } from "@/hooks/use-performance";
import { cn } from "@/lib/utils";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { useMemo } from "react";

const TrendingBadge = ({ value }: { value: number }) => {
  return (
    <Badge variant="outline">
      {value > 0 ? <TrendingUpIcon /> : value < 0 ? <TrendingDownIcon /> : null}
      {value.toFixed(2)}%
    </Badge>
  );
};

export function SectionCards({
  onSelect,
  selected,
  data,
}: {
  data: PerformanceMetrics[];
  selected: string;
  onSelect: (key: "fps" | "memory") => void;
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
    const last = data[data.length - 1] || DEFAULT_METRIC;
    const first = data[0] || DEFAULT_METRIC;

    return (last.fps - first.fps) / first.fps;
  }, [FPSAverage]);

  const MemoryAverage = useMemo(() => {
    const sum = data.reduce((acc, item) => {
      return acc + item.memory;
    }, 0);

    return sum / data.length;
  }, [data]);

  const MemoryIncrease = useMemo(() => {
    const last = data[data.length - 1] || DEFAULT_METRIC;
    const first = data[0] || DEFAULT_METRIC;

    return (last.memory - first.memory) / first.memory;
  }, [MemoryAverage]);

  return (
    <div className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card dark:*:data-[slot=card]:bg-card grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-3 @5xl/main:grid-cols-5">
      <Card
        className={cn({
          "@container/card": true,
          "hover:bg-sky-500": true,
          "active:bg-sky-900": true,
          "bg-sky-700": selected === "fps",
        })}
        onClick={() => onSelect("fps")}
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
          <div className="text-black">{metric.frameTime.toFixed(2)} ms</div>
        </CardFooter>
      </Card>
      <Card
        className={cn({
          "@container/card": true,
          "hover:bg-sky-500": true,
          "active:bg-sky-900": true,
          "bg-sky-700": selected === "memory",
        })}
        onClick={() => onSelect("memory")}
      >
        <CardHeader>
          <CardDescription>Memory</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {metric.memory.toFixed(2)} MB
          </CardTitle>
          <CardAction>
            <TrendingBadge value={MemoryIncrease} />
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Texture Memory
          </div>
          <div className="text-muted-foreground">
            {metric.stats.texturememory} MB
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Active Canvases</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {metric.stats.canvases}
          </CardTitle>
        </CardHeader>
        <div className="grid grid-cols-2 gap-4">
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              Canvas Switches
            </div>
            <div className="text-muted-foreground">
              {metric.stats.canvasswitches}
            </div>
          </CardFooter>
          <CardFooter className="flex-col items-start gap-1.5 text-sm">
            <div className="line-clamp-1 flex gap-2 font-medium">
              Shader Switches
            </div>
            <div className="text-muted-foreground">
              {metric.stats.shaderswitches}
            </div>
          </CardFooter>
        </div>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Draw Calls</CardDescription>
          <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
            {metric.stats.drawcalls}
          </CardTitle>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          <div className="line-clamp-1 flex gap-2 font-medium">
            Draw calls batched
          </div>
          <div className="text-muted-foreground">
            {metric.stats.drawcallsbatched}
          </div>
        </CardFooter>
      </Card>
      <Card className="@container/card">
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
