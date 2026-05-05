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
import { useMemo, useState } from 'react';
import { DynamicIcon } from 'lucide-react/dynamic';
import { SearchIcon } from 'lucide-react';

export function NavPlugins() {
  const location = useLocation();
  const plugins = useConfigStore((state) => state.config?.plugins);
  const [search, setSearch] = useState('');

  const items = useMemo(() => {
    const pluginItems = [];

    if (plugins) {
      for (const [key, value] of Object.entries(plugins)) {
        if (value.tabName) {
          pluginItems.push({
            name: value.tabName,
            url: `/plugins/${key}`,
            icon: value.icon,
            disabled: value.disabled || false,
          });
        }
      }
    }

    return pluginItems;
  }, [plugins]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Plugins</SidebarGroupLabel>
      {items.length > 0 && (
        <div className="relative mb-1 px-2">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter plugins…"
            className="w-full rounded-md border bg-background pl-7 pr-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}
      <SidebarMenu>
        {filtered.map((item) => (
          <NavLink key={item.name} to={item.url} end>
            <SidebarMenuItem>
              <SidebarMenuButton
                className={cn(
                  {
                    'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground min-w-8 duration-200 ease-linear':
                      item.url === location.pathname,
                  },
                  item.disabled && 'opacity-50',
                )}
                tooltip={item.name}
              >
                {item.icon && <DynamicIcon className="size-4" name={item.icon} />}
                <span>{item.name}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </NavLink>
        ))}
        {filtered.length === 0 && search.trim() && (
          <p className="px-2 py-1 text-xs text-muted-foreground">No plugins match.</p>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
