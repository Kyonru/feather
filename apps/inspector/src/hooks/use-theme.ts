import { useSettingsStore } from '@/store/settings';
import { resolveTheme, type AppTheme, type SyntaxHighlighterStyle, type ThemeMode } from '@/assets/theme/registry';
import { useSyncExternalStore } from 'react';

const prefersDarkQuery = '(prefers-color-scheme: dark)';

function getSystemThemeMode(): ThemeMode {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return 'light';
  }

  return window.matchMedia(prefersDarkQuery).matches ? 'dark' : 'light';
}

function subscribeSystemThemeMode(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return () => {};
  }

  const media = window.matchMedia(prefersDarkQuery);
  media.addEventListener('change', onChange);

  return () => media.removeEventListener('change', onChange);
}

export function useSystemThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeSystemThemeMode, getSystemThemeMode, () => 'light');
}

export const useResolvedTheme = (): AppTheme => {
  const theme = useSettingsStore((state) => state.theme);
  const systemMode = useSystemThemeMode();

  return resolveTheme(theme, systemMode);
};

export const useTheme = (): ThemeMode => {
  return useResolvedTheme().mode;
};

export const useSyntaxTheme = (): SyntaxHighlighterStyle => {
  return useResolvedTheme().syntax;
};
