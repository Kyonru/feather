import { useSessionStore, type SessionInfo } from '@/store/session';
import { Config, useConfigStore } from '@/store/config';
import { useQueryClient } from '@tanstack/react-query';
import { sessionQueryKey, type TimeTravelFrame, type TimeTravelStatus } from '@/hooks/use-ws-connection';
import { requestAllData } from '@/hooks/use-server-polling';
import { cn } from '@/utils/styles';
import {
  MonitorIcon,
  CircleIcon,
  TriangleAlertIcon,
  ShieldOffIcon,
  AppWindowIcon,
  BotIcon,
  GlobeIcon,
  AppWindowMacIcon,
  Smartphone,
  BirdIcon,
  XIcon,
  RefreshCwIcon,
  PlusIcon,
  FileTextIcon,
  ClockIcon,
} from 'lucide-react';
import { version } from '../../package.json';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

const osIcons: Record<string, React.ReactNode> = {
  Windows: <AppWindowIcon className="size-3" />,
  Linux: <BirdIcon className="size-3" />,
  MacOS: <AppWindowMacIcon className="size-3" />,
  'OS X': <AppWindowMacIcon className="size-3" />,
  Web: <GlobeIcon className="size-3" />,
  Android: <BotIcon className="size-3" />,
  iOS: <Smartphone className="size-3" />,
};

const fileName = (path: string) => path.split(/[\\/]/).pop() || path;
const folderName = (path: string) => path.replace(/[\\/][^\\/]*$/, '');

function createFileConfig(path: string, name: string): Config {
  return {
    plugins: {},
    root_path: folderName(path),
    version,
    API: 0,
    sampleRate: 1,
    outfile: path,
    language: 'lua',
    captureScreenshot: false,
    location: '',
    sourceDir: folderName(path),
    sessionName: name,
  };
}

function SessionTab({
  session,
  isActive,
  onClick,
  onRemove,
  onReload,
  versionMismatch,
}: {
  session: SessionInfo;
  isActive: boolean;
  onClick: () => void;
  onRemove: () => void;
  onReload: () => void;
  versionMismatch: boolean;
}) {
  const osIcon = session.os ? osIcons[session.os] : undefined;
  const FileIcon = session.kind === 'time-travel-file' ? ClockIcon : session.kind === 'log-file' ? FileTextIcon : null;

  const tab = (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'group relative flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
            'hover:bg-accent hover:text-accent-foreground',
            isActive && 'bg-background text-foreground shadow-sm border border-border',
            !isActive && 'text-muted-foreground',
          )}
        >
          <button onClick={onClick} className="flex items-center gap-1.5">
            <CircleIcon
              className={cn('size-2 fill-current', session.connected ? 'text-green-500' : 'text-muted-foreground/50')}
            />
            {FileIcon ? <FileIcon className="size-3" /> : osIcon ? <span className="text-xs">{osIcon}</span> : <MonitorIcon className="size-3" />}
            <span className="max-w-[100px] truncate">{session.name || session.id.slice(0, 8)}</span>
            {versionMismatch && <TriangleAlertIcon className="size-3 text-yellow-500" />}
            {session.insecure && <ShieldOffIcon className="size-3 text-orange-400" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="opacity-0 group-hover:opacity-100 -mr-1 rounded hover:text-foreground transition-opacity"
            aria-label="Remove session"
          >
            <XIcon className="size-3" />
          </button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onReload} disabled={!session.connected}>
          <RefreshCwIcon className="size-3.5" />
          Reload session
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={onRemove} variant="destructive">
          <XIcon className="size-3.5" />
          Remove
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );

  if (versionMismatch) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{tab}</TooltipTrigger>
        <TooltipContent>
          <p>Version mismatch — game library differs from desktop app (v{version})</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  if (session.insecure) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{tab}</TooltipTrigger>
        <TooltipContent>
          <p>Insecure connection — set appId in feather.config.lua to bind to this desktop</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return tab;
}

