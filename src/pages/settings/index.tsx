import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openFolderDialog } from '@tauri-apps/plugin-dialog';
import { Button, CopyButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSettingsStore } from '@/store/settings';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DEFAULT_PINNED_SIDEBAR_TOOLS,
  MAIN_FEATURES,
  SIDEBAR_TOOL_ORDER,
  type MainFeatureId,
  type SidebarToolId,
} from '@/constants/main-features';
import { useConfig } from '@/hooks/use-config';
import { useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';
import { MobileConnection } from '@/components/mobile-connection';
import { openUrl } from '@/utils/linking';
import { cn } from '@/utils/styles';
import { normalizeThemePreference, themeSelectorGroups, type ThemeSelectorOption } from '@/assets/theme/registry';
import { version as appVersion } from '../../../package.json';
import {
  ActivityIcon,
  CheckCircle2Icon,
  CodeIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  KeyRoundIcon,
  MonitorIcon,
  NetworkIcon,
  PaletteIcon,
  RefreshCwIcon,
  SquareIcon,
  Settings2Icon,
  ShieldIcon,
  SmartphoneIcon,
  StarIcon,
  TerminalIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';

const INSTALL_DOCS_URL = 'https://kyonru.github.io/feather/installation/';
const CLI_DOCS_URL = 'https://kyonru.github.io/feather/cli/';

function normalizeVersion(version?: string | null) {
  return version?.trim().replace(/^v/i, '') ?? '';
}

type CliStatus = {
  installed: boolean;
  path?: string | null;
  version?: string | null;
  source?: string | null;
  nodeVersion?: string | null;
  npmVersion?: string | null;
  error?: string | null;
  installDocsUrl: string;
  cliDocsUrl: string;
};

type DoctorCheck = {
  group: string;
  label: string;
  severity: 'pass' | 'warn' | 'fail' | 'info';
  detail?: string;
  fix?: string;
};

type DoctorResult = {
  failures?: number;
  warnings?: number;
  checks?: DoctorCheck[];
};

type VendorResult = {
  vendors?: Array<{
    target: string;
    configured: boolean;
    exists: boolean;
    valid: boolean;
    detail: string;
    configuredPath?: string;
    relativePath?: string;
  }>;
};

type CliProjectStatus = {
  cli: CliStatus;
  projectDir: string;
  doctor?: DoctorResult | null;
  buildDoctor?: DoctorResult | null;
  vendors?: VendorResult | null;
  errors: string[];
};

type CliActionKind =
  | 'doctor'
  | 'buildVendorList'
  | 'buildVendorAdd'
  | 'skillsList'
  | 'skillsInstall'
  | 'packageList'
  | 'packageInstall'
  | 'packageRemove'
  | 'packageAudit'
  | 'pluginList'
  | 'pluginInstall'
  | 'init'
  | 'configPlugins';

type CliJobStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

type CliJobSnapshot = {
  id: string;
  kind: CliActionKind;
  status: CliJobStatus;
  commandPreview: string;
  projectDir?: string | null;
  startedAt: string;
  endedAt?: string | null;
  exitCode?: number | null;
  stdoutTail: string;
  stderrTail: string;
  json?: unknown;
  error?: string | null;
};

type CliActionRequest = {
  kind: CliActionKind;
  projectDir?: string;
  cliPath?: string;
  options?: Record<string, unknown>;
  dryRun?: boolean;
  confirmed?: boolean;
};

type McpBridgeSettings = {
  enabled: boolean;
  token: string;
  bridgeUrl: string;
  configPath: string;
};

const settingsTabs = [
  {
    value: 'connection',
    label: 'Connection',
    description: 'Ports, session timing, and mobile pairing.',
    icon: NetworkIcon,
  },
  {
    value: 'general',
    label: 'General',
    description: 'Appearance, sidebar tools, assets, and editor paths.',
    icon: MonitorIcon,
  },
  {
    value: 'security',
    label: 'Security',
    description: 'App identity and Console API keys.',
    icon: ShieldIcon,
  },
  {
    value: 'cli',
    label: 'CLI',
    description: 'Install status, project doctor, and build vendors.',
    icon: TerminalIcon,
  },
] as const;

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border bg-card shadow-xs">
      <div className="flex items-start gap-3 border-b bg-muted/20 px-4 py-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
          <Icon className="size-4 text-muted-foreground" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>}
        </div>
      </div>
      <div className="grid gap-4 p-4">{children}</div>
    </section>
  );
}

function FieldDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

function SettingsGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 lg:grid-cols-2">{children}</div>;
}

function SettingsMetrics({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-2 sm:grid-cols-3">{children}</div>;
}

function SettingsMetric({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'good' | 'warn';
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-md border bg-background/70 px-3 py-2.5',
        tone === 'good' && 'border-emerald-500/30 bg-emerald-500/5',
        tone === 'warn' && 'border-amber-500/35 bg-amber-500/5',
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground',
          tone === 'good' && 'border-emerald-500/30 text-emerald-600',
          tone === 'warn' && 'border-amber-500/35 text-amber-600',
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="block truncate text-sm font-semibold">{value}</span>
      </span>
    </div>
  );
}

function SettingsTabContent({
  value,
  title,
  description,
  children,
}: {
  value: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <TabsContent value={value} className="m-0 h-full min-h-0 data-[state=inactive]:hidden">
      <ScrollArea className="h-full">
        <div className="grid gap-5 p-4 pb-12 sm:p-5">
          <div className="rounded-md border bg-muted/20 px-4 py-3">
            <div className="min-w-0">
              <p className="text-base font-semibold">{title}</p>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
            </div>
          </div>
          {children}
        </div>
      </ScrollArea>
    </TabsContent>
  );
}

function ThemeSwatches({ option }: { option: Pick<ThemeSelectorOption, 'swatches'> }) {
  return (
    <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
      {option.swatches.map((swatch, index) => (
        <span
          key={`${swatch}-${index}`}
          className="size-3 rounded-full border border-black/10 dark:border-white/15"
          style={{ backgroundColor: swatch }}
        />
      ))}
    </span>
  );
}

function ThemeOptionLabel({ option }: { option: ThemeSelectorOption }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ThemeSwatches option={option} />
      <span className="truncate">{option.label}</span>
    </span>
  );
}

