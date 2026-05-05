import { useSessionStore, type SessionInfo } from '@/store/session';
import { Config, useConfigStore } from '@/store/config';
import { useQueryClient } from '@tanstack/react-query';
import { sessionQueryKey } from '@/hooks/use-ws-connection';
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
} from 'lucide-react';
import { version } from '../../package.json';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
  versionMismatch,
}: {
  session: SessionInfo;
  isActive: boolean;
  onClick: () => void;
  versionMismatch: boolean;
}) {
  const osIcon = session.os ? osIcons[session.os] : undefined;

  const tab = (
    <button
      onClick={onClick}
      className={cn(
        'relative flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        isActive && 'bg-background text-foreground shadow-sm border border-border',
        !isActive && 'text-muted-foreground',
      )}
    >
      <CircleIcon
        className={cn('size-2 fill-current', session.connected ? 'text-green-500' : 'text-muted-foreground/50')}
      />
      {osIcon ? <span className="text-xs">{osIcon}</span> : <MonitorIcon className="size-3" />}
      <span className="max-w-[100px] truncate">{session.name || session.id.slice(0, 8)}</span>
      {versionMismatch && <TriangleAlertIcon className="size-3 text-yellow-500" />}
    </button>
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
  const setConfig = useConfigStore((state) => state.setConfig);
  const setDisconnected = useConfigStore((state) => state.setDisconnected);

  const sessionList = Object.values(sessions);

  if (sessionList.length === 0) return null;

  const handleSessionClick = (session: SessionInfo) => {
    setActiveSession(session.id);
    setDisconnected(!session.connected);
    // Restore config from React Query cache for this session
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
            versionMismatch={hasVersionMismatch}
          />
        );
      })}
    </div>
  );
}
