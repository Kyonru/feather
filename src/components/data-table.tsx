import { forwardRef, useEffect, useState } from 'react';
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
  RowSelectionState,
  SortingState,
  useReactTable,
  VisibilityState,
} from '@tanstack/react-table';
import { TableVirtuoso } from 'react-virtuoso';
import { Badge } from '@/components/ui/badge';
import { TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/utils/styles';
import { Log, LogType } from '@/hooks/use-logs';
import { Input } from './ui/input';
import { useConfigStore } from '@/store/config';
import { DynamicIcon } from 'lucide-react/dynamic';
import {
  CircleXIcon,
  FeatherIcon,
  FileClockIcon,
  FileQuestionMarkIcon,
  PauseIcon,
  PlayIcon,
  Trash2Icon,
} from 'lucide-react';
import { Button } from './ui/button';

// Original Table is wrapped with a <div> (see https://ui.shadcn.com/docs/components/table#radix-:r24:-content-manual),
// but here we don't want it, so let's use a new component with only <table> tag
const TableComponent = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, tableRef) => (
    <table ref={tableRef} className={cn('w-full caption-bottom text-sm', className)} {...props} />
  ),
);
TableComponent.displayName = 'TableComponent';

export const BadgeType = ({ type }: { type: string }) => {
  const config = useConfigStore((state) => state.config);

  let color = 'bg-gray-700 dark:bg-gray-400';
  let Icon = <FileQuestionMarkIcon className={color} />;

  if (type === 'output') {
    color = 'bg-cyan-700 dark:bg-cyan-400';
    Icon = <FileClockIcon className={color} />;
  }

  if (type === 'error') {
    color = 'bg-red-700 dark:bg-red-400';
    Icon = <CircleXIcon className={color} />;
  }

  if (type === LogType.FEATHER_FINISH || type === LogType.FEATHER_START) {
    color = 'bg-yellow-700 dark:bg-yellow-400';
    Icon = <FeatherIcon className={color} />;
  }

  if (config && config.plugins) {
    const pluginKey = Object.keys(config.plugins).find((key) => {
      if (!config.plugins[key].type) {
        return false;
      }

      return type.includes(config.plugins[key].type);
    });

    if (pluginKey) {
      const plugin = config.plugins[pluginKey];

      if (plugin.icon) {
        Icon = (
          <div
            style={{
              width: 12,
            }}
          >
            <DynamicIcon className={cn(color, 'size-3')} name={plugin.icon} />
          </div>
        );
      }

      // TODO: Fix color not being applied
      // if (plugin.color) {
      //   const temp = plugin.color.trim().toLowerCase();
      //   color = ` bg-[${temp}]`;
      // }
    }
  }

  return (
    <Badge variant="default" className={`${color} h-8 min-w-16 px-1.5`}>
      {Icon}
      {type}
    </Badge>
  );
};

export const columns: ColumnDef<Log>[] = [
  {
    accessorKey: 'count',
    header: () => <div className="text-left">Count</div>,
    size: 50,
    enableColumnFilter: true,
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => <BadgeType type={row.original.type} />,
    size: 200,
    enableColumnFilter: true,
  },
  {
    accessorKey: 'str',
    header: () => <div className="w-full text-left">Log</div>,
    enableColumnFilter: true,
    size: 500,
  },
  {
    accessorKey: 'time',
    header: () => <div className="w-full text-left">Time</div>,
    cell: ({ row }) => <span>{new Date(row.original.time * 1000).toLocaleString()}</span>,
    enableColumnFilter: true,
  },
];

const TableRowComponent = <TData,>(rows: Row<TData>[]) =>
  function getTableRow(props: React.HTMLAttributes<HTMLTableRowElement>) {
    // @ts-expect-error data-index is a valid attribute
    const index = props['data-index'];
    const row = rows[index];

    if (!row) return null;

    return (
      <TableRow
        key={row.id}
        onClick={() => row.toggleSelected()}
        data-state={row.getIsSelected() && 'selected'}
        className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
        {...props}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            <p className="truncate max-w-80">{flexRender(cell.column.columnDef.cell, cell.getContext())}</p>
          </TableCell>
        ))}
      </TableRow>
    );
  };

export function DataTable({
  data,
  onRowSelection,
  onClear,
  isPaused,
  onPlayPause,
  showSearch,
}: {
  data: Log[];
  onRowSelection?: (id: string) => void;
  onClear?: () => void;
  isPaused: boolean;
  onPlayPause: () => void;
  rowSelection?: Record<string, boolean>;
  showSearch?: boolean;
}) {
  const [globalFilter, setGlobalFilter] = useState<unknown>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);

  function globalFilterFn(row: Row<unknown>, _: string, filterValue: unknown) {
    return (
      String(row.getValue('str')).toLowerCase().includes(String(filterValue).toLowerCase()) ||
      String(row.getValue('type')).toLowerCase().includes(String(filterValue).toLowerCase())
    );
  }

  const table = useReactTable({
    data,
    columns,
    state: {
      rowSelection,
      globalFilter,
      sorting,
      columnVisibility,
      columnFilters,
    },
    enableFilters: true,
    enableGlobalFilter: true,
    globalFilterFn: globalFilterFn,
    getRowId: (row) => row.id,
    enableRowSelection: true,
    enableMultiRowSelection: false,
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const rows = table.getRowModel().rows;

  useEffect(() => {
    if (rowSelection) {
      const selected = Object.keys(rowSelection);
      onRowSelection?.(selected[0]);
    }
  }, [rowSelection]);

  return (
    <Tabs defaultValue="outline" className="w-full flex-col justify-start gap-6">
      <TabsContent value="outline" className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        {showSearch && (
          <div className="flex items-center gap-2 mt-2">
            <Input placeholder="Search..." onChange={(e) => table.setGlobalFilter(String(e.target.value))} />

            <Button variant="secondary" size="icon" onClick={onPlayPause}>
              {isPaused ? (
                <PlayIcon className="text-green-500 cursor-pointer" />
              ) : (
                <PauseIcon className="text-blue-500 cursor-pointer" />
              )}
              <span className="sr-only">Pause</span>
            </Button>

            <Button variant="secondary" size="icon" onClick={onClear}>
              <Trash2Icon className=" text-orange-500 cursor-pointer" />
              <span className="sr-only">Clear history</span>
            </Button>
          </div>
        )}
        <div className="overflow-hidden rounded-lg border">
          <TableVirtuoso
            style={{ height: window.innerHeight - 180 }}
            totalCount={rows.length}
            components={{
              Table: TableComponent,
              TableRow: TableRowComponent(rows),
              TableHead: TableHeader,
            }}
            fixedHeaderContent={() =>
              table.getHeaderGroups().map((headerGroup) => (
                <TableRow className="bg-card hover:bg-muted" key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead
                        style={{
                          width: header.getSize(),
                        }}
                        key={header.id}
                        colSpan={header.colSpan}
                      >
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
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
