import * as React from "react";
import { IconCircleCheckFilled, IconLoader } from "@tabler/icons-react";
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
import { z } from "zod";
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

export const schema = z.object({
  id: z.string(),
  count: z.number(),
  time: z.number(),
  number: z.string(),
  str: z.string(),
  type: z.string(),
});

export const columns: ColumnDef<z.infer<typeof schema>>[] = [
  {
    accessorKey: "count",
    header: () => <div className="text-left">Count</div>,
    cell: ({ row }) => <Label>{row.original.count}</Label>,
  },
  {
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => (
      <Badge variant="outline" className="text-muted-foreground px-1.5">
        {row.original.type === "Output" ? (
          <IconCircleCheckFilled className="fill-green-500 dark:fill-green-400" />
        ) : (
          <IconLoader />
        )}
        {row.original.type}
      </Badge>
    ),
  },
  {
    accessorKey: "str",
    header: () => <div className="w-full text-left">Log</div>,
    cell: ({ row }) => <Label>{row.original.str}</Label>,
  },
  {
    accessorKey: "time",
    header: () => <div className="w-full text-left">Timestamp</div>,
    cell: ({ row }) => <Label>{row.original.time}</Label>,
  },
];

const TableRowComponent = <TData,>(rows: Row<TData>[]) =>
  function getTableRow(props: React.HTMLAttributes<HTMLTableRowElement>) {
    // @ts-expect-error data-index is a valid attribute
    const index = props["data-index"];
    const row = rows[index];

    if (!row) return null;

    return (
      <TableRow
        key={row.id}
        data-state={row.getIsSelected() && "selected"}
        className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
        {...props}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            <p
              className="overflow-hidden ellipsis"
              style={{
                maxWidth: 100,
              }}
            >
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </p>
          </TableCell>
        ))}
      </TableRow>
    );
  };

export function DataTable({ data }: { data: z.infer<typeof schema>[] }) {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);

  console.log(data);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
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
              TableRow: TableRowComponent(rows),
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
