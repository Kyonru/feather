import React from 'react';
import ReactDOM from 'react-dom/client';
import { createWebHost, HostProvider, type FeatherHost } from '@feather/host';
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

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <HostProvider host={host}>
      <StudioApp />
    </HostProvider>
  </React.StrictMode>,
);
