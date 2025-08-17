import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { NavLink, useLocation } from 'react-router';
import { BotMessageSquareIcon, ClipboardPlusIcon, DatabaseIcon } from 'lucide-react';

export function NavPlugins() {
  const location = useLocation();
  const items = [
    {
      name: 'Data Library',
      url: '/plugins/data-library',
      icon: DatabaseIcon,
    },
    {
      name: 'Reports',
      url: '/plugins/reports',
      icon: ClipboardPlusIcon,
    },
    {
      name: 'Word Assistant',
      url: '/plugins/word-assistant',
      icon: BotMessageSquareIcon,
    },
  ];
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
