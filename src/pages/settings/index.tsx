import { useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
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
import { MAIN_FEATURES, type MainFeatureId } from '@/constants/main-features';
import { useConfig } from '@/hooks/use-config';
import { useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';
import { MobileConnection } from '@/components/mobile-connection';
import { openUrl } from '@/utils/linking';
import { normalizeThemePreference, themeSelectorGroups, type ThemeSelectorOption } from '@/assets/theme/registry';
import { version as appVersion } from '../../../package.json';
import {
  ActivityIcon,
  CodeIcon,
  CopyIcon,
  ExternalLinkIcon,
  EyeIcon,
  EyeOffIcon,
  FolderIcon,
  MonitorIcon,
  NetworkIcon,
  RefreshCwIcon,
  ShieldIcon,
  TerminalIcon,
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

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h3 className="text-sm font-medium">{title}</h3>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function FieldDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground -mt-2">{children}</p>;
}

function SettingsGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>;
}

function SettingsTabContent({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <TabsContent value={value} className="m-0 min-h-0">
      <ScrollArea className="h-[calc(84vh-180px)]">
        <div className="grid gap-6 p-5 pb-12">{children}</div>
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

const optionalFeatureDefaults: MainFeatureId[] = [
  'console',
  'particle-system-playground',
  'shader-graph',
  'time-travel',
  'session-replay',
  'compare',
];

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

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="grid gap-1">
          <Label>Sidebar Features</Label>
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
            <div key={feature.id} className="flex items-center gap-2 rounded border px-3 py-2">
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
                {feature.id === 'compare' && <span className="text-[10px] text-muted-foreground">2 sessions</span>}
              </Label>
            </div>
          );
        })}
      </div>
      <div className="flex items-start gap-2 rounded border bg-muted/20 px-3 py-2">
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

function CliStatusPanel() {
  const cliPath = useSettingsStore((state) => state.cliPath);
  const setCliPath = useSettingsStore((state) => state.setCliPath);
  const cliProjectDir = useSettingsStore((state) => state.cliProjectDir);
  const setCliProjectDir = useSettingsStore((state) => state.setCliProjectDir);
  const sourceDir = useConfigStore((state) => state.config?.sourceDir ?? '');
  const [status, setStatus] = useState<CliStatus | null>(null);
  const [projectStatus, setProjectStatus] = useState<CliProjectStatus | null>(null);
  const [loading, setLoading] = useState(false);

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

  const chooseProjectDir = async () => {
    const selected = await openFolderDialog({ directory: true, multiple: false });
    if (typeof selected === 'string') {
      setCliProjectDir(selected);
      setProjectStatus(null);
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
      <DialogContent className="flex h-[84vh] w-[min(94vw,900px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Changes are applied immediately and persisted automatically.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="connection" className="min-h-0 flex-1 gap-0">
          <div className="border-b px-5 py-3">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="connection" className="gap-2">
                <NetworkIcon className="size-4" />
                Connection
              </TabsTrigger>
              <TabsTrigger value="general" className="gap-2">
                <MonitorIcon className="size-4" />
                General
              </TabsTrigger>
              <TabsTrigger value="security" className="gap-2">
                <ShieldIcon className="size-4" />
                Security
              </TabsTrigger>
              <TabsTrigger value="cli" className="gap-2">
                <TerminalIcon className="size-4" />
                CLI
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="min-h-0 flex-1">
            <SettingsTabContent value="general">
              <Section icon={MonitorIcon} title="Appearance">
                <ThemeToggle />
                <SidebarFeaturesInput />
              </Section>
              <Section icon={CodeIcon} title="Editor">
                <TextEditorInput />
              </Section>
              <Section icon={FolderIcon} title="Assets">
                <AssetSourceDirInput />
              </Section>
            </SettingsTabContent>

            <SettingsTabContent value="connection">
              <Section icon={NetworkIcon} title="Connection">
                <SettingsGrid>
                  <PortInput />
                  <ConnectionTimeoutInput />
                  <SampleRateInput />
                </SettingsGrid>
                <MobileConnection />
              </Section>
            </SettingsTabContent>

            <SettingsTabContent value="security">
              <Section icon={ShieldIcon} title="Security">
                <AppIdInput />
                <SettingsGrid>
                  <ApiKeyInput />
                  <SessionApiKeyInput />
                </SettingsGrid>
              </Section>
            </SettingsTabContent>

            <SettingsTabContent value="cli">
              <Section icon={TerminalIcon} title="CLI">
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
