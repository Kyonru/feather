import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from './ui/badge';
import { FolderOpenIcon } from 'lucide-react';
import { useConfigStore } from '@/store/config';
import { openFolder } from '@/utils/linking';
import { SessionTabs } from './session-tabs';

export function SiteHeader() {
  const location = useConfigStore((state) => state.config?.location);

  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 overflow-hidden border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex min-w-0 flex-1 items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <SessionTabs />
        <div className="shrink-0 ml-auto flex items-center gap-2">
          {location && (
            <Button
              onClick={() => {
                openFolder(location);
              }}
              variant="ghost"
              asChild
              size="sm"
              className="hidden sm:flex"
            >
              <Badge variant="secondary" className={'text-black'}>
                <FolderOpenIcon className="text-primary" />
              </Badge>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
