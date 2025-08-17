import { useSettingsStore } from '@/store/settings';
import { useEffect } from 'react';

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const theme = useSettingsStore((state) => state.theme);

  useEffect(() => {
    const root = window.document.documentElement;

    if (!root.classList.add || !root.classList) {
      return;
    }

    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

      root.classList.add(systemTheme);
      return;
    }

    root.classList.add(theme);
  }, [theme]);

  return <>{children}</>;
};
