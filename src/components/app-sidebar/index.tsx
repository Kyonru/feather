import * as React from 'react';

import { NavPlugins } from '@/components/app-sidebar/nav-plugins';
import { NavMain } from '@/components/app-sidebar/nav-main';
import { NavBottom } from '@/components/app-sidebar/nav-bottom';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { BookOpenIcon, FeatherIcon } from 'lucide-react';
import { useLatestVersion } from '@/hooks/use-latest-version';
import { Button } from '@/components/ui/button';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  useLatestVersion();
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild disabled className="data-[slot=sidebar-menu-button]:!p-1.5">
              <div>
                <FeatherIcon className="!size-5" />
                <span className="text-base font-semibold">Feather</span>
                <Button
                  asChild
                  size="sm"
                  variant="ghost"
                  className="ml-auto h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                  title="Documentation"
                >
                  <a href="https://kyonru.github.io/feather/" target="_blank" rel="noreferrer">
                    <BookOpenIcon className="size-3.5" />
                  </a>
                </Button>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
        <NavPlugins />
      </SidebarContent>
      <SidebarFooter>
        <NavBottom />
      </SidebarFooter>
    </Sidebar>
  );
}
