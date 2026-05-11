import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import { cn } from '@/utils/styles';
import { sendCommand } from '@/lib/send-command';
import { NavLink, useLocation } from 'react-router';
import { useConfigStore } from '@/store/config';
import { useSettingsStore } from '@/store/settings';
import { useSessionStore } from '@/store/session';
import { useMemo, useState } from 'react';
import { DynamicIcon, type IconName } from 'lucide-react/dynamic';
import { ChevronRight, PowerOffIcon, PuzzleIcon, SearchIcon, SlidersHorizontalIcon } from 'lucide-react';
import { toast } from 'sonner';

export function NavPlugins() {
  const location = useLocation();
  const plugins = useConfigStore((state) => state.config?.plugins);
  const sessionId = useSessionStore((state) => state.sessionId);
  const hiddenPlugins = useSettingsStore((state) => state.hiddenPlugins);
  const toggleHiddenPlugin = useSettingsStore((state) => state.toggleHiddenPlugin);
  const [search, setSearch] = useState('');

  const items = useMemo(() => {
    const pluginItems = [];

    if (plugins) {
      for (const [key, value] of Object.entries(plugins)) {
        if (value.tabName) {
          pluginItems.push({
            id: key,
            name: value.tabName,
            url: `/plugins/${key}`,
            icon: value.icon,
            disabled: value.disabled || false,
          });
        }
      }
    }

    return pluginItems.sort((a, b) => a.name.localeCompare(b.name));
  }, [plugins]);

  const disabledItems = useMemo(() => items.filter((item) => item.disabled), [items]);

  // Active plugins are always visible; disabled plugins can be hidden
  const visible = useMemo(
    () => items.filter((item) => !item.disabled || !hiddenPlugins.includes(item.id)),
    [items, hiddenPlugins],
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return visible;
    const q = search.toLowerCase();
    return visible.filter((item) => item.name.toLowerCase().includes(q));
  }, [visible, search]);

  if (!sessionId || items.length === 0) return null;

  const disableAllPlugins = () => {
    if (!sessionId) return;
    sendCommand(sessionId, { type: 'cmd:plugins:disable_all' })
      .then(() => toast.success('Disabled all plugins'))
      .catch((error: unknown) => toast.error(error instanceof Error ? error.message : 'Failed to disable plugins'));
  };

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarMenu>
        <Collapsible defaultOpen className="group/collapsible">
          <SidebarMenuItem>
            <div className="flex items-center">
              <CollapsibleTrigger asChild>
                <SidebarMenuButton tooltip="Plugins" className="flex-1">
                  <PuzzleIcon />
                  <span>Plugins</span>
                  <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    title="Manage plugins"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SlidersHorizontalIcon className="size-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="start" className="w-48">
                  <DropdownMenuItem onSelect={disableAllPlugins} disabled={items.every((item) => item.disabled)}>
                    <PowerOffIcon className="size-3.5" />
                    Disable all plugins
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs">Disabled plugins</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {disabledItems.length === 0 && (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">No disabled plugins.</p>
                  )}
                  {disabledItems.map((item) => (
                    <DropdownMenuCheckboxItem
                      key={item.id}
                      checked={!hiddenPlugins.includes(item.id)}
                      onCheckedChange={() => toggleHiddenPlugin(item.id)}
                      className="text-xs"
                    >
                      {item.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <CollapsibleContent>
              <SidebarMenuSub>
                {visible.length > 4 && (
                  <div className="relative mb-1 px-2 pt-1">
                    <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Filter plugins…"
                      className="w-full rounded-md border bg-background pl-7 pr-2 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </div>
                )}
                {filtered.map((item) => (
                  <SidebarMenuSubItem key={item.name}>
                    <SidebarMenuSubButton
                      asChild
                      className={cn(
                        {
                          'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground':
                            item.url === location.pathname,
                        },
                        item.disabled && 'opacity-50',
                      )}
                    >
                      <NavLink to={item.url} end>
                        {item.icon && <DynamicIcon className="size-4" name={item.icon as IconName} />}
                        <span>{item.name}</span>
                      </NavLink>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                ))}
                {filtered.length === 0 && visible.length > 0 && search.trim() && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">No plugins match.</p>
                )}
                {visible.length === 0 && (
                  <p className="px-2 py-1 text-xs text-muted-foreground">All plugins hidden.</p>
                )}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuItem>
        </Collapsible>
      </SidebarMenu>
    </SidebarGroup>
  );
}
