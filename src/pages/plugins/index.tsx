import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { SectionCards } from "@/components/section-cards";
import { PageLayout } from "@/components/page-layout";

export default function Page() {
  return (
    <PageLayout>
      <SectionCards />
      <div className="px-4 lg:px-6">
        <ChartAreaInteractive />
      </div>
    </PageLayout>
  );
}
