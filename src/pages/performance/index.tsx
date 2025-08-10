import { useState } from "react";
import { ChartAreaInteractive } from "@/pages/performance/chart-area-interactive";
import { PageLayout } from "@/components/page-layout";
import { usePerformance } from "@/hooks/use-performance";
import { SectionCards } from "./section-cards";
import { useConfig } from "@/hooks/use-config";

export default function Page() {
  const { data } = usePerformance();
  const [selected, setSelected] = useState<"fps" | "memory">("fps");

  const onSelect = (key: "fps" | "memory") => {
    setSelected(key);
  };

  useConfig();

  return (
    <PageLayout>
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive
          dataKey={selected}
          title={selected === "fps" ? "FPS" : "Memory"}
          data={data}
        />
      </div>
      <SectionCards data={data} selected={selected} onSelect={onSelect} />
    </PageLayout>
  );
}
