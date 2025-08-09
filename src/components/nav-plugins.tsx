import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { NavLink, useLocation } from "react-router";

export function NavPlugins({
  items,
}: {
  items: {
    name: string;
    url: string;
    icon: React.ComponentType<any>;
  }[];
}) {
  let location = useLocation();
  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Plugins</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <NavLink key={item.name} to={item.url} end>
            <SidebarMenuItem>
              <SidebarMenuButton
                className={cn({
                  "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear":
                    item.url === location.pathname,
                })}
                tooltip={item.name}
              >
                {item.icon && <item.icon />}
                <span>{item.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </NavLink>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
