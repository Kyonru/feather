import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/utils/styles';
import { NavLink, useLocation } from 'react-router';
import { BugIcon, ClockIcon, GaugeIcon, LogsIcon, TelescopeIcon, TerminalIcon } from 'lucide-react';
import { useDebuggerStore } from '@/store/debugger';
import { useSessionStore } from '@/store/session';

export function NavMain() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const pausedState = useDebuggerStore((state) => state.pausedState);
  const isPaused = sessionId ? !!pausedState[sessionId] : false;

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
  ];
  const location = useLocation();
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            const isDebugger = item.url === '/debugger';
            return (
              <NavLink key={item.title} to={item.url} end>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    className={cn({
                      'animate-pulse': isDebugger && isPaused,
                      'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear':
                        item.url === location.pathname,
                    })}
                    tooltip={item.title}
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    {isDebugger && isPaused && (
                      <span className="ml-auto flex size-2 rounded-full bg-rose-800 animate-ping" title="Paused" />
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </NavLink>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
