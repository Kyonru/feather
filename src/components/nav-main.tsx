import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { NavLink, useLocation } from 'react-router';

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    icon?: React.ComponentType<any>;
  }[];
}) {
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
