import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { NavLink, useLocation } from 'react-router';
import { GaugeIcon, LogsIcon, TelescopeIcon } from 'lucide-react';

export function NavMain() {
  const items = [
    {
      title: 'Logs',
      url: '/',
      icon: LogsIcon,
    },
    {
      title: 'Performance',
      url: '/performance',
      icon: GaugeIcon,
    },
    {
      title: 'Observability',
      url: '/observability',
      icon: TelescopeIcon,
    },
  ];
  const location = useLocation();
  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => (
            <NavLink key={item.title} to={item.url} end>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className={cn({
                    'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear':
                      item.url === location.pathname,
                  })}
                  tooltip={item.title}
                >
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </NavLink>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
