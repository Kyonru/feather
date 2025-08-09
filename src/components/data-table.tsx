import * as React from "react";
import {
  IconClockRecord,
  IconLoader,
  IconWashDrycleanOff,
  IconDoorExit,
} from "@tabler/icons-react";
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  Row,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";

import { TableVirtuoso } from "react-virtuoso";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  CircleX,
  CircleXIcon,
  ClockAlert,
  Feather,
  FeatherIcon,
  FileClock,
  FileClockIcon,
} from "lucide-react";
import { on } from "events";
import { Log } from "@/hooks/use-logs";

// Original Table is wrapped with a <div> (see https://ui.shadcn.com/docs/components/table#radix-:r24:-content-manual),
// but here we don't want it, so let's use a new component with only <table> tag
const TableComponent = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <table
    ref={ref}
    className={cn("w-full caption-bottom text-sm", className)}
    {...props}
  />
));
TableComponent.displayName = "TableComponent";

const LogTypeIcon = ({ type }: { type: string }) => {
  if (type === "output") {
    return <FileClockIcon className="text-gray-700 dark:text-gray-400" />;
  }

  if (type === "error") {
    return <CircleXIcon className="text-red-700 dark:text-red-400" />;
  }

  if (type === "feather:finish" || type === "feather:start") {
    return <FeatherIcon className="text-yellow-700 dark:text-yellow-400" />;
  }

  return <ClockAlert className="text-cyan-700 dark:text-cyan-400" />;
};

export const BadgeType = ({ type }: { type: string }) => {
  return (
    <Badge variant="outline" className="text-muted-foreground px-1.5">
      <LogTypeIcon type={type} />
      {type}
    </Badge>
  );
};

export const columns: ColumnDef<Log>[] = [
  {
    accessorKey: "count",
    header: () => <div className="text-left">Count</div>,
    size: 50,
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => <BadgeType type={row.original.type} />,
    size: 150,
  },
  {
    accessorKey: "str",
    header: () => <div className="w-full text-left">Log</div>,
  },
  {
    accessorKey: "time",
    header: () => <div className="w-full text-left">Timestamp</div>,
  },
];

const TableRowComponent = <TData,>(
  rows: Row<TData>[],
  onRowClick?: (index: number) => void
) =>
  function getTableRow(props: React.HTMLAttributes<HTMLTableRowElement>) {
    // @ts-expect-error data-index is a valid attribute
    const index = props["data-index"];
    const row = rows[index];

    if (!row) return null;

    return (
      <TableRow
        key={row.id}
        onClick={() => onRowClick?.(index)}
        data-state={row.getIsSelected() && "selected"}
        className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
        {...props}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            <p className="truncate max-w-80">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </p>
          </TableCell>
        ))}
      </TableRow>
    );
  };

export function DataTable({
  data,
  onRowClick,
  rowSelection,
}: {
  data: Log[];
  onRowClick?: (index: number) => void;
  rowSelection?: Record<string, boolean>;
}) {
  const [_, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection: rowSelection ?? {},
      columnFilters,
    },
    getRowId: (row) => row.id,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const rows = table.getRowModel().rows;

  return (
    <Tabs
      defaultValue="outline"
      className="w-full flex-col justify-start gap-6"
    >
      <TabsContent
        value="outline"
        className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6"
      >
        <div className="overflow-hidden rounded-lg border">
          <TableVirtuoso
            style={{ height: 500 }}
            totalCount={rows.length}
            components={{
              Table: TableComponent,
              TableRow: TableRowComponent(rows, onRowClick),
              TableHead: TableHeader,
            }}
            fixedHeaderContent={() =>
              table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  className="bg-card hover:bg-muted"
                  key={headerGroup.id}
                >
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead
                        style={{
                          width: header.getSize(),
                        }}
                        key={header.id}
                        colSpan={header.colSpan}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              ))
            }
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}
