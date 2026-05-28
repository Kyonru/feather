import { forwardRef, useRef, useState } from 'react';
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
import { open } from '@tauri-apps/plugin-dialog';
import { TableVirtuoso } from 'react-virtuoso';
import { LogTypeBadge } from '@/components/log-type-badge';
import { TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/utils/styles';
import { Log } from '@/hooks/use-logs';
import { isWeb } from '@/utils/platform';
import { Input } from './ui/input';
import {
  PauseIcon,
  PlayIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  Trash2Icon,
  UploadIcon,
} from 'lucide-react';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Label } from './ui/label';

// Original Table is wrapped with a <div> (see https://ui.shadcn.com/docs/components/table#radix-:r24:-content-manual),
// but here we don't want it, so let's use a new component with only <table> tag
const TableComponent = forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, tableRef) => (
    <table ref={tableRef} className={cn('w-full caption-bottom text-sm', className)} {...props} />
  ),
);
TableComponent.displayName = 'TableComponent';

export const columns: ColumnDef<Log>[] = [
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => <LogTypeBadge type={row.original.type} className="h-8" />,
    size: 200,
    enableColumnFilter: true,
  },
  {
    accessorKey: 'str',
    header: () => <div className="w-full text-left">Log</div>,
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center gap-2">
        {row.original.count > 1 && (
          <span className="shrink-0 rounded-full bg-muted-foreground/20 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
            {row.original.count}
          </span>
        )}
        <span className="truncate">{row.original.str}</span>
      </div>
    ),
    enableColumnFilter: true,
    size: 500,
  },
  {
    accessorKey: 'time',
    header: () => <div className="w-full text-left">Time</div>,
    cell: ({ row }) => <span>{new Date(row.original.time * 1000).toLocaleTimeString()}</span>,
    enableColumnFilter: true,
  },
];

const TableRowComponent = <TData,>(rows: Row<TData>[], onRowSelection?: (id: string) => void) =>
  function getTableRow(props: React.HTMLAttributes<HTMLTableRowElement>) {
    // @ts-expect-error data-index is a valid attribute
    const index = props['data-index'];
    const row = rows[index];

    if (!row) return null;

    return (
      <TableRow
        key={row.id}
        data-state={row.getIsSelected() && 'selected'}
        className="relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80"
        {...props}
        onPointerDown={(event) => {
          props.onPointerDown?.(event);
          if (event.button !== 0) return;
          row.toggleSelected(true);
          onRowSelection?.(row.id);
        }}
        onClick={(event) => {
          props.onClick?.(event);
          row.toggleSelected(true);
          onRowSelection?.(row.id);
        }}
      >
        {row.getVisibleCells().map((cell) => (
          <TableCell key={cell.id}>
            <div className="max-w-80 truncate">{flexRender(cell.column.columnDef.cell, cell.getContext())}</div>
          </TableCell>
        ))}
      </TableRow>
    );
  };

export const ACCEPTED_LOG_FILE_TYPES: string[] = ['featherlog'] as const;

export function DataTable({
  data,
  onRowSelection,
  onClear,
  isPaused,
  onPlayPause,
  showSearch,
  screenshotEnabled,
  onScreenshotChange,
  onUpload,
}: {
  data: Log[];
  onRowSelection?: (id: string) => void;
  onClear?: () => void;
  isPaused: boolean;
  onPlayPause: () => void;
  rowSelection?: Record<string, boolean>;
  showSearch?: boolean;
  screenshotEnabled?: boolean;
  onScreenshotChange?: () => void;
  onUpload?: (pathname: string) => void;
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const pathname = e.target.value;

    if (pathname) {
      onUpload?.(pathname);
    }
  };

  const onSelectFile = async () => {
    if (isWeb()) {
      fileInputRef.current?.click();
      return;
    }

    const file = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Log Files', extensions: ACCEPTED_LOG_FILE_TYPES }],
    });

    if (file) {
      onUpload?.(file);
    }
  };

  return (
    <Tabs defaultValue="outline" className="flex min-h-0 w-full flex-1 flex-col justify-start gap-6">
      <TabsContent value="outline" className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 lg:px-6">
        {showSearch && (
          <div className="flex items-center gap-2 mt-2">
            <Input placeholder="Search..." onChange={(e) => table.setGlobalFilter(String(e.target.value))} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="icon" onClick={onPlayPause}>
                  {isPaused ? (
                    <PlayIcon className="text-green-500 cursor-pointer" />
                  ) : (
                    <PauseIcon className="text-blue-500 cursor-pointer" />
                  )}
                  <span className="sr-only">{isPaused ? 'Paused' : 'Playing'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isPaused ? 'Paused' : 'Playing'}</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="icon" onClick={onClear}>
                  <Trash2Icon className=" text-orange-500 cursor-pointer" />
                  <span className="sr-only">Clear history</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Clear history</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="secondary" size="icon" onClick={onScreenshotChange}>
                  {screenshotEnabled ? (
                    <ScreenShareIcon className=" text-green-500 cursor-pointer" />
                  ) : (
                    <ScreenShareOffIcon className=" text-red-500 cursor-pointer" />
                  )}
                  <span className="sr-only">{screenshotEnabled ? 'Disable Screenshots' : 'Enable Screenshots'}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{screenshotEnabled ? 'Disable Screenshots' : 'Enable Screenshots'}</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              {isWeb() ? (
                <Dialog>
                  <TooltipTrigger asChild>
                    <DialogTrigger asChild>
                      <Button variant="secondary" size="icon">
                        <UploadIcon className=" text-yellow-500 cursor-pointer" />
                        <span className="sr-only">Upload logs</span>
                      </Button>
                    </DialogTrigger>
                  </TooltipTrigger>
                  <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                      <DialogTitle>Use log file</DialogTitle>
                      <DialogDescription>Upload a log file to use instead of the default one.</DialogDescription>
                    </DialogHeader>

                    <Label htmlFor="name-1">pathname</Label>
                    <Input id="name-1" name="name" onChange={onFileChange} />
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Save</Button>
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              ) : (
                <TooltipTrigger asChild>
                  <Button variant="secondary" size="icon" onClick={onSelectFile}>
                    <UploadIcon className=" text-yellow-500 cursor-pointer" />
                    <span className="sr-only">Use log file</span>
                  </Button>
                </TooltipTrigger>
              )}
              <TooltipContent>
                <p>Use log file</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
          <TableVirtuoso
            style={{ height: '100%' }}
            totalCount={rows.length}
            components={{
              Table: TableComponent,
              TableRow: TableRowComponent(rows, onRowSelection),
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
