import { useLayoutEffect, useSyncExternalStore } from 'react';
import { resolveTheme, type ThemeMode } from '@feather/ui/theme/registry';

const prefersDarkQuery = '(prefers-color-scheme: dark)';

function getSystemThemeMode(): ThemeMode {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia(prefersDarkQuery).matches ? 'dark' : 'light';
}

function subscribeSystemThemeMode(onChange: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(prefersDarkQuery);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function useSystemThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeSystemThemeMode, getSystemThemeMode, () => 'light');
}

/**
 * Studio's theme.
 *
 * This is not decoration: the provider writes every design token onto the root
 * element as a CSS custom property. Without it `var(--background)` and friends
 * resolve to nothing and the layout collapses — which is exactly what happened
 * when the showcase first ran without it.
 *
 * Studio follows the system preference. It has no theme *setting* yet because
 * that lived in Inspector's settings store, which Studio no longer reads.
 */
export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemMode = useSystemThemeMode();
  const resolvedTheme = resolveTheme('system', systemMode);

  useLayoutEffect(() => {
    const root = window.document.documentElement;
    if (!root.classList) return;

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

export function useResolvedTheme() {
  return resolveTheme('system', useSystemThemeMode());
}
