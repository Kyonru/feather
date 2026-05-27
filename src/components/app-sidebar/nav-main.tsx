import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { ElementType } from 'react';
import { cn } from '@/utils/styles';
import { NavLink, useLocation } from 'react-router';
import {
  BlendIcon,
  BugIcon,
  CableIcon,
  ClockIcon,
  GaugeIcon,
  GitCompareArrowsIcon,
  ImagesIcon,
  LogsIcon,
  RepeatIcon,
  SparklesIcon,
  TelescopeIcon,
  TerminalIcon,
} from 'lucide-react';
import { useDebuggerStore } from '@/store/debugger';
import { MAIN_FEATURES, type MainFeatureId } from '@/constants/main-features';
import { useSettingsStore } from '@/store/settings';
import { useSessionStore } from '@/store/session';

const featureIcons: Record<MainFeatureId | 'session', ElementType> = {
  logs: LogsIcon,
  performance: GaugeIcon,
  observability: TelescopeIcon,
  debugger: BugIcon,
  console: TerminalIcon,
  'particle-system-playground': SparklesIcon,
  'shader-graph': BlendIcon,
  assets: ImagesIcon,
  'time-travel': ClockIcon,
  'session-replay': RepeatIcon,
  compare: GitCompareArrowsIcon,
  session: CableIcon,
};

export function NavMain() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const connectedSessionCount = useSessionStore(
    (state) => Object.values(state.sessions).filter((session) => session.connected).length,
  );
  const hiddenMainFeatures = useSettingsStore((state) => state.hiddenMainFeatures);
  const hasSession = !!sessionId;
  const canCompare = connectedSessionCount >= 2;
  const isPaused = useDebuggerStore((state) => (sessionId ? !!state.pausedState[sessionId] : false));

  const visibleFeatures = MAIN_FEATURES.filter(
    (feature) => feature.id !== 'compare' && !hiddenMainFeatures.includes(feature.id),
  ).map((feature) => ({
    ...feature,
    icon: featureIcons[feature.id],
  }));
  const compareFeature = MAIN_FEATURES.find((feature) => feature.id === 'compare');

  const items = [
    ...visibleFeatures,
    {
      id: 'session',
      title: 'Session',
      url: '/session',
      icon: featureIcons.session,
    },
    ...(canCompare && compareFeature && !hiddenMainFeatures.includes('compare')
      ? [
          {
            ...compareFeature,
            icon: featureIcons.compare,
          },
        ]
      : []),
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
