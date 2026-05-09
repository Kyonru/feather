import { useState } from "react";
import { ChartAreaInteractive } from "@/pages/performance/chart-area-interactive";
import { PageLayout } from "@/components/page-layout";
import { usePerformance } from "@/hooks/use-performance";
import { SectionCards } from "./section-cards";
import { useConfig } from "@/hooks/use-config";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type ChartKey = 'fps' | 'memory' | 'diskUsage';

const chartTitles: Record<ChartKey, string> = {
  fps: 'FPS',
  memory: 'Memory',
  diskUsage: 'Disk Usage',
};

export default function Page() {
  const { data } = usePerformance();
  const [selected, setSelected] = useState<ChartKey>('fps');
  const [diskUsageEnabled, setDiskUsageEnabled] = useState(false);

  const { updateDiskUsage } = useConfig();

  const handleDiskUsageToggle = (enabled: boolean) => {
    setDiskUsageEnabled(enabled);
    updateDiskUsage(enabled);
    if (!enabled && selected === 'diskUsage') {
      setSelected('fps');
    }
  };

  return (
    <PageLayout>
      <div className="flex items-center gap-2 px-4 lg:px-6">
        <Switch
          id="disk-usage-toggle"
          checked={diskUsageEnabled}
          onCheckedChange={handleDiskUsageToggle}
        />
        <Label htmlFor="disk-usage-toggle" className="text-muted-foreground text-sm">
          Track disk usage
        </Label>
      </div>
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive
          dataKey={selected}
          title={chartTitles[selected]}
          data={data}
        />
      </div>
      <SectionCards
        data={data}
        selected={selected}
        onSelect={setSelected}
        diskUsageEnabled={diskUsageEnabled}
      />
    </PageLayout>
  );
}
