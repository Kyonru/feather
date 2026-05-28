import { open } from '@tauri-apps/plugin-dialog';
import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { Virtuoso } from 'react-virtuoso';
import {
  PauseIcon,
  PlayIcon,
  ScreenShareIcon,
  ScreenShareOffIcon,
  Trash2Icon,
  UploadIcon,
  ChevronsDownIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LogTypeBadge } from '@/components/log-type-badge';
import type { Log } from '@/hooks/use-logs';
import { LogType } from '@/hooks/use-logs';
import { cn } from '@/utils/styles';
import { isWeb } from '@/utils/platform';

const ACCEPTED_LOG_FILE_TYPES = ['featherlog'] as const;
type LogFilter = 'all' | 'output' | 'error' | 'fatal' | 'feather' | 'plugin';

const FILTERS: Array<{ value: LogFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'output', label: 'Output' },
  { value: 'error', label: 'Errors' },
  { value: 'fatal', label: 'Fatal' },
  { value: 'feather', label: 'Feather' },
  { value: 'plugin', label: 'Plugins' },
];

function isFeatherEvent(type: string) {
  return type === LogType.FEATHER_FINISH || type === LogType.FEATHER_START;
}

function matchesTypeFilter(log: Log, filter: LogFilter) {
  if (filter === 'all') return true;
  if (filter === 'feather') return isFeatherEvent(log.type);
  if (filter === 'plugin') return !['output', 'error', 'fatal'].includes(log.type) && !isFeatherEvent(log.type);
  return log.type === filter;
}

function relativeTime(seconds: number) {
  const diff = Math.max(0, Math.floor(Date.now() / 1000 - seconds));
  if (diff < 5) return 'now';
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  return `${Math.floor(diff / 3600)}h`;
}

export function LogTable({
  logs,
  selectedId,
  screenshotEnabled,
  isPaused,
  onSelect,
  onClear,
  onPlayPause,
  onScreenshotChange,
  onUpload,
}: {
  logs: Log[];
  selectedId: string | null;
  screenshotEnabled: boolean;
  isPaused: boolean;
  onSelect: (id: string) => void;
  onClear: (visibleIds: string[]) => void;
  onPlayPause: () => void;
  onScreenshotChange: () => void;
  onUpload: (pathname: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<LogFilter>('all');
  const [followTail, setFollowTail] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredLogs = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (!matchesTypeFilter(log, typeFilter)) return false;
      if (!needle) return true;
      return log.str.toLowerCase().includes(needle) || log.type.toLowerCase().includes(needle);
    });
  }, [logs, search, typeFilter]);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const pathname = event.target.value;
    if (pathname) onUpload(pathname);
  };

  const onSelectFile = async () => {
    if (isWeb()) {
      fileInputRef.current?.click();
      return;
    }

    const file = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Log Files', extensions: [...ACCEPTED_LOG_FILE_TYPES] }],
    });

    if (typeof file === 'string') onUpload(file);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 py-3 lg:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 min-w-48 flex-1 text-xs"
          placeholder="Search logs..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <div className="flex flex-wrap gap-1">
          {FILTERS.map((filter) => (
            <Button
              key={filter.value}
              type="button"
              size="sm"
              variant={typeFilter === filter.value ? 'default' : 'outline'}
              className="h-8 px-2 text-xs"
              onClick={() => setTypeFilter(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="icon" className="size-8" onClick={onPlayPause}>
              {isPaused ? <PlayIcon className="size-4 text-green-500" /> : <PauseIcon className="size-4 text-blue-500" />}
              <span className="sr-only">{isPaused ? 'Resume logs' : 'Pause logs'}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isPaused ? 'Resume logs' : 'Pause logs'}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={followTail ? 'default' : 'secondary'}
              size="icon"
              className="size-8"
              onClick={() => setFollowTail((value) => !value)}
            >
              <ChevronsDownIcon className="size-4" />
              <span className="sr-only">{followTail ? 'Disable follow tail' : 'Enable follow tail'}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{followTail ? 'Following tail' : 'Follow tail'}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="icon" className="size-8" onClick={() => onClear(filteredLogs.map((log) => log.id))}>
              <Trash2Icon className="size-4 text-orange-500" />
              <span className="sr-only">Clear visible logs</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Clear visible logs</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="secondary" size="icon" className="size-8" onClick={onScreenshotChange}>
              {screenshotEnabled ? (
                <ScreenShareIcon className="size-4 text-green-500" />
              ) : (
                <ScreenShareOffIcon className="size-4 text-red-500" />
              )}
              <span className="sr-only">{screenshotEnabled ? 'Disable screenshots' : 'Enable screenshots'}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{screenshotEnabled ? 'Disable screenshots' : 'Enable screenshots'}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          {isWeb() ? (
            <Dialog>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button variant="secondary" size="icon" className="size-8">
                    <UploadIcon className="size-4 text-yellow-500" />
                    <span className="sr-only">Upload logs</span>
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                  <DialogTitle>Use Log File</DialogTitle>
                  <DialogDescription>Enter a log file path to use instead of the live session logs.</DialogDescription>
                </DialogHeader>

                <Label htmlFor="log-file-path">Pathname</Label>
                <Input id="log-file-path" name="name" onChange={onFileChange} />
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Save</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <TooltipTrigger asChild>
              <Button variant="secondary" size="icon" className="size-8" onClick={onSelectFile}>
                <UploadIcon className="size-4 text-yellow-500" />
                <span className="sr-only">Use log file</span>
              </Button>
            </TooltipTrigger>
          )}
          <TooltipContent>
            <p>Use log file</p>
          </TooltipContent>
        </Tooltip>
      </div>

      <div className="grid grid-cols-[7.5rem_minmax(0,1fr)_7rem] items-center gap-3 rounded-t-lg border border-b-0 bg-card px-3 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Type</span>
        <span>Log</span>
        <span className="text-right">Time</span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-b-lg border">
        <Virtuoso
          className="h-full"
          data={filteredLogs}
          followOutput={followTail ? 'smooth' : false}
          itemContent={(_, log) => {
            const selected = selectedId === log.id;
            const isProblem = log.type === 'error' || log.type === 'fatal';
            const title = new Date((log.lastTime ?? log.time) * 1000).toLocaleString();
            return (
              <button
                type="button"
                className={cn(
                  'grid w-full grid-cols-[7.5rem_minmax(0,1fr)_7rem] items-center gap-3 border-b px-3 py-2 text-left text-xs transition-colors',
                  !selected && 'hover:bg-muted/60',
                  isProblem && 'bg-red-500/5 text-red-950 dark:text-red-100',
                  selected && 'bg-primary/10 ring-1 ring-inset ring-primary/30',
                )}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  onSelect(log.id);
                }}
                onClick={() => onSelect(log.id)}
              >
                <LogTypeBadge type={log.type} className="h-7" />
                <span className="flex min-w-0 items-center gap-2">
                  {log.count > 1 && (
                    <span className="shrink-0 rounded-full bg-muted-foreground/20 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                      {log.count}
                    </span>
                  )}
                  <span className="truncate">{log.str}</span>
                </span>
                <span className="text-right text-[10px] tabular-nums text-muted-foreground" title={title}>
                  {relativeTime(log.lastTime ?? log.time)}
                </span>
              </button>
            );
          }}
        />
      </div>
    </div>
  );
}
