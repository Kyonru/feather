import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/utils/styles';
import { NavLink, useLocation } from 'react-router';
import { BugIcon, ClockIcon, GaugeIcon, GitCompareArrowsIcon, ImagesIcon, LogsIcon, TelescopeIcon, TerminalIcon } from 'lucide-react';
import { useDebuggerStore } from '@/store/debugger';
import { useSessionStore } from '@/store/session';

export function NavMain() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const hasSession = !!sessionId;
  const isPaused = useDebuggerStore((state) => sessionId ? !!state.pausedState[sessionId] : false);

  const items = [
    {
      title: 'Logs',
      url: '/',
      icon: LogsIcon,
    },
    {
      title: 'Performance',
      url: '/performance',
      icon: GaugeIcon,
    },
    {
      title: 'Observability',
      url: '/observability',
      icon: TelescopeIcon,
    },
    {
      title: 'Console',
      url: '/console',
      icon: TerminalIcon,
    },
    {
      title: 'Debugger',
      url: '/debugger',
      icon: BugIcon,
    },
    {
      title: 'Time Travel',
      url: '/time-travel',
      icon: ClockIcon,
    },
    {
      title: 'Assets',
      url: '/assets',
      icon: ImagesIcon,
    },
    {
      title: 'Compare',
      url: '/compare',
      icon: GitCompareArrowsIcon,
    },
  ];
  const location = useLocation();
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            const isDebugger = item.url === '/debugger';
            const button = (
              <SidebarMenuButton
                disabled={!hasSession}
                className={cn({
                  'animate-pulse': isDebugger && isPaused,
                  'cursor-not-allowed opacity-45': !hasSession,
                  'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear':
                    hasSession && item.url === location.pathname,
                })}
                tooltip={hasSession ? item.title : 'Select a session first'}
              >
                {item.icon && <item.icon />}
                <span>{item.title}</span>
                {isDebugger && isPaused && (
                  <span className="ml-auto flex size-2 rounded-full bg-rose-800 animate-ping" title="Paused" />
                )}
              </SidebarMenuButton>
            );

            return (
              <SidebarMenuItem key={item.title}>
                {hasSession ? (
                  <NavLink to={item.url} end>
                    {button}
                  </NavLink>
                ) : (
                  button
                )}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
