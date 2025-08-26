import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAboutStore } from '@/store/about';

import { openUrl } from '@/utils/linking';
import { version } from '../../../package.json';
import { useConfigStore } from '@/store/config';
import { Label } from '@/components/ui/label';
import { useVersionMismatch } from '@/hooks/use-config';
import { useSettingsStore } from '@/store/settings';
import { BookOpenIcon, HandCoinsIcon, HistoryIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function AboutModal() {
  const open = useAboutStore((state) => state.open);
  const setOpen = useAboutStore((state) => state.setOpen);
  const config = useConfigStore((state) => state.config);
  const isLatestVersion = useSettingsStore((state) => state.isLatestVersion);

  const onDownload = () => {
    const url = `https://github.com/Kyonru/feather/releases/tag/v${version}`;
    openUrl(url);
  };

  const onLatestVersion = () => {
    const url = `https://github.com/Kyonru/feather/releases`;
    openUrl(url);
  };

  const onLicense = () => {
    const url = `https://github.com/Kyonru/feather/blob/main/LICENSE.md`;
    openUrl(url);
  };

  const onChangelog = () => {
    const url = `https://github.com/Kyonru/feather/blob/main/CHANGELOG.md`;
    openUrl(url);
  };

  const onSupport = () => {
    const url = `https://github.com/sponsors/Kyonru`;
    openUrl(url);
  };

  const isVersionMismatch = useVersionMismatch();

  const developer = 'Kyonru';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>About Feather</DialogTitle>
          <DialogDescription>Information about the current client and server versions.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-y-6 gap-x-8 py-4">
          <div className="flex flex-col gap-1">
            <span className="font-medium text-muted-foreground">Current Version</span>
            <span className="text-chart-1">v{version}</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-muted-foreground">Server Version</span>
            <span className="text-chart-3">{config?.version ? `v${config.version}` : 'Unknown'}</span>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-muted-foreground">Developer</span>
            <a href={`https://github.com/${developer}`} className="text-chart-2" target="_blank" rel="noreferrer">
              @{developer}
            </a>
          </div>

          <div className="flex flex-col gap-1">
            <span className="font-medium text-muted-foreground">Library</span>
            <Button variant="secondary" onClick={onDownload} className="w-fit text-chart-5">
              feather.lua (v{version})
            </Button>
          </div>
        </div>

        <DialogFooter className="sm:justify-start">
          {isVersionMismatch && (
            <Label className="w-full hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3 border-yellow-600 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950">
              <div className="grid gap-1.5 font-normal">
                <p className="text-sm leading-none font-medium">Version mismatch</p>
                <p className="text-muted-foreground text-sm">
                  The current version of Feather App does not match the server version (feather.lua). Please make sure
                  you are using the same version on both ends to ensure compatibility.
                </p>

                <Button variant="ghost" onClick={onLatestVersion} className="w-fit">
                  Latest Version
                </Button>
              </div>
            </Label>
          )}
          {!isLatestVersion && (
            <Label className="w-full hover:bg-accent/50 flex items-start gap-3 rounded-lg border p-3 border-cyan-600 bg-cyan-50 dark:border-cyan-900 dark:bg-cyan-950">
              <div className="grid gap-1.5 font-normal">
                <p className="text-sm leading-none font-medium">New version available</p>
                <p className="text-muted-foreground text-sm">
                  There is a new version of Feather available. Please update to the latest version to take advantage of
                  the latest features and bug fixes.
                </p>

                <Button variant="ghost" onClick={onLatestVersion} className="w-fit">
                  Latest Version
                </Button>
              </div>
            </Label>
          )}

          <div className="flex flex-row gap-1">
            <Tooltip>
              <TooltipTrigger>
                <Button variant="ghost" onClick={onLicense} className="w-fit">
                  <BookOpenIcon className="text-chart-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>License</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Button variant="ghost" onClick={onChangelog} className="w-fit">
                  <HistoryIcon className="text-chart-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Changelog</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger>
                <Button variant="ghost" onClick={onSupport} className="w-fit">
                  <HandCoinsIcon className="text-chart-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Support</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