export function SessionTabs() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.sessionId);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const addSession = useSessionStore((state) => state.addSession);
  const removeSession = useSessionStore((state) => state.removeSession);
  const setConfig = useConfigStore((state) => state.setConfig);
  const setLogOverride = useConfigStore((state) => state.setLogOverride);
  const setDisconnected = useConfigStore((state) => state.setDisconnected);

  const sessionList = Object.values(sessions);

  const handleSessionClick = (session: SessionInfo) => {
    setActiveSession(session.id);
    setDisconnected(session.kind ? false : !session.connected);
    setLogOverride(session.kind === 'log-file' ? session.filePath : undefined);
    const cachedConfig = queryClient.getQueryData<Config>(sessionQueryKey.config(session.id));
    if (cachedConfig) {
      setConfig(cachedConfig);
    }
  };

  const addFileSession = (session: SessionInfo, config: Config) => {
    addSession(session);
    setActiveSession(session.id);
    setConfig(config);
    setDisconnected(false);
    queryClient.setQueryData(sessionQueryKey.config(session.id), config);
  };

  const openLogFile = async () => {
    try {
      const path = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: 'Feather Logs', extensions: ['featherlog'] }],
      });
      if (!path || typeof path !== 'string') return;

      const name = fileName(path).replace(/\.featherlog$/i, '');
      const sessionId = `file:log:${path}`;
      const config = createFileConfig(path, name);
      addFileSession(
        {
          id: sessionId,
          name: `Log: ${name}`,
          kind: 'log-file',
          filePath: path,
          connected: false,
          connectedAt: Date.now(),
        },
        config,
      );
      setLogOverride(path);
      queryClient.setQueryData(sessionQueryKey.logs(sessionId), []);
      navigate('/');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to open log file');
    }
  };

  const openTimeTravelFile = async () => {
    try {
      const path = await openDialog({
        multiple: false,
        directory: false,
        filters: [{ name: 'Feather Time Travel', extensions: ['feathertravel'] }],
      });
      if (!path || typeof path !== 'string') return;

      const raw = await readTextFile(path);
      const parsed = JSON.parse(raw) as { version?: number; frames?: TimeTravelFrame[] };
      if (!Array.isArray(parsed.frames)) {
        throw new Error('Unsupported time-travel file');
      }

      const name = fileName(path).replace(/\.feathertravel$/i, '');
      const sessionId = `file:time-travel:${path}`;
      const config = createFileConfig(path, name);
      const frames = parsed.frames;
      const status: TimeTravelStatus = {
        recording: false,
        frame_count: frames.length,
        buffer_size: frames.length,
        first_frame_id: frames[0]?.id ?? 0,
        last_frame_id: frames[frames.length - 1]?.id ?? 0,
      };

      addFileSession(
        {
          id: sessionId,
          name: `Travel: ${name}`,
          kind: 'time-travel-file',
          filePath: path,
          connected: false,
          connectedAt: Date.now(),
        },
        config,
      );
      setLogOverride(undefined);
      queryClient.setQueryData(sessionQueryKey.timeTravelFrames(sessionId), frames);
      queryClient.setQueryData(sessionQueryKey.timeTravel(sessionId), status);
      navigate('/time-travel');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to open time-travel file');
    }
  };

  return (
    <div className="bg-muted flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-lg p-1 scrollbar-none no-scrollbar">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
            title="Add temporary session"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onSelect={openLogFile}>
            <FileTextIcon className="size-3.5" />
            Open log file
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={openTimeTravelFile}>
            <ClockIcon className="size-3.5" />
            Open time-travel file
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {sessionList.map((session) => {
        const cachedSessionConfig = queryClient.getQueryData<Config>(sessionQueryKey.config(session.id));
        const hasVersionMismatch = !!cachedSessionConfig?.version && cachedSessionConfig.version !== version;
        return (
          <SessionTab
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onClick={() => handleSessionClick(session)}
            onReload={() => requestAllData(session.id)}
            onRemove={() => {
              queryClient.removeQueries({ queryKey: [session.id] });
              removeSession(session.id);
            }}
            versionMismatch={hasVersionMismatch}
          />
        );
      })}
    </div>
  );
}
