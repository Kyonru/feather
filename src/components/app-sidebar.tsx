import * as React from "react";

import { NavPlugins } from "@/components/nav-plugins";
import { NavMain } from "@/components/nav-main";
import { NavSecondary } from "@/components/nav-secondary";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  BotMessageSquareIcon,
  ClipboardPlusIcon,
  DatabaseIcon,
  FeatherIcon,
  GaugeIcon,
  LogsIcon,
  MessageCircleQuestionMarkIcon,
  SearchIcon,
  SettingsIcon,
  TelescopeIcon,
} from "lucide-react";

const data = {
  navMain: [
    {
      title: "Logs",
      url: "/",
      icon: LogsIcon,
    },
    {
      title: "Performance",
      url: "/performance",
      icon: GaugeIcon,
    },
    {
      title: "Observability",
      url: "/observability",
      icon: TelescopeIcon,
    },
  ],
  navSecondary: [
    {
      title: "Settings",
      url: "#",
      icon: SettingsIcon,
    },
    {
      title: "Get Help",
      url: "#",
      icon: MessageCircleQuestionMarkIcon,
    },
    {
      title: "Search",
      url: "#",
      icon: SearchIcon,
    },
  ],
  documents: [
    {
      name: "Data Library",
      url: "/plugins/data-library",
      icon: DatabaseIcon,
    },
    {
      name: "Reports",
      url: "/plugins/reports",
      icon: ClipboardPlusIcon,
    },
    {
      name: "Word Assistant",
      url: "/plugins/word-assistant",
      icon: BotMessageSquareIcon,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              disabled
              className="data-[slot=sidebar-menu-button]:!p-1.5"
            >
              <div>
                <FeatherIcon className="!size-5" />
                <span className="text-base font-semibold">Feather</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavPlugins items={data.documents} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
    </Sidebar>
  );
}