function ThemeToggle() {
  const theme = useSettingsStore((state) => state.theme);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const selectedTheme = normalizeThemePreference(theme);

  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-theme">App Theme</Label>
      <Select
        value={selectedTheme}
        onValueChange={(value) => {
          setTheme(normalizeThemePreference(value));
        }}
      >
        <SelectTrigger id="setting-theme" className="w-full justify-between">
          <SelectValue aria-label={selectedTheme} />
        </SelectTrigger>
        <SelectContent className="max-h-96">
          {themeSelectorGroups.map((group, index) => (
            <SelectGroup key={group.label}>
              <SelectLabel>{group.label}</SelectLabel>
              {group.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <ThemeOptionLabel option={option} />
                </SelectItem>
              ))}
              {index < themeSelectorGroups.length - 1 && <SelectSeparator />}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>
        The selected theme styles Feather chrome and syntax-highlighted code surfaces.
      </FieldDescription>
    </div>
  );
}

function GeneralOverview() {
  const theme = normalizeThemePreference(useSettingsStore((state) => state.theme));
  const hiddenMainFeatures = useSettingsStore((state) => state.hiddenMainFeatures);
  const pinnedSidebarTools = useSettingsStore((state) => state.pinnedSidebarTools);
  const assetSourceDir = useSettingsStore((state) => state.assetSourceDir);
  const selectedThemeLabel =
    themeSelectorGroups.flatMap((group) => group.options).find((option) => option.value === theme)?.label ?? 'System';
  const visibleFeatures = MAIN_FEATURES.length - hiddenMainFeatures.length;
  const visiblePinnedTools = pinnedSidebarTools.filter(
    (toolId) => toolId === 'session' || !hiddenMainFeatures.includes(toolId),
  );

  return (
    <SettingsMetrics>
      <SettingsMetric icon={PaletteIcon} label="Theme" value={selectedThemeLabel} />
      <SettingsMetric
        icon={MonitorIcon}
        label="Sidebar tools"
        value={`${visibleFeatures}/${MAIN_FEATURES.length} visible, ${visiblePinnedTools.length} pinned`}
      />
      <SettingsMetric icon={FolderIcon} label="Asset source" value={assetSourceDir || 'Session default'} />
    </SettingsMetrics>
  );
}

const optionalFeatureDefaults: MainFeatureId[] = [
  'console',
  'particle-system-playground',
  'shader-graph',
  'texture-lab',
  'time-travel',
  'session-replay',
  'compare',
];

const sidebarToolOptions: Array<{ id: SidebarToolId; title: string; helper?: string }> = SIDEBAR_TOOL_ORDER.map(
  (toolId) => {
    if (toolId === 'session') return { id: toolId, title: 'Session' };
    const feature = MAIN_FEATURES.find((item) => item.id === toolId);
    return {
      id: toolId,
      title: feature?.title ?? toolId,
      helper: toolId === 'compare' ? '2 sessions' : undefined,
    };
  },
);

