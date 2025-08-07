import { ColumnDef } from "@tanstack/react-table";
import "./App.css";
import { unionBy } from "./utils/arrays";
import { useQuery } from "@tanstack/react-query";
//
export const columns: ColumnDef<{}>[] = [
  {
    accessorKey: "count",
    header: "Count",
  },
  {
    accessorKey: "type",
    header: "Type",
  },
  {
    accessorKey: "str",
    header: () => "Log",
    cell: (info) => info.getValue() as string,
    size: 250, //starting column size
    maxSize: 250, //enforced during column resizing
  },
  {
    accessorKey: "time",
    header: "Timestamp",
  },
];

import { AppSidebar } from "@/components/app-sidebar";
import { ChartAreaInteractive } from "@/components/chart-area-interactive";
import { DataTable } from "@/components/data-table";
import { SectionCards } from "@/components/section-cards";
import { SiteHeader } from "@/components/site-header";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
export default function Page() {
  const { isPending, error, data } = useQuery({
    initialData: [],
    queryKey: ["repoData"],
    queryFn: async () => {
      const response = await fetch("http://localhost:4004/config?p=feather");
      const dataLogs = await response.json();
      const logs = unionBy(data || [], dataLogs, (item) => item.id);
      return logs;
    },
    refetchInterval: 1000,
  });

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset>
        <SiteHeader />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
              <SectionCards />
              <div className="px-4 lg:px-6">
                <ChartAreaInteractive />
              </div>
              <DataTable data={data} />
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
