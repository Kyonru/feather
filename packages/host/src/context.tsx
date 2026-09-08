import { createContext, useContext, type ReactNode } from 'react';
import type { FeatherHost } from './types';

const HostContext = createContext<FeatherHost | null>(null);

export function HostProvider({ host, children }: { host: FeatherHost; children: ReactNode }) {
  return <HostContext.Provider value={host}>{children}</HostContext.Provider>;
}

/**
 * The host for the current environment.
 *
 * Throws rather than returning null: a studio component that reaches the file
 * system with no host configured is a wiring bug, and failing loudly at mount is
 * better than a silently dead button.
 */
export function useHost(): FeatherHost {
  const host = useContext(HostContext);
  if (!host) {
    throw new Error('useHost() called outside a <HostProvider>. Wrap the app in one.');
  }
  return host;
}
