import { useState } from 'react';
import {
  createCreativeSessionId,
  isCreativeSession,
  sessionSupportsRuntime,
  useSessionStore,
  type SessionInfo,
} from '@/store/session';
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
  PauseIcon,
  PlayIcon,
  SparklesIcon,
} from 'lucide-react';
import { version } from '../../package.json';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { sendCommand } from '@/lib/send-command';
import { useShaderGraphStore } from '@/store/shader-graph';
import { useSettingsStore } from '@/store/settings';
import { deleteLocalParticleWorkspace } from '@/showcase/use-local-particle-playground';

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

function createCreativeConfig(sessionId: string, name: string): Config {
  return {
    plugins: {},
    root_path: '',
    version,
    API: 0,
    sampleRate: 1,
    outfile: '',
    language: 'lua',
    captureScreenshot: false,
    location: sessionId,
    sourceDir: '',
    sessionName: name,
    sysInfo: {
      os: 'Creative',
      arch: 'local',
      cpuCount: 0,
    },
  };
}

function normalizeCreativeName(name: string, index: number): string {
  const trimmed = name.trim().replace(/\s+/g, ' ').slice(0, 64);
  return trimmed || `Creative Workspace ${index}`;
}

function isCreativeRoute(pathname: string): boolean {
  return pathname.startsWith('/shader-graph') ||
    pathname.startsWith('/particle-system-playground') ||
    pathname.startsWith('/texture-lab');
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
  const creative = isCreativeSession(session);

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
              className={cn(
                'size-2 fill-current',
                session.connected ? 'text-green-500' : creative ? 'text-violet-500' : 'text-muted-foreground/50',
              )}
            />
            {creative ? (
              <SparklesIcon className="size-3" />
            ) : FileIcon ? (
              <FileIcon className="size-3" />
            ) : osIcon ? (
              <span className="text-xs">{osIcon}</span>
            ) : (
              <MonitorIcon className="size-3" />
            )}
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
        {!creative && (
          <>
            <ContextMenuItem onSelect={onReload} disabled={!session.connected}>
              <RefreshCwIcon className="size-3.5" />
              Reload session
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
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

  if (creative) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{tab}</TooltipTrigger>
        <TooltipContent>
          <p>Local creative workspace — no connected LÖVE runtime required</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return tab;
}

export function SessionTabs() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.sessionId);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const addSession = useSessionStore((state) => state.addSession);
  const removeSession = useSessionStore((state) => state.removeSession);
  const setConfig = useConfigStore((state) => state.setConfig);
  const setLogOverride = useConfigStore((state) => state.setLogOverride);
  const setDisconnected = useConfigStore((state) => state.setDisconnected);
  const setRuntimeSuspended = useSessionStore((state) => state.setRuntimeSuspended);
  const deleteShaderGraphWorkspace = useShaderGraphStore((state) => state.deleteWorkspace);
  const deleteTextureLabWorkspace = useSettingsStore((state) => state.deleteTextureLabWorkspace);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [creativeName, setCreativeName] = useState('');
  const [removeCreativeSession, setRemoveCreativeSession] = useState<SessionInfo | null>(null);

  const sessionList = Object.values(sessions);
  const activeSession = activeSessionId ? sessions[activeSessionId] : null;

  const refreshLiveSession = (session: SessionInfo) => {
    if (!sessionSupportsRuntime(session)) return;
    requestAllData(session.id);
  };

  const handleSessionClick = (session: SessionInfo) => {
    setActiveSession(session.id);
    setDisconnected(session.kind ? false : !session.connected);
    setLogOverride(session.kind === 'log-file' ? session.filePath : undefined);
    const cachedConfig = queryClient.getQueryData<Config>(sessionQueryKey.config(session.id));
    if (cachedConfig) {
      setConfig(cachedConfig);
    } else if (isCreativeSession(session)) {
      const config = createCreativeConfig(session.id, session.name ?? 'Creative Workspace');
      setConfig(config);
      queryClient.setQueryData(sessionQueryKey.config(session.id), config);
    }
    refreshLiveSession(session);
  };

  const addFileSession = (session: SessionInfo, config: Config) => {
    addSession(session);
    setActiveSession(session.id);
    setConfig(config);
    setDisconnected(false);
    queryClient.setQueryData(sessionQueryKey.config(session.id), config);
  };

  const toggleRuntimeSuspended = async () => {
    if (!sessionSupportsRuntime(activeSession)) return;
    const nextSuspended = !activeSession.runtimeSuspended;
    setRuntimeSuspended(activeSession.id, nextSuspended);
    try {
      await sendCommand(activeSession.id, {
        type: 'cmd:runtime',
        action: nextSuspended ? 'suspend' : 'resume',
      });
      toast.success(nextSuspended ? 'Feather runtime suspended' : 'Feather runtime resumed');
    } catch (error) {
      setRuntimeSuspended(activeSession.id, !nextSuspended);
      toast.error(error instanceof Error ? error.message : 'Failed to update Feather runtime');
    }
  };

  const createCreativeWorkspace = () => {
    const nextIndex = Object.values(sessions).filter(isCreativeSession).length + 1;
    const name = normalizeCreativeName(creativeName, nextIndex);
    const sessionId = createCreativeSessionId();
    const session: SessionInfo = {
      id: sessionId,
      name,
      kind: 'creative',
      connected: false,
      connectedAt: Date.now(),
      os: 'Creative',
    };
    const config = createCreativeConfig(sessionId, name);
    addSession(session);
    setActiveSession(sessionId);
    setConfig(config);
    setDisconnected(false);
    setLogOverride(undefined);
    queryClient.setQueryData(sessionQueryKey.config(sessionId), config);
    setCreativeName('');
    setCreateDialogOpen(false);
    if (!isCreativeRoute(location.pathname)) {
      navigate('/shader-graph');
    }
    toast.success(`Created ${name}`);
  };

  const confirmRemoveCreativeWorkspace = () => {
    if (!removeCreativeSession) return;
    const sessionId = removeCreativeSession.id;
    queryClient.removeQueries({ queryKey: [sessionId] });
    deleteShaderGraphWorkspace(sessionId);
    deleteTextureLabWorkspace(sessionId);
    deleteLocalParticleWorkspace(sessionId);
    removeSession(sessionId);
    if (activeSessionId === sessionId) {
      setConfig(null);
      setDisconnected(true);
      setLogOverride(undefined);
    }
    setRemoveCreativeSession(null);
    toast.success('Creative workspace removed');
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
            title="Add session or workspace"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem onSelect={() => setCreateDialogOpen(true)}>
            <SparklesIcon className="size-3.5" />
            New creative workspace
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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
      {sessionSupportsRuntime(activeSession) ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground',
                activeSession.runtimeSuspended && 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
              )}
              title={activeSession.runtimeSuspended ? 'Resume Feather runtime' : 'Suspend Feather runtime'}
              aria-pressed={activeSession.runtimeSuspended === true}
              onClick={toggleRuntimeSuspended}
            >
              {activeSession.runtimeSuspended ? <PlayIcon className="size-3.5" /> : <PauseIcon className="size-3.5" />}
              <span className="sr-only">
                {activeSession.runtimeSuspended ? 'Resume Feather runtime' : 'Suspend Feather runtime'}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {activeSession.runtimeSuspended
                ? 'Resume Feather runtime work in the connected game'
                : 'Temporarily suspend Feather runtime work in the connected game'}
            </p>
          </TooltipContent>
        </Tooltip>
      ) : null}
      {sessionList.map((session) => {
        const cachedSessionConfig = queryClient.getQueryData<Config>(sessionQueryKey.config(session.id));
        const hasVersionMismatch = !!cachedSessionConfig?.version && cachedSessionConfig.version !== version;
        return (
          <SessionTab
            key={session.id}
            session={session}
            isActive={session.id === activeSessionId}
            onClick={() => handleSessionClick(session)}
            onReload={() => refreshLiveSession(session)}
            onRemove={() => {
              if (isCreativeSession(session)) {
                setRemoveCreativeSession(session);
                return;
              }
              queryClient.removeQueries({ queryKey: [session.id] });
              removeSession(session.id);
            }}
            versionMismatch={hasVersionMismatch}
          />
        );
      })}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New creative workspace</DialogTitle>
            <DialogDescription>
              Create a local workspace for Shader Graph, Particle Playground, and Texture Lab without connecting a game.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              createCreativeWorkspace();
            }}
          >
            <label className="grid gap-1.5 text-sm">
              Name
              <Input
                autoFocus
                value={creativeName}
                maxLength={64}
                placeholder={`Creative Workspace ${Object.values(sessions).filter(isCreativeSession).length + 1}`}
                onChange={(event) => setCreativeName(event.target.value)}
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={!!removeCreativeSession} onOpenChange={(open) => !open && setRemoveCreativeSession(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove creative workspace?</DialogTitle>
            <DialogDescription>
              This deletes the local Shader Graph, Particle Playground, and Texture Lab state for{' '}
              <span className="font-medium text-foreground">{removeCreativeSession?.name ?? 'this workspace'}</span>.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRemoveCreativeSession(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmRemoveCreativeWorkspace}>
              Remove workspace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
