import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/utils/styles';
import { NavLink, useLocation } from 'react-router';
import { useConfigStore } from '@/store/config';
import { useMemo } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';

export function NavPlugins() {
  const location = useLocation();
  const plugins = useConfigStore((state) => state.config?.plugins);

  const items = useMemo(() => {
    const pluginItems = [];

    if (plugins) {
      for (const [key, value] of Object.entries(plugins)) {
        if (value.tabName) {
          pluginItems.push({
            name: value.tabName,
            url: `/plugins/${key}`,
            icon: value.icon,
          });
        }
      }
    }

    return pluginItems;
  }, [plugins]);

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Plugins</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => (
          <NavLink key={item.name} to={item.url} end>
            <SidebarMenuItem>
              <SidebarMenuButton
                className={cn({
                  'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear':
                    item.url === location.pathname,
                })}
                tooltip={item.name}
              >
                {item.icon && <DynamicIcon className="size-4" name={item.icon} />}
                <span>{item.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </NavLink>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}
