import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HostProvider, type FeatherHost } from '@feather/host';
import { UiProvider, type UiDependencies } from '@feather/ui';
import { useTheme, useSyntaxTheme } from './hooks/use-theme';
import { copyToClipboardWithMeta } from './utils/strings';
import { ThemeProvider } from './components/theme';

// Clean up stale react-query offline cache from previous versions
try {
  localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE');
} catch {
  // ignore
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60, // 1 hour in-memory cache
    },
  },
});

declare global {
  interface Window {
    __FEATHER_QUERY_CLIENT__?: QueryClient;
  }
}

if (import.meta.env.DEV) {
  try {
    if (localStorage.getItem('feather-e2e-query-client') === '1') {
      window.__FEATHER_QUERY_CLIENT__ = queryClient;
    }
  } catch {
    // ignored
  }
}

/**
 * The host is injected by the entry point rather than chosen here: this module
 * is shared by the Tauri desktop build and the browser showcase, and importing
 * the Tauri host here would pull `@tauri-apps/*` into the web bundle.
 */
// The primitives in @feather/ui need a theme and a clipboard, both of which
// live in app state. Supplying them here keeps that state out of the package.
const uiDependencies: UiDependencies = {
  useThemeMode: useTheme,
  useSyntaxTheme: useSyntaxTheme as UiDependencies['useSyntaxTheme'],
  copyToClipboard: copyToClipboardWithMeta,
};

export const AppProvider = ({ host, children }: { host: FeatherHost; children: React.ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <HostProvider host={host}>
        <UiProvider value={uiDependencies}>
          <ThemeProvider>{children}</ThemeProvider>
        </UiProvider>
      </HostProvider>
    </QueryClientProvider>
  );
};