function PinnedSidebarToolsInput() {
  const hiddenMainFeatures = useSettingsStore((state) => state.hiddenMainFeatures);
  const pinnedSidebarTools = useSettingsStore((state) => state.pinnedSidebarTools);
  const togglePinnedSidebarTool = useSettingsStore((state) => state.togglePinnedSidebarTool);
  const setPinnedSidebarTools = useSettingsStore((state) => state.setPinnedSidebarTools);

  return (
    <div data-testid="pinned-sidebar-tools-editor" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Label>Pinned Tools</Label>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <StarIcon className="size-3" />
              {pinnedSidebarTools.length} pinned
            </Badge>
          </div>
          <FieldDescription>
            Pinned tools appear in Favorites at the top of the sidebar. Hidden tools stay hidden until re-enabled.
          </FieldDescription>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPinnedSidebarTools(DEFAULT_PINNED_SIDEBAR_TOOLS)}
          >
            Restore defaults
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setPinnedSidebarTools([])}>
            Clear pins
          </Button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {sidebarToolOptions.map((tool) => {
          const checked = pinnedSidebarTools.includes(tool.id);
          const hidden = tool.id !== 'session' && hiddenMainFeatures.includes(tool.id);
          return (
            <div
              key={tool.id}
              className={cn(
                'flex items-center gap-2 rounded-md border bg-background/70 px-3 py-2 transition-colors',
                hidden ? 'border-dashed bg-muted/25 text-muted-foreground' : 'border-border',
              )}
            >
              <Checkbox
                id={`tool-pinned-${tool.id}`}
                checked={checked}
                onCheckedChange={() => togglePinnedSidebarTool(tool.id)}
              />
              <Label
                htmlFor={`tool-pinned-${tool.id}`}
                className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2"
              >
                <span className="truncate">{tool.title}</span>
                <span className="flex shrink-0 items-center gap-1">
                  {hidden && (
                    <Badge variant="outline" className="text-[10px]">
                      Hidden
                    </Badge>
                  )}
                  {tool.helper && (
                    <span className="text-[10px] text-muted-foreground" aria-hidden="true">
                      {tool.helper}
                    </span>
                  )}
                </span>
              </Label>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SidebarFeaturesInput() {
  const hiddenMainFeatures = useSettingsStore((state) => state.hiddenMainFeatures);
  const showHiddenMainFeaturesInCommandCenter = useSettingsStore(
    (state) => state.showHiddenMainFeaturesInCommandCenter,
  );
  const toggleHiddenMainFeature = useSettingsStore((state) => state.toggleHiddenMainFeature);
  const setHiddenMainFeatures = useSettingsStore((state) => state.setHiddenMainFeatures);
  const setShowHiddenMainFeaturesInCommandCenter = useSettingsStore(
    (state) => state.setShowHiddenMainFeaturesInCommandCenter,
  );
  const visibleFeatureCount = MAIN_FEATURES.length - hiddenMainFeatures.length;

  return (
    <div data-testid="sidebar-features-editor" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <Label>Sidebar Features</Label>
            <Badge variant="outline" className="text-[10px]">
              {visibleFeatureCount}/{MAIN_FEATURES.length} visible
            </Badge>
          </div>
          <FieldDescription>
            Hide tools you do not use often. Hidden tools can still be opened by direct route.
          </FieldDescription>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setHiddenMainFeatures([])}>
            Show all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setHiddenMainFeatures(optionalFeatureDefaults)}
          >
            Hide extras
          </Button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {MAIN_FEATURES.map((feature) => {
          const checked = !hiddenMainFeatures.includes(feature.id);
          return (
            <div
              key={feature.id}
              className={cn(
                'flex items-center gap-2 rounded-md border bg-background/70 px-3 py-2 transition-colors',
                checked ? 'border-border' : 'border-dashed bg-muted/25 text-muted-foreground',
              )}
            >
              <Checkbox
                id={`feature-visible-${feature.id}`}
                checked={checked}
                onCheckedChange={() => toggleHiddenMainFeature(feature.id)}
              />
              <Label
                htmlFor={`feature-visible-${feature.id}`}
                className="flex min-w-0 flex-1 cursor-pointer items-center justify-between gap-2"
              >
                <span className="truncate">{feature.title}</span>
                {feature.id === 'compare' && (
                  <span className="text-[10px] text-muted-foreground" aria-hidden="true">
                    2 sessions
                  </span>
                )}
              </Label>
            </div>
          );
        })}
      </div>
      <div className="flex items-start gap-2 rounded-md border bg-muted/20 px-3 py-2">
        <Checkbox
          id="setting-command-center-hidden-features"
          checked={showHiddenMainFeaturesInCommandCenter}
          onCheckedChange={(checked) => setShowHiddenMainFeaturesInCommandCenter(checked === true)}
        />
        <div className="grid gap-1">
          <Label htmlFor="setting-command-center-hidden-features" className="cursor-pointer">
            Show hidden sidebar features in Command Center
          </Label>
          <FieldDescription>
            When disabled, tools hidden from the sidebar are also hidden from Command Center search. Direct routes still
            work.
          </FieldDescription>
        </div>
      </div>
    </div>
  );
}

function PortInput() {
  const port = useSettingsStore((state) => state.port);
  const setPort = useSettingsStore((state) => state.setPort);
  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-port">WebSocket Port</Label>
      <Input
        id="setting-port"
        type="number"
        min="1"
        max="65535"
        value={port}
        onChange={(e) => {
          if (e.target.value) setPort(parseInt(e.target.value));
        }}
      />
      <FieldDescription>Port the desktop app listens on. Games connect to this port (default: 4004).</FieldDescription>
    </div>
  );
}

function ConnectionTimeoutInput() {
  const timeout = useSettingsStore((state) => state.connectionTimeout);
  const setConnectionTimeout = useSettingsStore((state) => state.setConnectionTimeout);
  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-timeout">Connection Timeout (seconds)</Label>
      <Input
        id="setting-timeout"
        type="number"
        min="1"
        max="120"
        value={timeout}
        onChange={(e) => {
          if (e.target.value) setConnectionTimeout(parseInt(e.target.value));
        }}
      />
      <FieldDescription>
        Seconds without a message before a session is considered disconnected (default: 15).
      </FieldDescription>
    </div>
  );
}

function ConnectionOverview() {
  const port = useSettingsStore((state) => state.port);
  const timeout = useSettingsStore((state) => state.connectionTimeout);
  const sessionId = useSessionStore((state) => state.sessionId);
  const session = useSessionStore((state) => (state.sessionId ? state.sessions[state.sessionId] : null));

  return (
    <SettingsMetrics>
      <SettingsMetric icon={NetworkIcon} label="WebSocket" value={`:${port}`} />
      <SettingsMetric icon={ActivityIcon} label="Timeout" value={`${timeout}s`} />
      <SettingsMetric
        icon={MonitorIcon}
        label="Active session"
        value={session?.name ?? 'None selected'}
        tone={sessionId ? 'good' : 'warn'}
      />
    </SettingsMetrics>
  );
}

function SampleRateInput() {
  const sampleRate = useConfigStore((state) => state.config?.sampleRate);
  const { updateSampleRate } = useConfig();
  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-sample-rate">Sample Rate (seconds)</Label>
      <Input
        id="setting-sample-rate"
        type="number"
        min={1}
        max={100}
        value={sampleRate}
        onChange={(e) => {
          if (e.target.value) updateSampleRate(e.target.value as unknown as number);
        }}
      />
      <FieldDescription>
        How often the game pushes performance, observers, and plugin data. Requires an active session.
      </FieldDescription>
    </div>
  );
}

function ApiKeyInput() {
  const apiKey = useSettingsStore((state) => state.apiKey);
  const setApiKey = useSettingsStore((state) => state.setApiKey);
  const [visible, setVisible] = useState(false);
  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-api-key">API Key</Label>
      <div className="relative">
        <Input
          id="setting-api-key"
          type={visible ? 'text' : 'password'}
          value={apiKey}
          placeholder="Leave empty to disable auth"
          onChange={(e) => setApiKey(e.target.value)}
          className="pr-9"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label={visible ? 'Hide API key' : 'Show API key'}
        >
          {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </div>
      <FieldDescription>
        Default key used when a session does not have its own override. Must match the{' '}
        <code className="font-mono">apiKey</code> in your game's Feather config for Console eval.
      </FieldDescription>
    </div>
  );
}

