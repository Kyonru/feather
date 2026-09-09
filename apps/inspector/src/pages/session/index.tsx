import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { version as appVersion } from '../../../../../package.json';
import { useConfigStore, type PluginConfig } from '@/store/config';
import { useSessionStore, type SessionInfo } from '@/store/session';
import { useSettingsStore } from '@/store/settings';
import { useDebuggerStore } from '@/store/debugger';
import { Badge } from '@feather/ui/badge';
import { Button } from '@feather/ui/button';
import { Label } from '@feather/ui/label';
import { ScrollArea } from '@feather/ui/scroll-area';
import { Skeleton } from '@feather/ui/skeleton';
import { Switch } from '@feather/ui/switch';
import { useConfig } from '@/hooks/use-config';
import { sessionQueryKey } from '@/hooks/use-ws-connection';
import type { PerformanceMetrics } from '@/hooks/use-performance';
import { FEATHER_PLUGIN_API } from '@/constants/feather-api';
import { FEATHER_PROTOCOL_VERSION, evaluateProtocol } from '@/constants/feather-protocol';
import { cn } from '@/utils/styles';
import { isWeb } from '@/utils/platform';
import { formatMemory } from '@/lib/utils';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  BoxIcon,
  CheckCircle2Icon,
  CircleAlertIcon,
  CircleDotIcon,
  MonitorIcon,
  PuzzleIcon,
  SearchIcon,
  ServerIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
} from 'lucide-react';

type LockfileEntry = {
  version: string;
  trust: 'verified' | 'known' | 'experimental';
  installedAt: string;
};

type Lockfile = {
  lockfileVersion: number;
  packages: Record<string, LockfileEntry>;
};

type PluginStatus = 'enabled' | 'disabled' | 'incompatible';
type PluginFilter = 'all' | PluginStatus | 'risky';
type SessionHealthVerdict = 'Healthy' | 'Needs attention' | 'Disconnected' | 'Review security';

type RecommendedAction = {
  id: string;
  title: string;
  detail: string;
  tone: 'default' | 'warning' | 'danger';
  to?: string;
  onClick?: () => void;
};

type SessionWarning = {
  id: string;
  title: string;
  detail: string;
  tone: 'warning' | 'danger';
};

const RISKY_CAPABILITIES = new Set(['filesystem', 'network', 'binary']);
const EMPTY_BREAKPOINT_ERRORS: [] = [];

function joinPath(base: string, file: string): string {
  const sep = base.includes('\\') ? '\\' : '/';
  return `${base.replace(/[\\/]+$/, '')}${sep}${file}`;
}

function usePackageLockfile(rootPath: string | undefined, enabled: boolean) {
  return useQuery<Lockfile | null>({
    queryKey: ['session-lockfile', rootPath],
    queryFn: async () => {
      if (!rootPath) return null;
      const raw = await readTextFile(joinPath(rootPath, 'feather.lock.json'));
      return JSON.parse(raw) as Lockfile;
    },
    enabled: enabled && !isWeb() && !!rootPath,
    retry: false,
    staleTime: 30_000,
  });
}

function pluginStatus(plugin: PluginConfig): PluginStatus {
  if (plugin.incompatible) return 'incompatible';
  if (plugin.disabled) return 'disabled';
  return 'enabled';
}

function pluginHasRiskyCapability(plugin: PluginConfig) {
  return (plugin.capabilities ?? []).some((cap) => RISKY_CAPABILITIES.has(cap));
}

function latestMetric(data: PerformanceMetrics[] | undefined) {
  return data && data.length > 0 ? data[data.length - 1] : null;
}

function safeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function formatOptional(value: unknown, suffix = '') {
  const number = safeNumber(value);
  return number == null ? '—' : `${number}${suffix}`;
}

function isFrameHitch(metric: PerformanceMetrics | null) {
  if (!metric) return false;
  const maxFrameMs = Math.max(safeNumber(metric.frameTimeMax) ?? 0, safeNumber(metric.frameTime) ?? 0) * 1000;
  return maxFrameMs >= 33.33;
}

