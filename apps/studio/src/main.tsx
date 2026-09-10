import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createWebHost, HostProvider, type FeatherHost } from '@feather/host';
import { UiProvider, type UiDependencies } from '@feather/ui';
import { ThemeProvider, useResolvedTheme } from './theme';
import { StudioApp } from './StudioApp';
import './studio.css';

/**
 * Feather Studio's entry point.
 *
 * Studio runs in two places: inside its own Tauri shell, and as a plain web
 * page. The host is chosen from what is actually present rather than from which
 * build this is, the same way the Inspector entry does it.
 *
 * `createTauriHost` is imported lazily so a web build never pulls `@tauri-apps/*`
 * into its bundle.
 */
async function resolveHost(): Promise<FeatherHost> {
  const hasTauri = '__TAURI_INTERNALS__' in globalThis;
  if (!hasTauri) return createWebHost();

  // Desktop-only wiring, imported lazily for the same reason as the host: a web
  // build must not pull `@tauri-apps/*` into its bundle.
  const [{ createTauriHost }, { tauriCreativeMcpTransport }, { setCreativeMcpTransport }] = await Promise.all([
    import('@feather/host/tauri'),
    import('./desktop/mcp-transport.ts'),
    import('./mcp/transport.ts'),
  ]);
  setCreativeMcpTransport(tauriCreativeMcpTransport);
  return createTauriHost();
}

const host = await resolveHost();

/**
 * Studio's provider stack.
 *
 * This mounted `HostProvider` alone until now, which is why none of the tools
 * could be rendered: they reference design tokens 394 times and every one
 * resolved to nothing without `ThemeProvider`, their hooks need a query client,
 * and `@feather/ui` components need the UI dependencies. The showcase has run
 * the same tools successfully with these four all along — see
 * `showcase/providers.tsx`, which this mirrors.
 *
 * The query client keeps a long `gcTime` because creative state is expensive to
 * rebuild and cheap to hold.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { gcTime: 1000 * 60 * 60 } },
});

// Studio follows the system theme. Whether it should instead open dark by
// default — the argument being that you cannot judge a color against a surround
// that has its own — is deferred; see V4-STUDIO.md S1.
const uiDependencies: UiDependencies = {
  useThemeMode: () => useResolvedTheme().mode,
  useSyntaxTheme: () => useResolvedTheme().syntax as Record<string, unknown>,
  copyToClipboard: (value: string) => {
    void navigator.clipboard?.writeText(value);
  },
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <HostProvider host={host}>
        <UiProvider value={uiDependencies}>
          <ThemeProvider>
            <StudioApp />
          </ThemeProvider>
        </UiProvider>
      </HostProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
