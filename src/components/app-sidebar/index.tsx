import * as React from 'react';

// import { NavPlugins } from "@/components/nav-plugins";
import { NavMain } from '@/components/app-sidebar/nav-main';
import { NavBottom } from '@/components/app-sidebar/nav-bottom';
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { FeatherIcon } from 'lucide-react';
import { useLatestVersion } from '@/hooks/use-latest-version';

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
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain />
        {/* <NavPlugins items={data.documents} /> */}
        <NavBottom className="mt-auto" />
      </SidebarContent>
    </Sidebar>
  );
}