function AppIdInput() {
  const appId = useSettingsStore((state) => state.appId);
  const regenerateAppId = useSettingsStore((state) => state.regenerateAppId);
  const appIdRequired = useConfigStore((state) => state.config?.security?.appIdRequired === true);

  const copyAppId = () => {
    navigator.clipboard?.writeText(appId).catch(() => {});
  };

  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-app-id">Desktop App ID</Label>
      <div className="flex gap-2">
        <Input id="setting-app-id" value={appId} disabled className="font-mono text-sm" />
        <Button type="button" variant="outline" size="icon" onClick={copyAppId} title="Copy app ID">
          <CopyIcon className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={regenerateAppId} title="Generate a new app ID">
          <RefreshCwIcon className="size-4" />
        </Button>
      </div>
      <FieldDescription>
        Paste this value into <code className="font-mono">appId</code> in{' '}
        <code className="font-mono">feather.config.lua</code> to make the game accept commands only from this desktop
        app.
        {appIdRequired ? ' The active session requires a matching app ID.' : ''}
      </FieldDescription>
    </div>
  );
}

function SecurityOverview() {
  const apiKey = useSettingsStore((state) => state.apiKey);
  const sessionId = useSessionStore((state) => state.sessionId);
  const sessionApiKeys = useSettingsStore((state) => state.sessionApiKeys);
  const appIdRequired = useConfigStore((state) => state.config?.security?.appIdRequired === true);
  const hasSessionOverride = Boolean(sessionId && sessionApiKeys[sessionId]);

  return (
    <SettingsMetrics>
      <SettingsMetric
        icon={ShieldIcon}
        label="App ID"
        value={appIdRequired ? 'Required by session' : 'Available'}
        tone={appIdRequired ? 'warn' : 'good'}
      />
      <SettingsMetric
        icon={KeyRoundIcon}
        label="Default API key"
        value={apiKey ? 'Configured' : 'Not set'}
        tone={apiKey ? 'good' : 'warn'}
      />
      <SettingsMetric
        icon={MonitorIcon}
        label="Session override"
        value={hasSessionOverride ? 'Configured' : 'Using default'}
      />
    </SettingsMetrics>
  );
}

