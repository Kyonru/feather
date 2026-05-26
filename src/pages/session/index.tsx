import { useQuery } from '@tanstack/react-query';
import { readTextFile } from '@tauri-apps/plugin-fs';
import { useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useConfig } from '@/hooks/use-config';
import { cn } from '@/utils/styles';
import { isWeb } from '@/utils/platform';
import { BoxIcon, MonitorIcon, PuzzleIcon, ServerIcon, ShieldCheckIcon, ShieldOffIcon } from 'lucide-react';

type LockfileEntry = {
  version: string;
  trust: 'verified' | 'known' | 'experimental';
  installedAt: string;
};

type Lockfile = {
  lockfileVersion: number;
  packages: Record<string, LockfileEntry>;
};

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
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function CapabilityBadge({ cap }: { cap: string }) {
  const colors: Record<string, string> = {
    filesystem: 'border-yellow-500/40 text-yellow-600 dark:text-yellow-400',
    network:    'border-blue-500/40 text-blue-600 dark:text-blue-400',
    input:      'border-purple-500/40 text-purple-600 dark:text-purple-400',
    draw:       'border-pink-500/40 text-pink-600 dark:text-pink-400',
    audio:      'border-green-500/40 text-green-600 dark:text-green-400',
    physics:    'border-orange-500/40 text-orange-600 dark:text-orange-400',
    binary:     'border-muted-foreground/30 text-muted-foreground',
  };
  return (
    <Badge
      variant="outline"
      className={cn('h-4 px-1 text-[9px] font-normal', colors[cap] ?? 'border-muted-foreground/30 text-muted-foreground')}
    >
      {cap}
    </Badge>
  );
}

export default function SessionPage() {
  const config = useConfigStore((state) => state.config);
  const { updateContinueOnGameError } = useConfig();
  const sessionId = useSessionStore((state) => state.sessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const session = sessionId ? sessions[sessionId] : null;

  const isFileSession = session?.kind === 'log-file' || session?.kind === 'time-travel-file';
  const {
    data: lockfile,
    isLoading: lockfileLoading,
    isError: lockfileError,
  } = usePackageLockfile(config?.root_path, !isFileSession);

  if (!config || !session) return null;

  const pluginEntries = Object.entries(config.plugins ?? {});
  const packageEntries = lockfile ? Object.entries(lockfile.packages) : [];

  const capabilities = config.capabilities;
  const capAll = capabilities === 'all' || capabilities == null;
  const capList = !capAll && Array.isArray(capabilities) ? capabilities : [];

  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="flex flex-col gap-4 px-4 py-4 md:py-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Section title="Session" icon={MonitorIcon}>
            <InfoRow label="Name" value={config.sessionName || session.name} />
            <InfoRow label="Device ID" value={session.deviceId} />
            <InfoRow label="Session ID" value={sessionId} />
            <InfoRow label="Sample rate" value={config.sampleRate ? `${config.sampleRate}s` : undefined} />
            <InfoRow label="Save directory" value={config.location} />
            {config.root_path && <InfoRow label="Project root" value={config.root_path} />}
            <div className="mt-2 flex items-center justify-between gap-4 rounded-md border px-2 py-2">
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
              <div className="mt-2 flex items-center gap-2 rounded-md border border-orange-300 bg-orange-50 px-2 py-1.5 dark:border-orange-800 dark:bg-orange-950">
                <ShieldOffIcon className="size-3.5 text-orange-500" />
                <span className="text-xs text-orange-700 dark:text-orange-400">
                  Insecure connection — set appId in feather.config.lua
                </span>
              </div>
            )}
          </Section>

          <Section title="Environment" icon={ServerIcon}>
            <InfoRow label="OS" value={config.sysInfo?.os} />
            <InfoRow label="Architecture" value={config.sysInfo?.arch} />
            <InfoRow label="CPU cores" value={config.sysInfo?.cpuCount} />
            <InfoRow label="LÖVE version" value={config.sysInfo?.loveVersion} />
            <InfoRow label="Feather runtime" value={config.version ? `v${config.version}` : undefined} />
            <InfoRow label="API version" value={config.API || undefined} />
            <InfoRow
              label="Capabilities"
              value={
                capAll ? (
                  <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                    <ShieldCheckIcon className="size-3" />
                    all
                  </span>
                ) : capList.length > 0 ? (
                  <span className="flex flex-wrap justify-end gap-1">
                    {capList.map((c) => <CapabilityBadge key={c} cap={c} />)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">none</span>
                )
              }
            />
          </Section>
        </div>

        <Section title={`Plugins (${pluginEntries.length})`} icon={PuzzleIcon}>
          {pluginEntries.length === 0 ? (
            <p className="text-xs text-muted-foreground">No plugins reported by this session.</p>
          ) : (
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {pluginEntries.map(([id, plugin]) => {
                const status = plugin.incompatible ? 'incompatible' : plugin.disabled ? 'disabled' : 'enabled';
                const caps = plugin.capabilities ?? [];
                return (
                  <div
                    key={id}
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
                          'border-green-500/40 text-green-600 dark:text-green-400': status === 'enabled',
                          'border-muted-foreground/30 text-muted-foreground': status === 'disabled',
                          'border-destructive/30 text-destructive': status === 'incompatible',
                        })}
                      >
                        {status}
                      </Badge>
                    </div>
                    {caps.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {caps.map((c) => <CapabilityBadge key={c} cap={c} />)}
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
            <p className="text-xs text-muted-foreground">Not available for this session type.</p>
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
                      'border-green-500/40 text-green-600 dark:text-green-400': pkg.trust === 'verified',
                      'border-yellow-500/40 text-yellow-600 dark:text-yellow-400': pkg.trust === 'known',
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
