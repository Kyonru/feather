import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UiProvider, type UiDependencies } from '@feather/ui';
import { createWebHost, HostProvider } from '@feather/host';
import { ThemeProvider, useResolvedTheme } from '@studio/theme';

/**
 * The showcase is Feather Studio running in a browser.
 *
 * It gets the web host and no session bridge, which is the standalone case the
 * tools already handle. Previously it shared the Inspector's provider tree,
 * which is how a *desktop* page ended up importing browser code out of the
 * showcase folder — the inversion Phase 04 removed.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { gcTime: 1000 * 60 * 60 } },
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

const host = createWebHost();

// The showcase has no Inspector settings store to read a theme from, so it
// follows the system preference.
const uiDependencies: UiDependencies = {
  useThemeMode: () => useResolvedTheme().mode,
  useSyntaxTheme: () => useResolvedTheme().syntax as Record<string, unknown>,
  copyToClipboard: (value: string) => {
    void navigator.clipboard?.writeText(value);
  },
};

export const AppProvider = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <HostProvider host={host}>
      <UiProvider value={uiDependencies}>
        <ThemeProvider>{children}</ThemeProvider>
      </UiProvider>
    </HostProvider>
  </QueryClientProvider>
);
