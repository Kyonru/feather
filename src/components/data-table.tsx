import { forwardRef, useEffect, useRef, useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/utils/styles';
import { Log, LogType } from '@/hooks/use-logs';
import { isWeb } from '@/utils/platform';
import { Input } from './ui/input';
import { useConfigStore } from '@/store/config';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import {
  CircleXIcon,
  FeatherIcon,
  FileClockIcon,
  FileQuestionMarkIcon,
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

export const BadgeType = ({ type }: { type: string }) => {
  const config = useConfigStore((state) => state.config);

  let color = 'bg-gray-700 dark:bg-gray-400';
  let Icon = <FileQuestionMarkIcon className={color} />;

  if (type === 'output') {
    color = 'bg-cyan-700 dark:bg-cyan-400';
    Icon = <FileClockIcon className={color} />;
  }

  if (type === 'error' || type === 'fatal') {
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
            <DynamicIcon className={cn(color, 'size-3')} name={plugin.icon as IconName} />
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
    cell: ({ row }) => <span>{new Date(row.original.time * 1000).toLocaleTimeString()}</span>,
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

  useEffect(() => {
    if (rowSelection) {
      const selected = Object.keys(rowSelection);
      onRowSelection?.(selected[0]);
    }
  }, [rowSelection]);

  return (
    <Tabs defaultValue="outline" className="flex min-h-0 w-full flex-1 flex-col justify-start gap-6">
      <TabsContent value="outline" className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-auto px-4 lg:px-6">
        {showSearch && (
          <div className="flex items-center gap-2 mt-2">
            <Input placeholder="Search..." onChange={(e) => table.setGlobalFilter(String(e.target.value))} />
            <Tooltip>
              <TooltipTrigger>
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
              <TooltipTrigger>
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
              <TooltipTrigger>
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
              <TooltipTrigger>
                {isWeb() ? (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="secondary" size="icon">
                        <UploadIcon className=" text-yellow-500 cursor-pointer" />
                        <span className="sr-only">Upload logs</span>
                      </Button>
                    </DialogTrigger>
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
                  <Button variant="secondary" size="icon" onClick={onSelectFile}>
                    <UploadIcon className=" text-yellow-500 cursor-pointer" />
                    <span className="sr-only">Use log file</span>
                  </Button>
                )}
              </TooltipTrigger>
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
