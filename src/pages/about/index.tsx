import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAboutStore } from '@/store/about';
import { openUrl } from '@/utils/linking';
import { version } from '../../../package.json';
import { useSettingsStore } from '@/store/settings';
import {
  BookOpenIcon,
  ExternalLinkIcon,
  LucideGithub,
  HandCoinsIcon,
  HistoryIcon,
  ScrollTextIcon,
  ZapIcon,
  PlugZapIcon,
  MonitorIcon,
} from 'lucide-react';

const FEATURES = [
  { icon: ScrollTextIcon, text: 'Live logs, errors & stack traces' },
  { icon: ZapIcon, text: 'Real-time performance & variable inspection' },
  { icon: PlugZapIcon, text: '18 built-in plugins — screenshots, REPL, profiler & more' },
  { icon: MonitorIcon, text: 'Multi-session · mobile · disk mode' },
];

export function AboutModal() {
  const open = useAboutStore((state) => state.open);
  const setOpen = useAboutStore((state) => state.setOpen);
  const isLatestVersion = useSettingsStore((state) => state.isLatestVersion);

  const go = (url: string) => () => openUrl(url);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>About Feather</DialogTitle>
        </DialogHeader>

        {/* Hero */}
        <div className="flex flex-col items-center gap-2 px-8 pt-8 pb-6 text-center bg-gradient-to-b from-muted/60 to-background">
          <span className="text-5xl select-none">🪶</span>
          <h2 className="text-2xl font-bold tracking-tight">Feather</h2>
          <p className="text-sm text-muted-foreground max-w-xs">
            Debug &amp; inspect your LÖVE games in real-time — logs, performance, variables, screenshots and more.
          </p>
          <span className="mt-1 rounded-full border px-3 py-0.5 text-xs font-mono text-muted-foreground">
            v{version}
          </span>
        </div>

        {/* Feature list */}
        <ul className="flex flex-col gap-2 px-8 py-4">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-muted-foreground">
              <Icon className="size-4 shrink-0 text-primary" />
              {text}
            </li>
          ))}
        </ul>

        {/* CTAs */}
        <div className="flex flex-col gap-2 px-8 pb-6">
          <Button
            className="w-full gap-2 font-semibold"
            onClick={go('https://github.com/Kyonru/feather')}
          >
            <LucideGithub className="size-4" />
            Star on GitHub
            <ExternalLinkIcon className="size-3 opacity-60" />
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={go('https://github.com/sponsors/Kyonru')}
          >
            <HandCoinsIcon className="size-4 text-pink-500" />
            Sponsor this project
          </Button>
        </div>

        {/* Update banner */}
        {!isLatestVersion && (
          <div className="mx-8 mb-4 flex items-start gap-3 rounded-lg border border-cyan-600 bg-cyan-50 p-3 dark:border-cyan-900 dark:bg-cyan-950">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">New version available</p>
              <p className="text-xs text-muted-foreground">
                Update to get the latest features and fixes.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="w-fit px-0 text-xs"
                onClick={go('https://github.com/Kyonru/feather/releases')}
              >
                View releases →
              </Button>
            </div>
          </div>
        )}

        {/* Footer links */}
        <div className="flex items-center justify-center gap-1 border-t px-8 py-3">
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={go('https://github.com/Kyonru/feather/blob/main/LICENSE.md')}>
            <BookOpenIcon className="size-3" />
            License
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={go('https://github.com/Kyonru/feather/blob/main/CHANGELOG.md')}>
            <HistoryIcon className="size-3" />
            Changelog
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={go(`https://github.com/Kyonru/feather/releases/tag/v${version}`)}>
            <ExternalLinkIcon className="size-3" />
            This release
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
