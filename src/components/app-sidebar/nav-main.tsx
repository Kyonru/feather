import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
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
  StarIcon,
  TelescopeIcon,
  TerminalIcon,
} from 'lucide-react';
import { useDebuggerStore } from '@/store/debugger';
import { MAIN_FEATURES, type MainFeatureId, type SidebarToolId } from '@/constants/main-features';
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

type SidebarTool = {
  id: SidebarToolId;
  title: string;
  url: string;
  icon: ElementType;
  featureId?: MainFeatureId;
};

const sidebarGroups: Array<{ id: string; label: string; toolIds: SidebarToolId[] }> = [
  { id: 'core', label: 'Core', toolIds: ['logs', 'performance', 'session', 'compare'] },
  { id: 'inspect', label: 'Inspect', toolIds: ['observability', 'debugger', 'console', 'assets'] },
  { id: 'creative', label: 'Creative', toolIds: ['particle-system-playground', 'shader-graph'] },
  { id: 'history', label: 'History', toolIds: ['time-travel', 'session-replay'] },
];

export function NavMain() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const connectedSessionCount = useSessionStore(
    (state) => Object.values(state.sessions).filter((session) => session.connected).length,
  );
  const hiddenMainFeatures = useSettingsStore((state) => state.hiddenMainFeatures);
  const pinnedSidebarTools = useSettingsStore((state) => state.pinnedSidebarTools);
  const togglePinnedSidebarTool = useSettingsStore((state) => state.togglePinnedSidebarTool);
  const hasSession = !!sessionId;
  const canCompare = connectedSessionCount >= 2;
  const isPaused = useDebuggerStore((state) => (sessionId ? !!state.pausedState[sessionId] : false));

  const toolsById = new Map<SidebarToolId, SidebarTool>([
    ...MAIN_FEATURES.map((feature) => [
      feature.id,
      {
        ...feature,
        featureId: feature.id,
        icon: featureIcons[feature.id],
      },
    ]),
    [
      'session',
      {
        id: 'session',
        title: 'Session',
        url: '/session',
        icon: featureIcons.session,
      },
    ],
  ] as Array<[SidebarToolId, SidebarTool]>);

  const isVisibleTool = (tool: SidebarTool) => {
    if (tool.id === 'session') return true;
    if (tool.id === 'compare' && !canCompare) return false;
    return !hiddenMainFeatures.includes(tool.id);
  };

  const favoriteItems = pinnedSidebarTools
    .map((toolId) => toolsById.get(toolId))
    .filter((tool): tool is SidebarTool => !!tool && isVisibleTool(tool));
  const favoriteIds = new Set(favoriteItems.map((tool) => tool.id));

  const groupedItems = sidebarGroups
    .map((group) => ({
      ...group,
      items: group.toolIds
        .map((toolId) => toolsById.get(toolId))
        .filter((tool): tool is SidebarTool => !!tool && isVisibleTool(tool) && !favoriteIds.has(tool.id)),
    }))
    .filter((group) => group.items.length > 0);

  const groups = [
    ...(favoriteItems.length > 0 ? [{ id: 'favorites', label: 'Favorites', items: favoriteItems }] : []),
    ...groupedItems,
  ];
  const location = useLocation();

  const renderTool = (item: SidebarTool) => {
    const isDebugger = item.url === '/debugger';
    const isActive = hasSession && item.url === location.pathname;
    const isPinned = pinnedSidebarTools.includes(item.id);
    const iconClassName = cn(isPinned && 'text-primary');
    const content = (
      <>
        {item.icon && <item.icon className={iconClassName} />}
        <span>{item.title}</span>
        {isDebugger && isPaused && (
          <span className="ml-auto flex size-2 rounded-full bg-rose-800 animate-ping" title="Paused" />
        )}
      </>
    );

    return (
      <SidebarMenuItem key={item.id} data-testid={`sidebar-tool-${item.id}`}>
        {hasSession ? (
          <SidebarMenuButton
            asChild
            isActive={isActive}
            className={cn({
              'animate-pulse': isDebugger && isPaused,
              'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear':
                isActive,
            })}
            tooltip={item.title}
          >
            <NavLink to={item.url} end>
              {content}
            </NavLink>
          </SidebarMenuButton>
        ) : (
          <SidebarMenuButton
            disabled
            className={cn('cursor-not-allowed opacity-45', {
              'animate-pulse': isDebugger && isPaused,
            })}
            tooltip="Select a session first"
          >
            {content}
          </SidebarMenuButton>
        )}
        <SidebarMenuAction
          type="button"
          showOnHover
          aria-label={`${isPinned ? 'Unpin' : 'Pin'} ${item.title} ${isPinned ? 'from' : 'to'} favorites`}
          title={isPinned ? 'Unpin from favorites' : 'Pin to favorites'}
          onClick={() => togglePinnedSidebarTool(item.id)}
          className={cn(isPinned && 'text-primary')}
        >
          <StarIcon className={cn('size-3.5', isPinned && 'fill-current')} />
        </SidebarMenuAction>
      </SidebarMenuItem>
    );
  };

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        {groups.map((group) => (
          <div key={group.id} data-testid={`sidebar-group-${group.id}`} className="grid gap-1">
            <SidebarGroupLabel className="h-6 px-2 text-[10px] font-semibold uppercase tracking-wider">
              {group.label}
            </SidebarGroupLabel>
            <SidebarMenu>{group.items.map(renderTool)}</SidebarMenu>
          </div>
        ))}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
