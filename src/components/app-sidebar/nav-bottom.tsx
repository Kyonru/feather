import * as React from 'react';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { CloudDownloadIcon, InfoIcon, SettingsIcon } from 'lucide-react';
import { useSettingsStore } from '@/store/settings';
import { useAboutStore } from '@/store/about';

export function NavBottom({ ...props }: {} & React.ComponentPropsWithoutRef<typeof SidebarGroup>) {
  const setSettingsOpen = useSettingsStore((state) => state.setOpen);
  const setAboutOpen = useAboutStore((state) => state.setOpen);
  const isLatestVersion = useSettingsStore((state) => state.isLatestVersion);

  const aboutIcon = React.useMemo(() => {
    if (!isLatestVersion) {
      return CloudDownloadIcon;
    }

    return InfoIcon;
  }, [isLatestVersion]);

  const aboutClassName = React.useMemo(() => {
    if (!isLatestVersion) {
      return 'bg-cyan-50 dark:bg-cyan-950 animate-pulse';
    }

    return '';
  }, [isLatestVersion]);

  const aboutTitle = React.useMemo(() => {
    if (!isLatestVersion) {
      return 'New version available';
    }

    return 'Info';
  }, [isLatestVersion]);

  const items = [
    {
      title: 'Settings',
      onPress: () => {
        setSettingsOpen(true);
      },
      icon: SettingsIcon,
    },
    {
      title: aboutTitle,
      onPress: () => {
        setAboutOpen(true);
      },
      icon: aboutIcon,
      className: aboutClassName,
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
