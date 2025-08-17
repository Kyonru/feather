import { useSettingsStore } from '@/store/settings';

export const useTheme = () => {
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  const theme = useSettingsStore((state) => state.theme);

  if (theme === 'system') {
    return isDark ? 'dark' : 'light';
  }

  return theme;
};
