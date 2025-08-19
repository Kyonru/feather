import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Badge } from './ui/badge';
import { LoaderPinwheelIcon, WifiIcon, WifiOff } from 'lucide-react';
import { cn } from '@/utils/styles';
import { useConfig } from '@/hooks/use-config';
import { useConfigStore } from '@/store/config';

export function SiteHeader() {
  const disconnected = useConfigStore((store) => store.disconnected);
  const { isFetching, refetch } = useConfig();

  const isConnected = !disconnected;
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={() => refetch()} variant="ghost" asChild size="sm" className="hidden sm:flex">
            {isFetching ? (
              <Badge variant="secondary" className={'text-black'}>
                <LoaderPinwheelIcon className="text-yellow-700 animate-spin" />
                Connecting...
              </Badge>
            ) : (
              <Badge
                variant="secondary"
                className={cn({
                  'bg-green-700 text-white dark:bg-green-800': isConnected,
                  'bg-red-500 text-white dark:bg-red-600': !isConnected,
                })}
              >
                {isConnected ? <WifiIcon /> : <WifiOff />}
                {isConnected ? 'Connected' : 'Tap to connect'}
              </Badge>
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
