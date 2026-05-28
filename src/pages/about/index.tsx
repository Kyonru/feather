import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAboutStore } from '@/store/about';
import { openUrl } from '@/utils/linking';
import { version } from '../../../package.json';
import { useSettingsStore } from '@/store/settings';
import {
  BadgeCheckIcon,
  BookOpenIcon,
  ExternalLinkIcon,
  FileTextIcon,
  GaugeIcon,
  GitBranchIcon,
  HandCoinsIcon,
  HistoryIcon,
  MonitorIcon,
  PlugZapIcon,
  ScrollTextIcon,
  ShieldCheckIcon,
  SquareTerminalIcon,
  StarIcon,
  XIcon,
} from 'lucide-react';

const DOCS_URL = 'https://kyonru.github.io/feather/';
const GITHUB_URL = 'https://github.com/Kyonru/feather';
const RELEASES_URL = 'https://github.com/Kyonru/feather/releases';
const SPONSOR_URL = 'https://github.com/sponsors/Kyonru';

const FEATURE_GROUPS = [
  {
    icon: ScrollTextIcon,
    title: 'Trace the runtime',
    description: 'Live logs, errors, stack traces, and session-aware history for every run.',
  },
  {
    icon: GaugeIcon,
    title: 'Tune performance',
    description: 'Frame health, profiler captures, memory, draw-call, and texture pressure signals.',
  },
  {
    icon: PlugZapIcon,
    title: 'Inspect creative systems',
    description: 'Built-in plugins for shaders, particles, assets, screenshots, Console, and more.',
  },
  {
    icon: SquareTerminalIcon,
    title: 'Run from the CLI',
    description: 'Project init, run/watch, doctor checks, package flows, builds, releases, and uploads.',
  },
];

const PROJECT_LINKS = [
  {
    icon: GitBranchIcon,
    label: 'Source',
    description: 'Repository, issues, and discussions',
    url: GITHUB_URL,
  },
  {
    icon: HistoryIcon,
    label: 'Changelog',
    description: 'Release notes and recent changes',
    url: `${GITHUB_URL}/blob/main/CHANGELOG.md`,
  },
  {
    icon: FileTextIcon,
    label: 'License',
    description: 'MIT license and project terms',
    url: `${GITHUB_URL}/blob/main/LICENSE.md`,
  },
];

function AboutMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background/70 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

export function AboutModal() {
  const open = useAboutStore((state) => state.open);
  const setOpen = useAboutStore((state) => state.setOpen);
  const isLatestVersion = useSettingsStore((state) => state.isLatestVersion);

  const go = (url: string) => () => openUrl(url);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(86vh,720px)] w-[min(96vw,860px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none"
      >
        <DialogHeader className="border-b bg-muted/20 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-md border bg-background shadow-xs">
                <img src="/feather-clear.svg" alt="" className="size-7" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <DialogTitle>About Feather</DialogTitle>
                <DialogDescription className="mt-1 max-w-xl">
                  A desktop devtool for debugging, inspecting, and shipping LÖVE games from one live workspace.
                </DialogDescription>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary" className="font-mono">
                    v{version}
                  </Badge>
                  <Badge variant={isLatestVersion ? 'outline' : 'default'} className="gap-1">
                    <BadgeCheckIcon className="size-3" />
                    {isLatestVersion ? 'Up to date' : 'Update available'}
                  </Badge>
                  <Badge variant="outline" className="gap-1">
                    <ShieldCheckIcon className="size-3" />
                    Open source
                  </Badge>
                </div>
              </div>
            </div>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Close">
                <XIcon className="size-4" />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-5 p-5">
            <section className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
              <div className="rounded-lg border bg-card p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Built for LÖVE development
                </div>
                <h3 className="mt-2 text-lg font-semibold tracking-tight">
                  Inspect, tune, and ship games without losing runtime context.
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Feather connects a running game to a focused desktop workspace for logs, traces, variables,
                  performance health, plugins, packages, and release tooling.
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <AboutMetric label="Desktop" value={`v${version}`} />
                  <AboutMetric label="Runtime" value="CLI managed" />
                  <AboutMetric label="License" value="MIT" />
                </div>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2">
                  <MonitorIcon className="size-4 text-primary" />
                  <h3 className="text-sm font-semibold">Quick Actions</h3>
                </div>
                <div className="mt-3 grid gap-2">
                  <Button className="justify-start" onClick={go(DOCS_URL)}>
                    <BookOpenIcon className="size-4" />
                    Open Docs
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={go(GITHUB_URL)}>
                    <StarIcon className="size-4" />
                    Star on GitHub
                  </Button>
                  <Button variant="outline" className="justify-start" onClick={go(SPONSOR_URL)}>
                    <HandCoinsIcon className="size-4" />
                    Sponsor Feather
                  </Button>
                </div>
              </div>
            </section>

            {!isLatestVersion && (
              <section className="rounded-lg border border-cyan-600/50 bg-cyan-50 p-4 dark:border-cyan-500/40 dark:bg-cyan-950/50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold">New version available</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Update to get the latest fixes, plugins, and desktop improvements.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={go(RELEASES_URL)}>
                    <HistoryIcon className="size-4" />
                    View Releases
                  </Button>
                </div>
              </section>
            )}

            <section className="grid gap-3">
              <div>
                <h3 className="text-sm font-semibold">What Feather Covers</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  The core surfaces stay close to everyday game-debugging work.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {FEATURE_GROUPS.map(({ icon: Icon, title, description }) => (
                  <div key={title} className="rounded-lg border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
                        <Icon className="size-4 text-primary" />
                      </span>
                      <div className="min-w-0">
                        <h4 className="text-sm font-semibold">{title}</h4>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="grid gap-3">
              <div>
                <h3 className="text-sm font-semibold">Project Links</h3>
                <p className="mt-1 text-xs text-muted-foreground">Jump to the public project resources.</p>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {PROJECT_LINKS.map(({ icon: Icon, label, description, url }) => (
                  <Button
                    key={label}
                    variant="outline"
                    className="h-auto justify-start whitespace-normal p-3 text-left"
                    onClick={go(url)}
                  >
                    <Icon className="size-4" />
                    <span className="grid min-w-0 gap-0.5">
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-xs font-normal leading-relaxed text-muted-foreground">{description}</span>
                    </span>
                    <ExternalLinkIcon className="ml-auto size-3.5 text-muted-foreground" />
                  </Button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="w-fit gap-1.5 text-xs text-muted-foreground"
                onClick={go(`https://github.com/Kyonru/feather/releases/tag/v${version}`)}
              >
                <ExternalLinkIcon className="size-3" />
                Open this release
              </Button>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