function isMemoryHigh(metric: PerformanceMetrics | null) {
  if (!metric) return false;
  const memory = safeNumber(metric.memory) ?? 0;
  const textureMemory = safeNumber(metric.stats?.texturememory) ?? 0;
  return memory >= 256 || textureMemory >= 128;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="break-all text-right font-mono text-xs">{value ?? '—'}</span>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border bg-card p-4', className)}>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function CapabilityBadge({ cap }: { cap: string }) {
  // Capabilities are a taxonomy, not states, and colouring them as states said
  // things that were not true — filesystem read as a warning, audio as "ok".
  // The distinction worth drawing is security weight: filesystem and network are
  // the two capabilities that let a plugin reach outside the game, and they are
  // what someone auditing a plugin list is scanning for. Everything else is
  // named by the badge itself and stays chrome.
  const elevated = cap === 'filesystem' || cap === 'network';
  return (
    <Badge
      variant="outline"
      className={cn(
        'h-4 px-1 text-[9px] font-normal',
        elevated ? 'border-warn-border text-warn' : 'border-muted-foreground/30 text-muted-foreground',
      )}
    >
      {cap}
    </Badge>
  );
}

function SummaryChip({
  label,
  value,
  tone = 'default',
  title,
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'good' | 'warning' | 'danger' | 'muted';
  title?: string;
}) {
  return (
    <div
      title={title}
      className={cn('flex min-w-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs', {
        'bg-muted/35': tone === 'default',
        'border-ok-border bg-ok-surface text-ok': tone === 'good',
        'border-warn-border bg-warn-surface text-warn': tone === 'warning',
        'border-destructive/35 bg-destructive/10 text-destructive': tone === 'danger',
        'text-muted-foreground': tone === 'muted',
      })}
    >
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate font-mono font-medium">{value}</span>
    </div>
  );
}

function ActionButton({ action }: { action: RecommendedAction }) {
  const button = (
    <Button
      size="sm"
      variant={action.tone === 'danger' ? 'destructive' : action.tone === 'warning' ? 'secondary' : 'outline'}
      className="h-7 shrink-0 px-2 text-xs"
      onClick={action.onClick}
    >
      Open
      <ArrowRightIcon className="size-3" />
    </Button>
  );

  if (action.to) {
    return (
      <Button
        asChild
        size="sm"
        variant={action.tone === 'danger' ? 'destructive' : action.tone === 'warning' ? 'secondary' : 'outline'}
        className="h-7 shrink-0 px-2 text-xs"
      >
        <Link to={action.to}>
          Open
          <ArrowRightIcon className="size-3" />
        </Link>
      </Button>
    );
  }

  return button;
}

function deriveHealthVerdict(session: SessionInfo, warnings: SessionWarning[]): SessionHealthVerdict {
  if (!session.connected && !session.kind) return 'Disconnected';
  if (warnings.some((warning) => warning.id === 'insecure' || warning.id === 'console-api-key')) return 'Review security';
  if (warnings.length > 0) return 'Needs attention';
  return 'Healthy';
}