function McpAccessPanel() {
  const [settings, setSettings] = useState<McpBridgeSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(false);

  const refresh = () => {
    setLoading(true);
    invoke<McpBridgeSettings>('get_mcp_bridge_settings')
      .then(setSettings)
      .catch(() => {
        setSettings(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const setEnabled = (enabled: boolean) => {
    invoke<McpBridgeSettings>('set_mcp_bridge_enabled', { enabled })
      .then((next) => {
        setSettings(next);
        toast.success(enabled ? 'MCP access enabled' : 'MCP access disabled');
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Could not update MCP access');
      });
  };

  const regenerate = () => {
    invoke<McpBridgeSettings>('regenerate_mcp_bridge_token')
      .then((next) => {
        setSettings(next);
        toast.success('MCP token regenerated');
      })
      .catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Could not regenerate MCP token');
      });
  };

  const copy = (value: string, label: string) => {
    navigator.clipboard?.writeText(value).then(
      () => toast.success(`${label} copied`),
      () => toast.error(`Could not copy ${label.toLowerCase()}`),
    );
  };

  const token = settings?.token ?? '';
  const stdioConfig = token
    ? JSON.stringify(
        {
          mcpServers: {
            feather: {
              command: 'feather',
              args: ['mcp'],
              env: { FEATHER_MCP_TOKEN: token },
            },
          },
        },
        null,
        2,
      )
    : '';

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-4 rounded-md border bg-background/70 px-3 py-3">
        <div className="min-w-0">
          <Label htmlFor="setting-mcp-enabled">MCP Access</Label>
          <FieldDescription>
            Allows local MCP clients to inspect and control live Feather sessions through a token-protected localhost
            bridge.
          </FieldDescription>
        </div>
        <Checkbox
          id="setting-mcp-enabled"
          checked={settings?.enabled === true}
          disabled={loading || !settings}
          onCheckedChange={(checked) => setEnabled(checked === true)}
          aria-label="Enable MCP access"
        />
      </div>

      <SettingsMetrics>
        <SettingsMetric
          icon={ShieldIcon}
          label="Bridge"
          value={settings?.enabled ? 'Enabled' : loading ? 'Checking' : 'Disabled'}
          tone={settings?.enabled ? 'good' : 'warn'}
        />
        <SettingsMetric icon={NetworkIcon} label="URL" value={settings?.bridgeUrl ?? 'Unavailable'} />
        <SettingsMetric icon={KeyRoundIcon} label="Token" value={token ? 'Generated' : 'Missing'} tone={token ? 'good' : 'warn'} />
      </SettingsMetrics>

      <div className="rounded-md border bg-muted/20 px-3 py-2">
        <p className="text-xs font-medium">MCP Surface</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Sessions, plugin catalog/live state, Shader Graph, Particles Playground, and Texture Lab are available to
          authenticated local MCP clients.
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="setting-mcp-token">MCP Token</Label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Input
              id="setting-mcp-token"
              value={token}
              type={visible ? 'text' : 'password'}
              disabled
              className="font-mono text-sm pr-9"
            />
            <button
              type="button"
              onClick={() => setVisible((value) => !value)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={visible ? 'Hide MCP token' : 'Show MCP token'}
              disabled={!token}
            >
              {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={() => token && copy(token, 'MCP token')} title="Copy MCP token">
            <CopyIcon className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="icon" onClick={regenerate} title="Generate a new MCP token">
            <RefreshCwIcon className="size-4" />
          </Button>
        </div>
        <FieldDescription>
          The same token is written to <code className="font-mono">{settings?.configPath ?? '~/.feather/mcp.json'}</code>{' '}
          so <code className="font-mono">feather mcp</code> can auto-discover it.
        </FieldDescription>
      </div>

      {stdioConfig && (
        <div className="grid gap-2">
          <Label>Local MCP Client Config</Label>
          <div className="grid gap-2 rounded-md border bg-muted/20 p-3">
            <pre className="max-h-56 overflow-auto text-xs font-mono leading-relaxed">{stdioConfig}</pre>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => copy(stdioConfig, 'MCP config')}>
                <CopyIcon className="mr-2 size-3.5" />
                Copy config
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copy(`FEATHER_MCP_TOKEN=${token} feather mcp --transport http`, 'MCP HTTP command')}
              >
                <TerminalIcon className="mr-2 size-3.5" />
                Copy HTTP command
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SessionApiKeyInput() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const session = useSessionStore((state) => (state.sessionId ? state.sessions[state.sessionId] : null));
  const globalApiKey = useSettingsStore((state) => state.apiKey);
  const sessionApiKeys = useSettingsStore((state) => state.sessionApiKeys);
  const setSessionApiKey = useSettingsStore((state) => state.setSessionApiKey);
  const [visible, setVisible] = useState(false);
  const value = sessionId ? (sessionApiKeys[sessionId] ?? '') : '';

  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-session-api-key">Active Session API Key</Label>
      <div className="relative">
        <Input
          id="setting-session-api-key"
          type={visible ? 'text' : 'password'}
          value={value}
          placeholder={globalApiKey ? 'Using default API key' : 'No default API key set'}
          disabled={!sessionId}
          onChange={(e) => {
            if (sessionId) setSessionApiKey(sessionId, e.target.value);
          }}
          className="pr-9"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          disabled={!sessionId}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          aria-label={visible ? 'Hide session API key' : 'Show session API key'}
        >
          {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
        </button>
      </div>
      <FieldDescription>
        Optional override for {session?.name ?? 'the selected session'}. Leave empty to use the default API key.
      </FieldDescription>
    </div>
  );
}

function AssetSourceDirInput() {
  const assetSourceDir = useSettingsStore((state) => state.assetSourceDir);
  const setAssetSourceDir = useSettingsStore((state) => state.setAssetSourceDir);
  const autoSourceDir = useConfigStore((state) => state.config?.sourceDir ?? '');
  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-asset-source-dir">Asset Source Directory</Label>
      <div className="relative">
        <FolderIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          id="setting-asset-source-dir"
          value={assetSourceDir}
          placeholder={autoSourceDir || '/path/to/game/assets'}
          onChange={(e) => setAssetSourceDir(e.target.value)}
          className="font-mono text-sm pl-9"
        />
      </div>
      <FieldDescription>
        Override where the desktop looks for game asset files when previewing textures and fonts. Leave empty to use the
        source directory reported by the game ({autoSourceDir || 'not connected'}). Set this manually when the game runs
        on a different machine.
      </FieldDescription>
    </div>
  );
}

function TextEditorInput() {
  const textEditorPath = useSettingsStore((state) => state.textEditorPath);
  const setTextEditorPath = useSettingsStore((state) => state.setTextEditorPath);
  return (
    <div className="grid gap-2">
      <Label htmlFor="setting-editor">VS Code Executable Path</Label>
      <Input
        id="setting-editor"
        value={textEditorPath}
        placeholder="/usr/local/bin/code"
        onChange={(e) => {
          if (e.target.value) setTextEditorPath(e.target.value);
        }}
        className="font-mono text-sm"
      />
      <FieldDescription>
        Used to open stack trace file locations through a direct, shell-free VS Code launch. Do not include command
        arguments.
      </FieldDescription>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: DoctorCheck['severity'] }) {
  const className =
    severity === 'fail'
      ? 'border-red-500 text-red-600'
      : severity === 'warn'
        ? 'border-amber-500 text-amber-600'
        : severity === 'pass'
          ? 'border-emerald-500 text-emerald-600'
          : 'text-muted-foreground';

  return (
    <Badge variant="outline" className={`h-5 shrink-0 px-1.5 font-mono text-[10px] uppercase ${className}`}>
      {severity}
    </Badge>
  );
}

function cliJobTone(status: CliJobStatus): string {
  if (status === 'succeeded') return 'border-emerald-500 text-emerald-600';
  if (status === 'failed') return 'border-red-500 text-red-600';
  if (status === 'cancelled') return 'border-amber-500 text-amber-600';
  return 'text-muted-foreground';
}

function CliActionCard({
  title,
  description,
  testId,
  children,
}: {
  title: string;
  description: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2 rounded border p-3" data-testid={testId}>
      <div className="grid gap-0.5">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function CliJobsPanel({
  jobs,
  onCancel,
}: {
  jobs: CliJobSnapshot[];
  onCancel: (jobId: string) => void;
}) {
  if (jobs.length === 0) {
    return <p className="text-xs text-muted-foreground">No CLI jobs run from this window yet.</p>;
  }

  return (
    <div className="grid gap-2" data-testid="cli-jobs-panel">
      {jobs.slice(0, 5).map((job) => (
        <div key={job.id} className="grid gap-1 rounded border p-2 text-xs">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`h-5 px-1.5 font-mono text-[10px] uppercase ${cliJobTone(job.status)}`}>
              {job.status}
            </Badge>
            <span className="font-medium">{job.kind}</span>
            {job.status === 'running' && (
              <Button type="button" variant="ghost" size="sm" className="ml-auto h-6 px-2" onClick={() => onCancel(job.id)}>
                <SquareIcon className="size-3" />
                Cancel
              </Button>
            )}
          </div>
          <code className="truncate rounded bg-muted px-1.5 py-1 font-mono text-[11px]">{job.commandPreview}</code>
          {job.error && <p className="text-red-600">{job.error}</p>}
          {job.stderrTail && <p className="line-clamp-2 text-muted-foreground">{job.stderrTail}</p>}
          {job.json !== undefined && (
            <details>
              <summary className="cursor-pointer text-muted-foreground">JSON result</summary>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-muted p-2 text-[10px]">
                {JSON.stringify(job.json, null, 2)}
              </pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}

function CliStatusPanel() {
  const cliPath = useSettingsStore((state) => state.cliPath);
  const setCliPath = useSettingsStore((state) => state.setCliPath);
  const cliProjectDir = useSettingsStore((state) => state.cliProjectDir);
  const setCliProjectDir = useSettingsStore((state) => state.setCliProjectDir);
  const sourceDir = useConfigStore((state) => state.config?.sourceDir ?? '');
  const [status, setStatus] = useState<CliStatus | null>(null);
  const [projectStatus, setProjectStatus] = useState<CliProjectStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [jobs, setJobs] = useState<CliJobSnapshot[]>([]);
  const [packageNames, setPackageNames] = useState('');
  const [removePackageName, setRemovePackageName] = useState('');
  const [pluginIncludeIds, setPluginIncludeIds] = useState('');
  const [pluginExcludeIds, setPluginExcludeIds] = useState('');
  const [skillIds, setSkillIds] = useState('feather-project-context,feather-mcp-live-sessions');

  const projectDir = cliProjectDir || sourceDir;
  const doctorChecks = projectStatus?.doctor?.checks ?? [];
  const buildChecks = projectStatus?.buildDoctor?.checks ?? [];
  const vendorEntries = projectStatus?.vendors?.vendors ?? [];
  const importantChecks = useMemo(
    () =>
      [...doctorChecks, ...buildChecks]
        .filter((check) => check.severity === 'fail' || check.severity === 'warn')
        .slice(0, 8),
    [doctorChecks, buildChecks],
  );

  const refresh = async () => {
    setLoading(true);
    try {
      const nextStatus = await invoke<CliStatus>('get_cli_status', { cliPath: cliPath || null });
      setStatus(nextStatus);
      if (projectDir) {
        const nextProjectStatus = await invoke<CliProjectStatus>('get_cli_project_status', {
          projectDir,
          cliPath: cliPath || null,
        });
        setProjectStatus(nextProjectStatus);
      } else {
        setProjectStatus(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error), { position: 'bottom-center' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<CliJobSnapshot>('feather://cli-job', (event) => {
      if (disposed) return;
      setJobs((current) => [event.payload, ...current.filter((job) => job.id !== event.payload.id)].slice(0, 20));
    })
      .then((cleanup) => {
        if (disposed) cleanup();
        else unlisten = cleanup;
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const chooseProjectDir = async () => {
    const selected = await openFolderDialog({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      setCliProjectDir(selected);
      setProjectStatus(null);
    }
  };

  const splitIds = (value: string) =>
    value
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);

  const startJob = async (request: Omit<CliActionRequest, 'cliPath' | 'projectDir'> & { projectDir?: string }) => {
    const requestProjectDir = request.projectDir ?? projectDir;
    if (request.kind !== 'skillsList' && !requestProjectDir) {
      toast.error('Choose a project directory before running CLI project actions.', { position: 'bottom-center' });
      return;
    }
    try {
      const job = await invoke<CliJobSnapshot>('start_cli_job', {
        request: {
          ...request,
          projectDir: requestProjectDir || undefined,
          cliPath: cliPath || undefined,
        },
      });
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 20));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error), { position: 'bottom-center' });
    }
  };

  const confirmAndStart = (message: string, request: Omit<CliActionRequest, 'cliPath' | 'projectDir'>) => {
    if (!window.confirm(message)) return;
    void startJob({ ...request, confirmed: true });
  };

  const cancelJob = async (jobId: string) => {
    try {
      const job = await invoke<CliJobSnapshot>('cancel_cli_job', { jobId });
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)].slice(0, 20));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error), { position: 'bottom-center' });
    }
  };

  const cliInstalled = projectStatus?.cli.installed ?? status?.installed ?? false;
  const currentStatus = projectStatus?.cli ?? status;
  const summary = projectStatus?.buildDoctor ?? projectStatus?.doctor;
  const doctorProjectDir = projectStatus?.projectDir || projectDir;
  const cliVersionMismatch =
    cliInstalled &&
    Boolean(currentStatus?.version) &&
    normalizeVersion(currentStatus?.version) !== normalizeVersion(appVersion);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={cliInstalled ? 'secondary' : 'destructive'}>
            {cliInstalled ? 'CLI installed' : 'CLI missing'}
          </Badge>
          {currentStatus?.version && (
            <Badge variant="outline" className="font-mono">
              v{currentStatus.version}
            </Badge>
          )}
          {currentStatus?.source && <Badge variant="outline">{currentStatus.source}</Badge>}
        </div>
        {currentStatus?.path && (
          <p className="break-all font-mono text-xs text-muted-foreground">{currentStatus.path}</p>
        )}
        {currentStatus?.error && <p className="text-xs text-muted-foreground">{currentStatus.error}</p>}
        {cliVersionMismatch && (
          <div className="rounded border border-amber-500/50 bg-amber-50 p-2 text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            CLI version mismatch. Desktop is v{appVersion}, but the detected CLI is v{currentStatus?.version}. Update
            with <code className="font-mono">npm install -g @kyonru/feather</code>.
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCwIcon className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => openUrl(INSTALL_DOCS_URL)}>
            <ExternalLinkIcon className="size-4" />
            Installation Docs
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => openUrl(CLI_DOCS_URL)}>
            <ExternalLinkIcon className="size-4" />
            CLI Docs
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="setting-cli-path">CLI Path Override</Label>
        <Input
          id="setting-cli-path"
          value={cliPath}
          placeholder="feather"
          onChange={(event) => setCliPath(event.target.value)}
          className="font-mono text-sm"
        />
        <FieldDescription>
          Optional. Leave empty to detect <code className="font-mono">feather</code> automatically.
        </FieldDescription>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="setting-cli-project">Project Directory</Label>
        <div className="flex gap-2">
          <Input
            id="setting-cli-project"
            value={cliProjectDir}
            placeholder={sourceDir || '/path/to/my-game'}
            onChange={(event) => setCliProjectDir(event.target.value)}
            className="font-mono text-sm"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={chooseProjectDir}
            title="Choose project directory"
          >
            <FolderIcon className="size-4" />
          </Button>
        </div>
        <FieldDescription>
          Used for read-only doctor and vendor checks. The active session source directory is used when this is empty.
        </FieldDescription>
      </div>

      <div className="grid gap-2">
        <Label>CLI & Project Actions</Label>
        <div className="grid gap-2 md:grid-cols-2">
          <CliActionCard
            title="Project health"
            description="Run structured doctor, vendor, package, and plugin checks."
            testId="cli-action-card-health"
          >
            <Button type="button" variant="outline" size="sm" onClick={() => void startJob({ kind: 'doctor' })}>
              <RefreshCwIcon className="size-4" />
              Doctor
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void startJob({ kind: 'buildVendorList' })}>
              <TerminalIcon className="size-4" />
              Vendors
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => void startJob({ kind: 'packageAudit' })}>
              <CheckCircle2Icon className="size-4" />
              Audit
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void startJob({ kind: 'pluginList', options: { managed: 'cli' } })}
            >
              <CodeIcon className="size-4" />
              Plugins
            </Button>
          </CliActionCard>

          <CliActionCard
            title="Initialize project"
            description="Create CLI-managed Feather config through the CLI backend."
            testId="cli-action-card-init"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                confirmAndStart('Initialize this project with CLI-managed Feather config?', {
                  kind: 'init',
                  options: { mode: 'cli' },
                })
              }
            >
              <TerminalIcon className="size-4" />
              Init CLI Mode
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void startJob({ kind: 'buildVendorAdd', dryRun: true, options: { targets: ['all'] } })}
            >
              <EyeIcon className="size-4" />
              Vendor Plan
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                confirmAndStart('Install or refresh all configured build vendors?', {
                  kind: 'buildVendorAdd',
                  options: { targets: ['all'] },
                })
              }
            >
              <CheckCircle2Icon className="size-4" />
              Add Vendors
            </Button>
          </CliActionCard>

          <CliActionCard
            title="Packages"
            description="Install or remove catalog packages through project-local lockfiles."
            testId="cli-action-card-packages"
          >
            <Input
              value={packageNames}
              placeholder="anim8,bump"
              onChange={(event) => setPackageNames(event.target.value)}
              className="h-8 min-w-44 flex-1 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void startJob({ kind: 'packageInstall', dryRun: true, options: { names: splitIds(packageNames), offline: true } })
              }
            >
              <EyeIcon className="size-4" />
              Plan
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                confirmAndStart('Install selected packages into this project?', {
                  kind: 'packageInstall',
                  options: { names: splitIds(packageNames), offline: true },
                })
              }
            >
              <CheckCircle2Icon className="size-4" />
              Install
            </Button>
            <Input
              value={removePackageName}
              placeholder="package-to-remove"
              onChange={(event) => setRemovePackageName(event.target.value)}
              className="h-8 min-w-44 flex-1 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                confirmAndStart('Remove this package and its installed files?', {
                  kind: 'packageRemove',
                  options: { name: removePackageName.trim() },
                })
              }
            >
              <XIcon className="size-4" />
              Remove
            </Button>
          </CliActionCard>

          <CliActionCard
            title="Plugins and skills"
            description="Update config includes/excludes and install local agent skills."
            testId="cli-action-card-plugins-skills"
          >
            <Input
              value={pluginIncludeIds}
              placeholder="console,shader-graph"
              onChange={(event) => setPluginIncludeIds(event.target.value)}
              className="h-8 min-w-44 flex-1 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                void startJob({
                  kind: 'configPlugins',
                  dryRun: true,
                  options: { include: splitIds(pluginIncludeIds), exclude: splitIds(pluginExcludeIds) },
                })
              }
            >
              <EyeIcon className="size-4" />
              Plugin Plan
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                confirmAndStart('Apply plugin include/exclude changes to feather.config.lua?', {
                  kind: 'configPlugins',
                  options: { include: splitIds(pluginIncludeIds), exclude: splitIds(pluginExcludeIds) },
                })
              }
            >
              <CheckCircle2Icon className="size-4" />
              Apply
            </Button>
            <Input
              value={pluginExcludeIds}
              placeholder="plugins to exclude"
              onChange={(event) => setPluginExcludeIds(event.target.value)}
              className="h-8 min-w-44 flex-1 font-mono text-xs"
            />
            <Input
              value={skillIds}
              placeholder="feather-step-debugging,feather-qa-playtester"
              onChange={(event) => setSkillIds(event.target.value)}
              className="h-8 min-w-44 flex-1 font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void startJob({ kind: 'skillsInstall', dryRun: true, options: { ids: splitIds(skillIds) } })}
            >
              <EyeIcon className="size-4" />
              Skill Plan
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                confirmAndStart('Install selected Feather skills into this project?', {
                  kind: 'skillsInstall',
                  options: { ids: splitIds(skillIds) },
                })
              }
            >
              <CheckCircle2Icon className="size-4" />
              Install Skills
            </Button>
          </CliActionCard>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Recent CLI Jobs</Label>
        <CliJobsPanel jobs={jobs} onCancel={(jobId) => void cancelJob(jobId)} />
      </div>

      {currentStatus && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Node</p>
            <p className="font-mono">{currentStatus.nodeVersion ?? 'not found'}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">npm</p>
            <p className="font-mono">{currentStatus.npmVersion ?? 'not found'}</p>
          </div>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Doctor warnings</p>
            <p className="font-mono text-lg">{summary.warnings ?? 0}</p>
          </div>
          <div className="rounded border p-2">
            <p className="text-muted-foreground">Doctor failures</p>
            <p className="font-mono text-lg">{summary.failures ?? 0}</p>
          </div>
        </div>
      )}

      {vendorEntries.length > 0 && (
        <div className="grid gap-2">
          <Label>Build Vendors</Label>
          <div className="grid grid-cols-2 gap-2">
            {vendorEntries.map((vendor) => (
              <div key={vendor.target} className="flex items-center justify-between rounded border px-2 py-1.5 text-xs">
                <span className="font-medium">{vendor.target}</span>
                <Badge variant={vendor.valid ? 'secondary' : 'outline'} className="text-[10px]">
                  {vendor.valid ? 'ready' : vendor.exists ? 'incomplete' : 'missing'}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {importantChecks.length > 0 && (
        <div className="grid gap-2">
          <div className="grid gap-1">
            <Label>Doctor Attention</Label>
            {doctorProjectDir && (
              <p className="break-all font-mono text-xs text-muted-foreground">Project: {doctorProjectDir}</p>
            )}
          </div>
          <div className="grid gap-2">
            {importantChecks.map((check, index) => (
              <div key={`${check.group}-${check.label}-${index}`} className="grid gap-1 rounded border p-2 text-xs">
                <div className="flex items-center gap-2">
                  <SeverityBadge severity={check.severity} />
                  <span className="font-medium">{check.label}</span>
                  <span className="text-muted-foreground">{check.group}</span>
                </div>
                {check.detail && <p className="text-muted-foreground">{check.detail}</p>}
                {check.fix && (
                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-muted px-1.5 py-1 font-mono">{check.fix}</code>
                    <CopyButton value={check.fix} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {projectStatus?.errors && projectStatus.errors.length > 0 && (
        <div className="grid gap-1 rounded border border-amber-500/50 p-2 text-xs text-muted-foreground">
          {projectStatus.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export function SettingsModal() {
  const open = useSettingsStore((state) => state.open);
  const setOpen = useSettingsStore((state) => state.setOpen);
  const reset = useSettingsStore((state) => state.reset);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[88vh] max-h-[820px] w-[min(96vw,1080px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <DialogHeader className="border-b bg-muted/20 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-background shadow-xs">
                <Settings2Icon className="size-5 text-muted-foreground" />
              </span>
              <div className="min-w-0">
                <DialogTitle>Settings</DialogTitle>
                <DialogDescription className="mt-1">
                  Configure connection, security, appearance, and local tooling from one place.
                </DialogDescription>
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              <div className="flex flex-wrap justify-end gap-2 pt-0.5">
                <Badge variant="outline" className="gap-1">
                  <CheckCircle2Icon className="size-3" />
                  Autosaved
                </Badge>
                <Badge variant="secondary" className="font-mono">
                  v{appVersion}
                </Badge>
              </div>
              <DialogClose asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="Close"
                  title="Close settings"
                >
                  <XIcon className="size-4" />
                </Button>
              </DialogClose>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="connection" orientation="vertical" className="min-h-0 flex-1 gap-0 md:flex-row">
          <div className="border-b bg-muted/10 p-2 md:w-64 md:shrink-0 md:border-b-0 md:border-r">
            <TabsList className="flex !h-auto w-full flex-wrap items-stretch justify-start gap-1 rounded-none bg-transparent p-0 md:flex-col">
              {settingsTabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  aria-label={tab.label}
                  className="!h-auto min-w-[calc(50%-0.25rem)] flex-1 justify-start gap-3 px-3 py-2 text-left md:min-w-0 md:flex-none"
                >
                  <tab.icon className="size-4 text-muted-foreground" />
                  <span className="grid min-w-0 gap-0.5">
                    <span className="truncate text-sm">{tab.label}</span>
                    <span className="hidden truncate text-[11px] font-normal text-muted-foreground md:block">
                      {tab.description}
                    </span>
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="min-h-0 flex-1">
            <SettingsTabContent
              value="general"
              title="General"
              description="Adjust the app surface, keep navigation focused, and point Feather at local project files."
            >
              <GeneralOverview />
              <Section
                icon={PaletteIcon}
                title="Appearance"
                description="Choose a theme and keep rarely used tools out of the sidebar."
              >
                <ThemeToggle />
                <PinnedSidebarToolsInput />
                <SidebarFeaturesInput />
              </Section>
              <Section icon={CodeIcon} title="Editor" description="Control how file locations open from traces.">
                <TextEditorInput />
              </Section>
              <Section
                icon={FolderIcon}
                title="Assets"
                description="Resolve local previews when the game runs elsewhere."
              >
                <AssetSourceDirInput />
              </Section>
            </SettingsTabContent>

            <SettingsTabContent
              value="connection"
              title="Connection"
              description="Set how games find this desktop app and how Feather decides a session is still alive."
            >
              <ConnectionOverview />
              <Section
                icon={NetworkIcon}
                title="Desktop Server"
                description="These values affect new and reconnecting game sessions."
              >
                <SettingsGrid>
                  <PortInput />
                  <ConnectionTimeoutInput />
                  <SampleRateInput />
                </SettingsGrid>
              </Section>
              <Section
                icon={SmartphoneIcon}
                title="Mobile Pairing"
                description="Use the same connection settings when testing on a phone or another machine."
              >
                <MobileConnection />
              </Section>
            </SettingsTabContent>

            <SettingsTabContent
              value="security"
              title="Security"
              description="Manage the desktop identity and API keys used for privileged runtime commands."
            >
              <SecurityOverview />
              <Section
                icon={ShieldIcon}
                title="Command Trust"
                description="Use App ID and API keys to restrict command-capable workflows."
              >
                <AppIdInput />
                <SettingsGrid>
                  <ApiKeyInput />
                  <SessionApiKeyInput />
                </SettingsGrid>
              </Section>
              <Section
                icon={TerminalIcon}
                title="MCP Access"
                description="Expose live Feather sessions to local MCP clients with token-protected full-control tools."
              >
                <McpAccessPanel />
              </Section>
            </SettingsTabContent>

            <SettingsTabContent
              value="cli"
              title="CLI & Project Actions"
              description="Run safe CLI-backed setup, package, plugin, vendor, and skills workflows through Tauri."
            >
              <Section
                icon={TerminalIcon}
                title="CLI Backend"
                description="Refresh reads local tool and project status."
              >
                <CliStatusPanel />
              </Section>
            </SettingsTabContent>
          </div>
        </Tabs>

        <DialogFooter className="gap-2 border-t bg-background/80 px-5 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/65">
          <Button variant="outline" onClick={reset} className="mr-auto">
            <ActivityIcon className="size-4" />
            Reset to defaults
          </Button>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
