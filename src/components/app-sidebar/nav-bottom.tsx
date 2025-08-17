import * as React from 'react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { InfoIcon, SettingsIcon } from 'lucide-react';
import { useSettingsStore } from '@/store/settings';

export function NavBottom({ ...props }: {} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const setSettingsOpen = useSettingsStore((state) => state.setOpen);

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
        // TODO: add about page
      },
      icon: InfoIcon,
    },
  ];

  return (
    <SidebarGroup {...props}>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
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