export default function SessionPage() {
  const config = useConfigStore((state) => state.config);
  const disconnected = useConfigStore((state) => state.disconnected);
  const { updateContinueOnGameError } = useConfig();
  const sessionId = useSessionStore((state) => state.sessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const session = sessionId ? sessions[sessionId] : null;
  const openSettings = useSettingsStore((state) => state.setOpen);
  const globalApiKey = useSettingsStore((state) => state.apiKey);
  const sessionApiKeys = useSettingsStore((state) => state.sessionApiKeys);
  const debuggerStatus = useDebuggerStore((state) => (sessionId ? state.status[sessionId] : undefined));
  const pausedState = useDebuggerStore((state) => (sessionId ? state.pausedState[sessionId] : undefined));
  const breakpointErrors = useDebuggerStore((state) =>
    sessionId ? state.breakpointErrors[sessionId] ?? EMPTY_BREAKPOINT_ERRORS : EMPTY_BREAKPOINT_ERRORS,
  );
  const [pluginFilter, setPluginFilter] = useState<PluginFilter>('all');

  const isFileSession = session?.kind === 'log-file' || session?.kind === 'time-travel-file';
  const {
    data: lockfile,
    isLoading: lockfileLoading,
    isError: lockfileError,
  } = usePackageLockfile(config?.root_path, !!session && !isFileSession);
  const { data: performanceData = [] } = useQuery<PerformanceMetrics[]>({
    queryKey: sessionQueryKey.performance(sessionId ?? ''),
    queryFn: () => [],
    enabled: false,
  });

  const latestPerformance = latestMetric(performanceData);

  const pluginEntries = useMemo(() => Object.entries(config?.plugins ?? {}), [config?.plugins]);
  const pluginCounts = useMemo(() => {
    return pluginEntries.reduce(
      (counts, [, plugin]) => {
        const status = pluginStatus(plugin);
        counts[status] += 1;
        if (pluginHasRiskyCapability(plugin)) counts.risky += 1;
        return counts;
      },
      { enabled: 0, disabled: 0, incompatible: 0, risky: 0 },
    );
  }, [pluginEntries]);
  const filteredPluginEntries = pluginEntries.filter(([, plugin]) => {
    if (pluginFilter === 'all') return true;
    if (pluginFilter === 'risky') return pluginHasRiskyCapability(plugin);
    return pluginStatus(plugin) === pluginFilter;
  });

  if (!config || !session || !sessionId) return null;

  const packageEntries = lockfile ? Object.entries(lockfile.packages) : [];
  const capabilities = config.capabilities;
  const capAll = capabilities === 'all' || capabilities == null;
  const capList = !capAll && Array.isArray(capabilities) ? capabilities : [];
  const effectiveApiKey = sessionApiKeys[sessionId] || globalApiKey;
  const consolePlugin = config.plugins?.console;
  const consoleEnabled = !!consolePlugin && !consolePlugin.disabled && !consolePlugin.incompatible;
  const hotReload = config.debugger?.hotReload;
  const hotReloadEnabled = hotReload?.enabled === true || hotReload?.active === true;
  const hotReloadFailed = (hotReload?.failedModules ?? []).length;
  const hotReloadModified = (hotReload?.modifiedModules ?? []).length + (hotReload?.persistedModules ?? []).length;
  const debuggerEnabled = debuggerStatus?.enabled ?? config.debugger?.enabled ?? false;
  const debuggerProblemCount =
    (debuggerStatus?.rejectedBreakpoints?.length ?? 0) +
    (debuggerStatus?.breakpointErrors?.length ?? breakpointErrors.length);
  const apiMismatch = typeof config.API === 'number' && config.API !== FEATHER_PLUGIN_API;
  const protocol = evaluateProtocol(config.protocolVersion);
  const packageState = isWeb()
    ? 'Web'
    : isFileSession
      ? 'File session'
      : lockfileLoading
        ? 'Checking'
        : lockfile
          ? `${packageEntries.length}`
          : 'No lockfile';

  const warnings: SessionWarning[] = [];
  if (!session.connected && !session.kind) {
    warnings.push({
      id: 'disconnected',
      title: 'Session disconnected',
      detail: 'This session is selected but no longer receiving live runtime data.',
      tone: 'warning',
    });
  }
  if (session.insecure || config.security?.appIdRequired !== true) {
    warnings.push({
      id: 'insecure',
      title: 'Review security',
      detail: session.insecure
        ? 'This connection was accepted without a trusted app ID.'
        : 'This session does not report app ID enforcement.',
      tone: 'danger',
    });
  }
  // Only a genuine incompatibility degrades the health verdict. A runtime that
  // predates protocol negotiation still works, and every runtime shipped before
  // this existed omits the field — warning on that would show "Needs attention"
  // to every existing user the moment they update the desktop app. That case is
  // surfaced in the Protocol chip and detail rows instead.
  if (protocol.incompatible) {
    warnings.push({
      id: 'protocol',
      title: 'Protocol mismatch',
      detail: `${protocol.summary} ${protocol.remediation}`,
      tone: 'danger',
    });
  }
  if (apiMismatch || pluginCounts.incompatible > 0) {
    warnings.push({
      id: 'version',
      title: 'Version or plugin mismatch',
      detail: `${pluginCounts.incompatible} incompatible plugin(s), runtime v${config.version || '—'}, API ${config.API ?? '—'}.`,
      tone: pluginCounts.incompatible > 0 || apiMismatch ? 'danger' : 'warning',
    });
  }
  if (consoleEnabled && !effectiveApiKey) {
    warnings.push({
      id: 'console-api-key',
      title: 'Console needs an API key',
      detail: 'Console is enabled, but the desktop has no global or session API key configured.',
      tone: 'danger',
    });
  }
  if (hotReloadFailed > 0 || hotReloadModified > 0) {
    warnings.push({
      id: 'hot-reload',
      title: 'Hot Reload needs review',
      detail: `${hotReloadModified} modified module(s), ${hotReloadFailed} failed reload(s).`,
      tone: hotReloadFailed > 0 ? 'danger' : 'warning',
    });
  }
  if (pausedState || debuggerProblemCount > 0) {
    warnings.push({
      id: 'debugger',
      title: 'Debugger attention',
      detail: pausedState
        ? `Paused at ${pausedState.file}:${pausedState.line}.`
        : `${debuggerProblemCount} breakpoint sync or condition issue(s).`,
      tone: debuggerProblemCount > 0 ? 'danger' : 'warning',
    });
  }
  if (isFrameHitch(latestPerformance) || isMemoryHigh(latestPerformance)) {
    warnings.push({
      id: 'performance',
      title: 'Performance signal',
      detail: `Latest FPS ${formatOptional(latestPerformance?.fps)}, memory ${
        latestPerformance?.memory == null ? '—' : formatMemory(latestPerformance.memory, 2)
      }.`,
      tone: 'warning',
    });
  }
  if (!isWeb() && !isFileSession && !lockfileLoading && (lockfileError || !lockfile)) {
    warnings.push({
      id: 'packages',
      title: 'No package lockfile',
      detail: 'No feather.lock.json was found for this project root.',
      tone: 'warning',
    });
  }

  const healthVerdict = deriveHealthVerdict(session, warnings);
  const actions: RecommendedAction[] = [];
  if (!session.connected && !session.kind) {
    actions.push({
      id: 'refresh-session',
      title: 'Refresh the live session',
      detail: 'Reselect or reload the session to request current runtime data.',
      tone: 'warning',
      to: '/session',
    });
  }
  if (session.insecure || config.security?.appIdRequired !== true || (consoleEnabled && !effectiveApiKey)) {
    actions.push({
      id: 'security-settings',
      title: 'Review security settings',
      detail: 'Set app ID and API keys before using risky plugins like Console.',
      tone: 'danger',
      onClick: () => openSettings(true),
    });
  }
  if (apiMismatch || pluginCounts.incompatible > 0) {
    actions.push({
      id: 'review-plugins',
      title: 'Review runtime and plugins',
      detail: 'Check incompatible plugins and update runtime or desktop if needed.',
      tone: pluginCounts.incompatible > 0 || apiMismatch ? 'danger' : 'warning',
      to: '/session',
    });
  }
  if (hotReloadEnabled || hotReloadFailed > 0 || hotReloadModified > 0 || pausedState || debuggerProblemCount > 0) {
    actions.push({
      id: 'open-debugger',
      title: pausedState ? 'Resume or inspect debugger pause' : 'Open Debugger',
      detail: 'Inspect paused state, breakpoint issues, and Hot Reload status.',
      tone: hotReloadFailed > 0 || debuggerProblemCount > 0 ? 'danger' : 'warning',
      to: '/debugger',
    });
  }
  if (isFrameHitch(latestPerformance) || isMemoryHigh(latestPerformance)) {
    actions.push({
      id: 'open-performance',
      title: 'Inspect performance health',
      detail: 'Open charts, health verdicts, spikes, and profiler capture controls.',
      tone: 'warning',
      to: '/performance',
    });
  }
  if (!isWeb() && !isFileSession && !lockfileLoading && (lockfileError || !lockfile)) {
    actions.push({
      id: 'packages',
      title: 'Add package lockfile',
      detail: 'Run feather package install <name> from the project root when you start using packages.',
      tone: 'default',
      to: '/session',
    });
  }
  if (actions.length === 0) {
    actions.push({
      id: 'healthy',
      title: 'Keep debugging',
      detail: 'No urgent session issues detected. Open Logs or Performance when you need live detail.',
      tone: 'default',
      to: '/log',
    });
  }

  const healthTone =
    healthVerdict === 'Healthy'
      ? 'good'
      : healthVerdict === 'Review security'
        ? 'danger'
        : healthVerdict === 'Disconnected'
          ? 'warning'
          : 'warning';

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-4 px-4 py-4 md:py-6">
        <section
          data-testid="session-health-hub"
          className={cn('rounded-lg border p-4', {
            'border-ok-border bg-ok-surface': healthTone === 'good',
            'border-warn-border bg-warn-surface': healthTone === 'warning',
            'border-destructive/30 bg-destructive/5': healthTone === 'danger',
          })}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={healthTone === 'danger' ? 'destructive' : healthTone === 'good' ? 'secondary' : 'outline'}
                  className={cn('h-7 gap-1 text-sm', healthTone === 'good' && 'text-ok')}
                >
                  {healthTone === 'good' ? (
                    <CheckCircle2Icon className="size-3.5" />
                  ) : healthTone === 'danger' ? (
                    <ShieldAlertIcon className="size-3.5" />
                  ) : (
                    <AlertTriangleIcon className="size-3.5" />
                  )}
                  {healthVerdict}
                </Badge>
                <h1 className="min-w-0 truncate text-lg font-semibold">{config.sessionName || session.name || sessionId}</h1>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Connection, security, plugins, debugger, and runtime health for the active Feather session.
              </p>
            </div>
            <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[520px]">
              <SummaryChip
                label="Connection"
                value={session.connected && !disconnected ? 'Live' : session.kind ? 'File' : 'Disconnected'}
                tone={session.connected && !disconnected ? 'good' : session.kind ? 'muted' : 'warning'}
              />
              <SummaryChip label="Kind" value={session.kind ? session.kind.replaceAll('-', ' ') : 'live'} />
              <SummaryChip label="Runtime" value={config.version ? `v${config.version}` : '—'} />
              <SummaryChip label="API" value={config.API ?? '—'} tone={apiMismatch ? 'danger' : 'default'} />
              <SummaryChip
                label="Protocol"
                value={protocol.runtime === null ? 'legacy' : `v${protocol.runtime}`}
                tone={protocol.incompatible ? 'danger' : protocol.status === 'ok' ? 'default' : 'warning'}
              />
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <SummaryChip label="Plugins" value={`${pluginCounts.enabled} on`} tone={pluginCounts.enabled > 0 ? 'good' : 'muted'} />
            <SummaryChip
              label="Disabled"
              value={pluginCounts.disabled}
              tone={pluginCounts.disabled > 0 ? 'muted' : 'default'}
            />
            <SummaryChip
              label="Incompatible"
              value={pluginCounts.incompatible}
              tone={pluginCounts.incompatible > 0 ? 'danger' : 'default'}
            />
            <SummaryChip
              label="Capabilities"
              value={capAll ? 'all' : capList.length || 'none'}
              tone={capAll || capList.some((cap) => RISKY_CAPABILITIES.has(cap)) ? 'warning' : 'default'}
            />
            <SummaryChip
              label="Debugger"
              value={pausedState ? 'paused' : debuggerEnabled ? 'on' : 'off'}
              tone={pausedState || debuggerProblemCount > 0 ? 'warning' : debuggerEnabled ? 'good' : 'muted'}
            />
            <SummaryChip
              label="Console"
              value={consoleEnabled ? (effectiveApiKey ? 'key set' : 'no key') : 'off'}
              tone={consoleEnabled ? (effectiveApiKey ? 'warning' : 'danger') : 'muted'}
            />
            <SummaryChip
              label="Hot Reload"
              value={hotReloadEnabled ? (hotReloadFailed > 0 ? `failed ${hotReloadFailed}` : 'on') : 'off'}
              tone={hotReloadFailed > 0 ? 'danger' : hotReloadEnabled ? 'warning' : 'muted'}
            />
            <SummaryChip label="Packages" value={packageState} tone={packageState === 'No lockfile' ? 'warning' : 'default'} />
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Section title="Recommended Next Actions" icon={CircleAlertIcon}>
            <div className="grid gap-2">
              {actions.slice(0, 5).map((action) => (
                <div
                  key={action.id}
                  className={cn('flex items-start justify-between gap-3 rounded-md border bg-muted/25 px-3 py-2', {
                    'border-warn-border bg-warn-surface': action.tone === 'warning',
                    'border-destructive/35 bg-destructive/10': action.tone === 'danger',
                  })}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{action.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{action.detail}</p>
                  </div>
                  <ActionButton action={action} />
                </div>
              ))}
            </div>
          </Section>

          <Section title={`Warnings (${warnings.length})`} icon={ShieldAlertIcon}>
            {warnings.length === 0 ? (
              <div className="flex items-center gap-2 rounded-md border border-ok-border bg-ok-surface px-3 py-2 text-sm text-ok">
                <CheckCircle2Icon className="size-4" />
                No urgent session issues detected.
              </div>
            ) : (
              <div className="grid gap-2">
                {warnings.map((warning) => (
                  <div
                    key={warning.id}
                    className={cn('rounded-md border px-3 py-2', {
                      'border-warn-border bg-warn-surface': warning.tone === 'warning',
                      'border-destructive/35 bg-destructive/10': warning.tone === 'danger',
                    })}
                  >
                    <p className="text-sm font-medium">{warning.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{warning.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Session" icon={MonitorIcon}>
            <InfoRow label="Name" value={config.sessionName || session.name} />
            <InfoRow label="Device ID" value={session.deviceId} />
            <InfoRow label="Session ID" value={sessionId} />
            <InfoRow label="Sample rate" value={config.sampleRate ? `${config.sampleRate}s` : undefined} />
            <InfoRow label="Save directory" value={config.location} />
            <InfoRow label="Project root" value={config.root_path} />
            <InfoRow label="Source root" value={config.sourceDir} />
            <div className="mt-2 flex items-center justify-between gap-4 rounded-md border bg-danger-surface px-2 py-2">
              <div>
                <Label htmlFor="continue-on-game-error" className="text-xs font-medium">
                  Keep Running After Callback Crashes
                </Label>
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  Log game lifecycle errors to Feather instead of letting them stop the loop.
                </p>
              </div>
              <Switch
                id="continue-on-game-error"
                checked={config.continueOnGameError === true}
                disabled={isFileSession}
                onCheckedChange={updateContinueOnGameError}
              />
            </div>
            {session.insecure && (
              <div className="mt-2 flex items-center gap-2 rounded-md border border-warn-border bg-warn-surface px-2 py-1.5">
                <ShieldOffIcon className="size-3.5 text-warn" />
                <span className="text-xs text-warn">
                  Insecure connection — set appId in feather.config.lua
                </span>
              </div>
            )}
          </Section>

          <Section title="Environment" icon={ServerIcon}>
            <InfoRow label="OS" value={config.sysInfo?.os || session.os} />
            <InfoRow label="Architecture" value={config.sysInfo?.arch} />
            <InfoRow label="CPU cores" value={config.sysInfo?.cpuCount} />
            <InfoRow label="LÖVE version" value={config.sysInfo?.loveVersion} />
            <InfoRow label="Feather runtime" value={config.version ? `v${config.version}` : undefined} />
            <InfoRow label="Desktop version" value={`v${appVersion}`} />
            <InfoRow label="API version" value={config.API ?? undefined} />
            <InfoRow
              label="Protocol version"
              value={`${protocol.runtime === null ? 'not reported' : `v${protocol.runtime}`} (desktop speaks v${FEATHER_PROTOCOL_VERSION})`}
            />
            <InfoRow
              label="Latest performance"
              value={
                latestPerformance ? (
                  `${formatOptional(latestPerformance.fps)} FPS / ${
                    safeNumber(latestPerformance.frameTime) == null
                      ? '—'
                      : `${(latestPerformance.frameTime * 1000).toFixed(1)} ms`
                  }`
                ) : undefined
              }
            />
            <InfoRow
              label="Capabilities"
              value={
                capAll ? (
                  <span className="flex items-center gap-1 text-ok">
                    <ShieldCheckIcon className="size-3" />
                    all
                  </span>
                ) : capList.length > 0 ? (
                  <span className="flex flex-wrap justify-end gap-1">
                    {capList.map((c) => (
                      <CapabilityBadge key={c} cap={c} />
                    ))}
                  </span>
                ) : (
                  <span className="text-muted-foreground">none</span>
                )
              }
            />
          </Section>
        </div>

        <Section title={`Plugins (${pluginEntries.length})`} icon={PuzzleIcon}>
          <div className="mb-3 flex flex-wrap gap-2">
            {[
              ['all', `All ${pluginEntries.length}`],
              ['enabled', `Enabled ${pluginCounts.enabled}`],
              ['disabled', `Disabled ${pluginCounts.disabled}`],
              ['incompatible', `Incompatible ${pluginCounts.incompatible}`],
              ['risky', `Risky ${pluginCounts.risky}`],
            ].map(([value, label]) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={pluginFilter === value ? 'secondary' : 'outline'}
                className="h-7 px-2 text-xs"
                onClick={() => setPluginFilter(value as PluginFilter)}
              >
                {value === 'risky' ? <ShieldAlertIcon className="size-3" /> : <CircleDotIcon className="size-3" />}
                {label}
              </Button>
            ))}
          </div>
          {pluginEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No plugins reported by this session.</p>
          ) : filteredPluginEntries.length === 0 ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/25 px-3 py-2 text-xs text-muted-foreground">
              <SearchIcon className="size-3.5" />
              No plugins match this filter.
            </div>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {filteredPluginEntries.map(([id, plugin]) => {
                const status = pluginStatus(plugin);
                const caps = plugin.capabilities ?? [];
                return (
                  <div
                    key={id}
                    data-testid={`session-plugin-${id}`}
                    className="flex flex-col gap-1 rounded-md border bg-muted/30 px-2.5 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs">{plugin.tabName || id}</p>
                        {plugin.version && <p className="text-[10px] text-muted-foreground">v{plugin.version}</p>}
                      </div>
                      <Badge
                        variant="outline"
                        className={cn('ml-auto h-5 shrink-0 text-[10px]', {
                          'border-ok-border text-ok': status === 'enabled',
                          'border-muted-foreground/30 text-muted-foreground': status === 'disabled',
                          'border-destructive/30 text-destructive': status === 'incompatible',
                        })}
                      >
                        {status}
                      </Badge>
                    </div>
                    {caps.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {caps.map((c) => (
                          <CapabilityBadge key={c} cap={c} />
                        ))}
                      </div>
                    )}
                    {plugin.incompatibilityReason && (
                      <p className="text-[10px] text-destructive">{plugin.incompatibilityReason}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title={lockfile ? `Packages (${packageEntries.length})` : 'Packages'} icon={BoxIcon}>
          {isWeb() || isFileSession ? (
            <p className="text-xs text-muted-foreground">
              Package lockfile checks are not available for {isFileSession ? 'file sessions' : 'the web app'}.
            </p>
          ) : lockfileLoading ? (
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-md" />
              ))}
            </div>
          ) : lockfileError || !lockfile ? (
            <p className="text-xs text-muted-foreground">
              No feather.lock.json found {'-->'} Run{' '}
              <span className="font-mono font-semibold">feather package install &lt;name&gt;</span> to add packages.
            </p>
          ) : packageEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No packages installed.</p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {packageEntries.map(([id, pkg]) => (
                <div key={id} className="flex items-center justify-between rounded-md border bg-muted/30 px-2.5 py-1.5">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs">{id}</p>
                    <p className="text-[10px] text-muted-foreground">{pkg.version}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn('ml-2 h-5 shrink-0 text-[10px]', {
                      'border-ok-border text-ok': pkg.trust === 'verified',
                      'border-warn-border text-warn': pkg.trust === 'known',
                      'border-muted-foreground/30 text-muted-foreground': pkg.trust === 'experimental',
                    })}
                  >
                    {pkg.trust}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </ScrollArea>
  );
}
