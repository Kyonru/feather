import { useSettingsStore } from '@/store/settings';
import { useLayoutEffect } from 'react';
import { resolveTheme } from '@/assets/theme/registry';
import { useSystemThemeMode } from '@/hooks/use-theme';

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const theme = useSettingsStore((state) => state.theme);
  const systemMode = useSystemThemeMode();
  const resolvedTheme = resolveTheme(theme, systemMode);

  useLayoutEffect(() => {
    const root = window.document.documentElement;

    if (!root.classList.add || !root.classList) {
      return;
    }

    root.classList.remove('light', 'dark');
    root.classList.add(resolvedTheme.mode);
    root.dataset.theme = resolvedTheme.id;
    root.style.colorScheme = resolvedTheme.mode;

    for (const [name, value] of Object.entries(resolvedTheme.variables)) {
      root.style.setProperty(`--${name}`, value);
    }
  }, [resolvedTheme]);

  return <>{children}</>;
};
