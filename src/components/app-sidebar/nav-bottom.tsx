import * as React from 'react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { BadgeAlertIcon, InfoIcon, SettingsIcon } from 'lucide-react';
import { useSettingsStore } from '@/store/settings';
import { useAboutStore } from '@/store/about';
import { useVersionMismatch } from '@/hooks/use-config';

export function NavBottom({ ...props }: {} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const setSettingsOpen = useSettingsStore((state) => state.setOpen);
  const setAboutOpen = useAboutStore((state) => state.setOpen);
  const isVersionMismatch = useVersionMismatch();

  const items = [
    {
      title: 'Settings',
      onPress: () => {
        setSettingsOpen(true);
      },
      icon: SettingsIcon,
    },
    {
      title: 'About',
      onPress: () => {
        setAboutOpen(true);
      },
      icon: isVersionMismatch ? BadgeAlertIcon : InfoIcon,
      className: isVersionMismatch ? 'bg-yellow-50 dark:bg-yellow-950 animate-pulse' : '',
    },
  ];

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild className={item.className}>
                <a
                  onClick={(e) => {
                    e.preventDefault();

                    item.onPress();
                  }}
                >
                  {item.icon && <item.icon />}
                  <span>{item.title}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
