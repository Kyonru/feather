import { useEffect, useMemo, useRef, useState, type ElementType } from 'react';
import { useNavigate } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import {
  BugIcon,
  CableIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  CommandIcon,
  ExternalLinkIcon,
  FileCodeIcon,
  FlameIcon,
  FolderSearchIcon,
  KeyboardIcon,
  LifeBuoyIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  SearchIcon,
  SquareTerminalIcon,
  TerminalIcon,
  ToggleLeftIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MAIN_FEATURES, type MainFeatureId } from '@/constants/main-features';
import { useDebugger } from '@/hooks/use-debugger';
import { useHotReload } from '@/hooks/use-hot-reload';
import { requestAllData } from '@/hooks/use-server-polling';
import { sessionQueryKey } from '@/hooks/use-ws-connection';
import { BUILT_IN_SNIPPETS } from '@/pages/console';
import { useCommandCenterStore } from '@/store/command-center';
import type { Config, PluginConfig } from '@/store/config';
import { useConfigStore } from '@/store/config';
import { useConsoleHistoryStore } from '@/store/console-history';
import { useSessionStore, type SessionInfo } from '@/store/session';
import { useSettingsStore } from '@/store/settings';
import { openUrl } from '@/utils/linking';
import { cn } from '@/utils/styles';
import { toast } from 'sonner';

type CommandCenterActionKind = 'navigate' | 'external' | 'session' | 'debugger' | 'hot-reload' | 'console';

type CommandCenterItem = {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
  icon?: ElementType;
  pluginIcon?: string;
  actionKind: CommandCenterActionKind;
  disabled?: boolean;
  disabledReason?: string;
  badges?: Array<{ label: string; variant?: 'default' | 'secondary' | 'outline' | 'destructive' }>;
  run: () => void;
};

type CommandCenterGroup = {
  id: string;
  title: string;
  items: CommandCenterItem[];
};

const DOC_LINKS = [
  {
    title: 'Installation docs',
    url: 'https://kyonru.github.io/feather/installation/',
    keywords: ['install', 'setup', 'npm'],
  },
  { title: 'CLI docs', url: 'https://kyonru.github.io/feather/cli/', keywords: ['run', 'build', 'package'] },
  {
    title: 'Configuration docs',
    url: 'https://kyonru.github.io/feather/configuration/',
    keywords: ['config', 'feather.config.lua'],
  },
  { title: 'Debugger docs', url: 'https://kyonru.github.io/feather/debugger/', keywords: ['breakpoint', 'step'] },
  {
    title: 'Console docs',
    url: 'https://kyonru.github.io/feather/plugins/console/',
    keywords: ['eval', 'lua', 'snippets'],
  },
  { title: 'Plugins docs', url: 'https://kyonru.github.io/feather/plugins/', keywords: ['plugin', 'capabilities'] },
  { title: 'Assets docs', url: 'https://kyonru.github.io/feather/assets/', keywords: ['textures', 'fonts', 'audio'] },
  {
    title: 'Performance docs',
    url: 'https://kyonru.github.io/feather/performance/',
    keywords: ['fps', 'profiler', 'metrics'],
  },
] as const;

const EMPTY_SNIPPETS: [] = [];

