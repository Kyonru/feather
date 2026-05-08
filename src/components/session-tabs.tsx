import { useSessionStore, type SessionInfo } from '@/store/session';
import { Config, useConfigStore } from '@/store/config';
import { useQueryClient } from '@tanstack/react-query';
import { sessionQueryKey } from '@/hooks/use-ws-connection';
import { requestAllData } from '@/hooks/use-server-polling';
import { cn } from '@/utils/styles';
import {
  MonitorIcon,
  CircleIcon,
  TriangleAlertIcon,
  AppWindowIcon,
  BotIcon,
  GlobeIcon,
  AppWindowMacIcon,
  Smartphone,
  BirdIcon,
  XIcon,
  RefreshCwIcon,
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

const osIcons: Record<string, React.ReactNode> = {
  Windows: <AppWindowIcon className="size-3" />,
  Linux: <BirdIcon className="size-3" />,
  MacOS: <AppWindowMacIcon className="size-3" />,
  'OS X': <AppWindowMacIcon className="size-3" />,
  Web: <GlobeIcon className="size-3" />,
  Android: <BotIcon className="size-3" />,
  iOS: <Smartphone className="size-3" />,
};

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
            {osIcon ? <span className="text-xs">{osIcon}</span> : <MonitorIcon className="size-3" />}
            <span className="max-w-[100px] truncate">{session.name || session.id.slice(0, 8)}</span>
            {versionMismatch && <TriangleAlertIcon className="size-3 text-yellow-500" />}
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

  return tab;
}

export function SessionTabs() {
  const queryClient = useQueryClient();
  const sessions = useSessionStore((state) => state.sessions);
  const activeSessionId = useSessionStore((state) => state.sessionId);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const removeSession = useSessionStore((state) => state.removeSession);
  const setConfig = useConfigStore((state) => state.setConfig);
  const setDisconnected = useConfigStore((state) => state.setDisconnected);

  const sessionList = Object.values(sessions);

  if (sessionList.length === 0) return null;

  const handleSessionClick = (session: SessionInfo) => {
    setActiveSession(session.id);
    setDisconnected(!session.connected);
    const cachedConfig = queryClient.getQueryData<Config>(sessionQueryKey.config(session.id));
    if (cachedConfig) {
      setConfig(cachedConfig);
    }
  };

  return (
    <div className="bg-muted flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto rounded-lg p-1 scrollbar-none no-scrollbar">
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