const featureIcons: Record<MainFeatureId | 'session', ElementType> = {
  logs: TerminalIcon,
  performance: FlameIcon,
  observability: FolderSearchIcon,
  debugger: BugIcon,
  console: TerminalIcon,
  'particle-system-playground': FileCodeIcon,
  'shader-graph': FileCodeIcon,
  assets: FolderSearchIcon,
  'time-travel': RotateCcwIcon,
  'session-replay': RotateCcwIcon,
  compare: CableIcon,
  session: CableIcon,
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function commandMatches(item: CommandCenterItem, query: string): boolean {
  if (!query) return true;
  const haystack = normalize([item.title, item.subtitle, ...(item.keywords ?? []), item.id].filter(Boolean).join(' '));
  return query
    .split(' ')
    .filter(Boolean)
    .every((part) => haystack.includes(part));
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

function pluginDisabledReason(plugin: PluginConfig): string {
  if (typeof plugin.incompatibilityReason === 'string' && plugin.incompatibilityReason)
    return plugin.incompatibilityReason;
  if (plugin.incompatible) return 'Plugin is incompatible with this runtime.';
  if (plugin.disabled) return 'Plugin is disabled in this session.';
  return '';
}

function sessionLabel(session: SessionInfo): string {
  return session.name || session.id.slice(0, 8);
}

function CommandRow({
  item,
  selected,
  onSelect,
  onHover,
}: {
  item: CommandCenterItem;
  selected: boolean;
  onSelect: () => void;
  onHover: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      data-testid="command-center-row"
      data-selected={selected ? 'true' : undefined}
      aria-disabled={item.disabled}
      title={item.disabled ? item.disabledReason : item.subtitle}
      className={cn(
        'grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors',
        selected && 'border-primary bg-primary/10',
        !selected && 'border-transparent hover:border-border hover:bg-accent/50',
        item.disabled && 'cursor-not-allowed opacity-50',
      )}
      onMouseEnter={() => {
        if (!selected) onHover();
      }}
      onClick={() => {
        if (!item.disabled) onSelect();
      }}
    >
      <span className="flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground">
        {item.pluginIcon ? (
          <DynamicIcon name={item.pluginIcon as IconName} className="size-4" />
        ) : Icon ? (
          <Icon className="size-4" />
        ) : (
          <CommandIcon className="size-4" />
        )}
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="truncate text-sm font-medium">{item.title}</span>
        {item.subtitle && <span className="truncate text-xs text-muted-foreground">{item.subtitle}</span>}
      </span>
      <span className="flex min-w-0 items-center gap-1">
        {item.badges?.map((badge) => (
          <Badge
            key={badge.label}
            variant={badge.variant ?? 'outline'}
            className="h-5 max-w-28 truncate px-1.5 text-[10px]"
          >
            {badge.label}
          </Badge>
        ))}
        <ChevronRightIcon className="size-3.5 text-muted-foreground" />
      </span>
    </button>
  );
}

export function CommandCenter() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const open = useCommandCenterStore((state) => state.open);
  const setOpen = useCommandCenterStore((state) => state.setOpen);
  const toggleOpen = useCommandCenterStore((state) => state.toggle);
  const setConsoleDraft = useCommandCenterStore((state) => state.setConsoleDraft);
  const sessionId = useSessionStore((state) => state.sessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const setActiveSession = useSessionStore((state) => state.setActiveSession);
  const setConfig = useConfigStore((state) => state.setConfig);
  const storeConfig = useConfigStore((state) => state.config);
  const setDisconnected = useConfigStore((state) => state.setDisconnected);
  const setLogOverride = useConfigStore((state) => state.setLogOverride);
  const hiddenMainFeatures = useSettingsStore((state) => state.hiddenMainFeatures);
  const showHiddenMainFeaturesInCommandCenter = useSettingsStore(
    (state) => state.showHiddenMainFeaturesInCommandCenter,
  );
  const hiddenPlugins = useSettingsStore((state) => state.hiddenPlugins);
  const savedSnippets = useConsoleHistoryStore((state) =>
    sessionId ? (state.snippetsBySession[sessionId] ?? EMPTY_SNIPPETS) : EMPTY_SNIPPETS,
  );
  const dbg = useDebugger();
  const hotReload = useHotReload();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectedRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { data: cachedConfig } = useQuery<Config | null>({
    queryKey: sessionId ? sessionQueryKey.config(sessionId) : ['noop-command-center-config'],
    queryFn: () => null,
    enabled: false,
  });
  const config = cachedConfig ?? storeConfig;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey)
        return;
      if (isEditableTarget(event.target)) return;
      event.preventDefault();
      toggleOpen();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleOpen]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedIndex(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  const closeAndRun = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const switchSession = (session: SessionInfo) => {
    setActiveSession(session.id);
    setDisconnected(session.kind ? false : !session.connected);
    setLogOverride(session.kind === 'log-file' ? session.filePath : undefined);
    const nextConfig = queryClient.getQueryData<Config>(sessionQueryKey.config(session.id));
    if (nextConfig) setConfig(nextConfig);
    if (session.connected && !session.kind) requestAllData(session.id);
    toast.success(`Selected ${sessionLabel(session)}`);
  };

  const groups = useMemo<CommandCenterGroup[]>(() => {
    const hasSession = !!sessionId;
    const sessionRequired = 'Select a session first.';
    const consoleSnippets = savedSnippets.length > 0 ? savedSnippets : BUILT_IN_SNIPPETS;
    const pluginEntries = Object.entries(config?.plugins ?? {}).filter(
      ([id, plugin]) => plugin.tabName && !(plugin.disabled && hiddenPlugins.includes(id)),
    );
    const selectedModule = hotReload.state.selectedModuleStatus?.module || '';
    const selectedModuleReason =
      hotReload.state.selectedModuleStatus?.reason || 'Open a Lua file in Debugger before reloading a module.';

    const searchableFeatures = showHiddenMainFeaturesInCommandCenter
      ? MAIN_FEATURES
      : MAIN_FEATURES.filter((feature) => !hiddenMainFeatures.includes(feature.id));

    const pages: CommandCenterItem[] = [
      ...searchableFeatures.map((feature) => ({
        id: `page:${feature.id}`,
        title: feature.title,
        subtitle:
          feature.id === 'compare'
            ? 'Open Compare. Direct links show an empty state until two sessions are connected.'
            : feature.url,
        keywords: [feature.id, feature.url, 'page', 'tool'],
        icon: featureIcons[feature.id],
        actionKind: 'navigate' as const,
        disabled: !hasSession && feature.id !== 'shader-graph',
        disabledReason: sessionRequired,
        badges: hiddenMainFeatures.includes(feature.id)
          ? [{ label: 'Hidden', variant: 'secondary' as const }]
          : undefined,
        run: () => closeAndRun(() => navigate(feature.url)),
      })),
      {
        id: 'page:session',
        title: 'Session',
        subtitle: '/session',
        keywords: ['session', 'connection', 'handshake'],
        icon: featureIcons.session,
        actionKind: 'navigate',
        disabled: !hasSession,
        disabledReason: sessionRequired,
        run: () => closeAndRun(() => navigate('/session')),
      },
    ];

    const plugins: CommandCenterItem[] = pluginEntries
      .sort((a, b) => String(a[1].tabName).localeCompare(String(b[1].tabName)))
      .map(([id, plugin]) => {
        const disabledReason = pluginDisabledReason(plugin);
        return {
          id: `plugin:${id}`,
          title: String(plugin.tabName),
          subtitle: `/plugins/${id}`,
          keywords: [id, 'plugin', ...(plugin.capabilities ?? []), String(plugin.docs ?? '')],
          pluginIcon: typeof plugin.icon === 'string' ? plugin.icon : undefined,
          actionKind: 'navigate' as const,
          disabled: !hasSession || plugin.disabled === true || plugin.incompatible === true,
          disabledReason: !hasSession ? sessionRequired : disabledReason,
          badges: [
            ...(plugin.disabled ? [{ label: 'Disabled', variant: 'secondary' as const }] : []),
            ...(plugin.incompatible ? [{ label: 'Blocked', variant: 'destructive' as const }] : []),
          ],
          run: () => closeAndRun(() => navigate(`/plugins/${id}`)),
        };
      });

    const consoleItems: CommandCenterItem[] = consoleSnippets.map((snippet) => ({
      id: `console:snippet:${snippet.id}`,
      title: `Insert snippet: ${snippet.name}`,
      subtitle: snippet.code,
      keywords: ['console', 'snippet', snippet.name, snippet.code],
      icon: TerminalIcon,
      actionKind: 'console',
      disabled: !sessionId,
      disabledReason: sessionRequired,
      badges: snippet.id.startsWith('builtin-') ? [{ label: 'Built-in', variant: 'secondary' as const }] : undefined,
      run: () =>
        closeAndRun(() => {
          if (!sessionId) return;
          setConsoleDraft(sessionId, snippet.code);
          navigate('/console');
          toast.success('Snippet inserted in Console');
        }),
    }));
    consoleItems.unshift({
      id: 'console:open',
      title: 'Open Console',
      subtitle: 'Prepare or run Lua commands in the active session.',
      keywords: ['console', 'lua', 'eval'],
      icon: TerminalIcon,
      actionKind: 'navigate',
      disabled: !hasSession,
      disabledReason: sessionRequired,
      run: () => closeAndRun(() => navigate('/console')),
    });

    const debuggerItems: CommandCenterItem[] = [
      {
        id: 'debugger:open',
        title: 'Open Debugger',
        subtitle: dbg.isPaused ? 'Paused in the active session.' : 'Breakpoints, stepping, variables, and hot reload.',
        keywords: ['debugger', 'breakpoint', 'step'],
        icon: BugIcon,
        actionKind: 'navigate',
        disabled: !hasSession,
        disabledReason: sessionRequired,
        badges: dbg.isPaused ? [{ label: 'Paused', variant: 'destructive' as const }] : undefined,
        run: () => closeAndRun(() => navigate('/debugger')),
      },
      {
        id: 'debugger:toggle',
        title: dbg.isEnabled ? 'Disable Debugger' : 'Enable Debugger',
        subtitle: 'Toggle debugger listening for the active session.',
        keywords: ['debugger', 'toggle', 'enable', 'disable'],
        icon: ToggleLeftIcon,
        actionKind: 'debugger',
        disabled: !hasSession,
        disabledReason: sessionRequired,
        run: () => closeAndRun(dbg.toggleEnabled),
      },
      {
        id: 'debugger:pause-on-error',
        title: dbg.pauseOnError ? 'Disable Pause on Error' : 'Enable Pause on Error',
        subtitle: 'Pause debugger when a callback error is captured.',
        keywords: ['debugger', 'pause on error', 'exception'],
        icon: LifeBuoyIcon,
        actionKind: 'debugger',
        disabled: !hasSession || !dbg.isEnabled,
        disabledReason: !hasSession ? sessionRequired : 'Enable the debugger first.',
        run: () => closeAndRun(() => dbg.setPauseOnError(!dbg.pauseOnError)),
      },
      {
        id: 'debugger:continue',
        title: 'Continue',
        subtitle: 'Resume a paused game.',
        keywords: ['debugger', 'continue', 'resume'],
        icon: CheckCircleIcon,
        actionKind: 'debugger',
        disabled: !hasSession || !dbg.isPaused,
        disabledReason: !hasSession ? sessionRequired : 'Game is not paused.',
        run: () => closeAndRun(dbg.continue),
      },
      {
        id: 'debugger:step-over',
        title: 'Step Over',
        subtitle: 'Advance the paused debugger one line.',
        keywords: ['debugger', 'step', 'over'],
        icon: ChevronRightIcon,
        actionKind: 'debugger',
        disabled: !hasSession || !dbg.isPaused,
        disabledReason: !hasSession ? sessionRequired : 'Game is not paused.',
        run: () => closeAndRun(dbg.stepOver),
      },
    ];

    const hotReloadItems: CommandCenterItem[] = [
      {
        id: 'hot-reload:open',
        title: 'Open Hot Reload Controls',
        subtitle: 'Hot Reload lives in the Debugger header.',
        keywords: ['hot reload', 'reload', 'debugger'],
        icon: FlameIcon,
        actionKind: 'hot-reload',
        disabled: !hasSession,
        disabledReason: sessionRequired,
        badges: hotReload.state.enabled
          ? [{ label: 'Enabled', variant: 'outline' as const }]
          : [{ label: 'Disabled', variant: 'secondary' as const }],
        run: () => closeAndRun(() => navigate('/debugger')),
      },
      {
        id: 'hot-reload:reload-selected',
        title: selectedModule ? `Reload ${selectedModule}` : 'Reload selected module',
        subtitle: selectedModule ? 'Open Debugger to reload the selected source file.' : 'No module selected.',
        keywords: ['hot reload', 'module', 'reload', selectedModule],
        icon: RefreshCwIcon,
        actionKind: 'hot-reload',
        disabled:
          !hasSession ||
          !hotReload.state.enabled ||
          !selectedModule ||
          !hotReload.state.selectedModuleStatus?.reloadable,
        disabledReason: !hasSession
          ? sessionRequired
          : !hotReload.state.enabled
            ? 'Hot Reload is disabled.'
            : selectedModuleReason,
        run: () => closeAndRun(() => navigate('/debugger')),
      },
      {
        id: 'hot-reload:validate',
        title: selectedModule ? `Validate ${selectedModule}` : 'Validate selected module',
        subtitle: selectedModule || 'No module selected.',
        keywords: ['hot reload', 'validate', 'module', selectedModule],
        icon: KeyboardIcon,
        actionKind: 'hot-reload',
        disabled: !hasSession || !selectedModule,
        disabledReason: !hasSession ? sessionRequired : 'Open a Lua file in Debugger first.',
        run: () => closeAndRun(() => hotReload.validateModule(selectedModule)),
      },
      {
        id: 'hot-reload:restore',
        title: 'Restore Hot Reload Originals',
        subtitle: 'Ask the runtime to restore original modules.',
        keywords: ['hot reload', 'restore', 'originals'],
        icon: RotateCcwIcon,
        actionKind: 'hot-reload',
        disabled: !hasSession || !hotReload.state.enabled,
        disabledReason: !hasSession ? sessionRequired : 'Hot Reload is disabled.',
        run: () => closeAndRun(hotReload.restoreOriginals),
      },
    ];

    const sessionItems: CommandCenterItem[] = Object.values(sessions)
      .sort((a, b) => (b.connectedAt ?? 0) - (a.connectedAt ?? 0))
      .flatMap((session) => [
        {
          id: `session:switch:${session.id}`,
          title: `Switch to ${sessionLabel(session)}`,
          subtitle: `${session.os ?? session.kind ?? 'Session'} · ${session.connected ? 'connected' : 'disconnected'}`,
          keywords: ['session', 'switch', session.id, session.name ?? '', session.os ?? '', session.kind ?? ''],
          icon: CableIcon,
          actionKind: 'session' as const,
          badges: session.id === sessionId ? [{ label: 'Current', variant: 'secondary' as const }] : undefined,
          run: () => closeAndRun(() => switchSession(session)),
        },
        {
          id: `session:refresh:${session.id}`,
          title: `Refresh ${sessionLabel(session)}`,
          subtitle: 'Request config, performance, observers, and plugins again.',
          keywords: ['session', 'refresh', 'handshake', 'reload', session.id, session.name ?? ''],
          icon: RefreshCwIcon,
          actionKind: 'session' as const,
          disabled: !session.connected || !!session.kind,
          disabledReason: session.kind ? 'File sessions do not support runtime refresh.' : 'Session is disconnected.',
          run: () =>
            closeAndRun(() => {
              requestAllData(session.id);
              toast.success(`Requested refresh for ${sessionLabel(session)}`);
            }),
        },
      ]);
    sessionItems.unshift({
      id: 'session:open',
      title: 'Open Session',
      subtitle: 'Inspect connection, config, capabilities, and runtime options.',
      keywords: ['session', 'config', 'capabilities'],
      icon: CableIcon,
      actionKind: 'navigate',
      disabled: !hasSession,
      disabledReason: sessionRequired,
      run: () => closeAndRun(() => navigate('/session')),
    });

    const docs: CommandCenterItem[] = DOC_LINKS.map((doc) => ({
      id: `docs:${doc.title}`,
      title: doc.title,
      subtitle: doc.url,
      keywords: ['docs', ...doc.keywords],
      icon: ExternalLinkIcon,
      actionKind: 'external',
      run: () => closeAndRun(() => openUrl(doc.url)),
    }));

    return [
      { id: 'pages', title: 'Pages', items: pages },
      { id: 'plugins', title: 'Plugins', items: plugins },
      { id: 'console', title: 'Console', items: consoleItems },
      { id: 'debugger', title: 'Debugger', items: debuggerItems },
      { id: 'hot-reload', title: 'Hot Reload', items: hotReloadItems },
      { id: 'session', title: 'Session', items: sessionItems },
      { id: 'docs', title: 'Docs', items: docs },
    ].filter((group) => group.items.length > 0);
  }, [
    config?.plugins,
    dbg,
    hiddenMainFeatures,
    hiddenPlugins,
    hotReload,
    navigate,
    queryClient,
    savedSnippets,
    sessionId,
    sessions,
    setActiveSession,
    setConfig,
    setConsoleDraft,
    setDisconnected,
    setLogOverride,
    showHiddenMainFeaturesInCommandCenter,
  ]);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = normalize(query);
    return groups
      .map((group) => ({ ...group, items: group.items.filter((item) => commandMatches(item, normalizedQuery)) }))
      .filter((group) => group.items.length > 0);
  }, [groups, query]);

  const flatItems = useMemo(() => filteredGroups.flatMap((group) => group.items), [filteredGroups]);
  const selectedItem = flatItems[selectedIndex];

  useEffect(() => {
    setSelectedIndex((index) => Math.min(index, Math.max(flatItems.length - 1, 0)));
  }, [flatItems.length]);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const moveSelection = (direction: 1 | -1) => {
    if (flatItems.length === 0) return;
    setSelectedIndex((index) => (index + direction + flatItems.length) % flatItems.length);
  };

  const runSelected = () => {
    if (!selectedItem || selectedItem.disabled) return;
    selectedItem.run();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="grid max-h-[min(720px,calc(100vh-2rem))] gap-0 overflow-hidden p-0 sm:max-w-3xl"
        data-testid="command-center"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Command Center</DialogTitle>
        <DialogDescription className="sr-only">
          Search pages, plugins, snippets, debugger actions, sessions, and docs.
        </DialogDescription>
        <div className="border-b p-3">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  moveSelection(1);
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  moveSelection(-1);
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  runSelected();
                } else if (event.key === 'Escape') {
                  setOpen(false);
                }
              }}
              placeholder="Search pages, plugins, snippets, sessions, docs..."
              className="h-11 pl-9 pr-24"
              aria-label="Command Center search"
            />
            <div className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-[10px] text-muted-foreground sm:flex">
              <Badge variant="outline" className="h-5 px-1.5 font-mono">
                ↑↓
              </Badge>
              <Badge variant="outline" className="h-5 px-1.5 font-mono">
                Enter
              </Badge>
            </div>
          </div>
        </div>
        <ScrollArea className="min-h-0">
          <div className="grid max-h-[calc(100vh-10rem)] gap-3 p-3">
            {filteredGroups.map((group) => (
              <section key={group.id} className="grid gap-1.5">
                <div className="flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>{group.title}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="grid gap-1">
                  {group.items.map((item) => {
                    const globalIndex = flatItems.findIndex((candidate) => candidate.id === item.id);
                    const selected = globalIndex === selectedIndex;
                    return (
                      <div key={item.id} ref={selected ? selectedRef : undefined}>
                        <CommandRow
                          item={item}
                          selected={selected}
                          onHover={() => setSelectedIndex(globalIndex)}
                          onSelect={item.run}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {flatItems.length === 0 && (
              <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-center">
                <SearchIcon className="size-5 text-muted-foreground" />
                <p className="text-sm font-medium">No commands found</p>
                <p className="text-xs text-muted-foreground">Try a page, plugin, session, snippet, or docs keyword.</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function CommandCenterTrigger() {
  const setOpen = useCommandCenterStore((state) => state.setOpen);
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 shrink-0 gap-1.5 px-2 text-muted-foreground"
      onClick={() => setOpen(true)}
      title="Open Command Center (Cmd/Ctrl+K)"
      data-testid="command-center-trigger"
    >
      <SquareTerminalIcon className="size-4" />
      <span className="hidden md:inline">Shortcuts</span>
    </Button>
  );
}
