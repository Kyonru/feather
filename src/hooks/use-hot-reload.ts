import { useMemo } from 'react';
import { sendCommand } from '@/lib/send-command';
import { useQuery } from '@tanstack/react-query';
import { useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';
import { sessionQueryKey } from './use-ws-connection';

export type HotReloadHistoryEntry = {
  ok: boolean;
  module: string;
  error?: string;
  persisted?: boolean;
  restored?: boolean;
  time?: number;
};

export type HotReloadState = {
  enabled: boolean;
  active: boolean;
  persistToDisk: boolean;
  requireLocalNetwork: boolean;
  modifiedModules: string[];
  persistedModules: string[];
  failedModules: string[];
  history: HotReloadHistoryEntry[];
};

const DEFAULT_STATE: HotReloadState = {
  enabled: false,
  active: false,
  persistToDisk: false,
  requireLocalNetwork: true,
  modifiedModules: [],
  persistedModules: [],
  failedModules: [],
  history: [],
};

function normalizeHotReloadState(value: unknown): HotReloadState {
  const input = value && typeof value === 'object' ? (value as Partial<HotReloadState>) : {};
  return {
    enabled: input.enabled ?? DEFAULT_STATE.enabled,
    active: input.active ?? DEFAULT_STATE.active,
    persistToDisk: input.persistToDisk ?? DEFAULT_STATE.persistToDisk,
    requireLocalNetwork: input.requireLocalNetwork ?? DEFAULT_STATE.requireLocalNetwork,
    modifiedModules: Array.isArray(input.modifiedModules) ? input.modifiedModules : DEFAULT_STATE.modifiedModules,
    persistedModules: Array.isArray(input.persistedModules) ? input.persistedModules : DEFAULT_STATE.persistedModules,
    failedModules: Array.isArray(input.failedModules) ? input.failedModules : DEFAULT_STATE.failedModules,
    history: Array.isArray(input.history) ? input.history : DEFAULT_STATE.history,
  };
}

export function pathToLuaModule(path: string): string | null {
  const normalized = path
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\.lua$/, '');
  if (!normalized || normalized === 'main' || normalized === 'conf') return null;
  const withoutInit = normalized.endsWith('/init') ? normalized.slice(0, -'/init'.length) : normalized;
  const moduleName = withoutInit.replace(/\//g, '.');
  return /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(moduleName) ? moduleName : null;
}

export const useHotReload = () => {
  const sessionId = useSessionStore((state) => state.sessionId);
  const configState = useConfigStore((state) => state.config?.debugger?.hotReload);
  const initialState = normalizeHotReloadState(configState);

  const { data } = useQuery<HotReloadState>({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: sessionQueryKey.hotReload(sessionId ?? ''),
    queryFn: () => initialState,
    enabled: false,
    initialData: initialState,
  });

  const sendModule = useMemo(() => {
    return (moduleName: string, source: string) => {
      if (!sessionId) return;
      sendCommand(sessionId, {
        type: 'cmd:hot_reload:module',
        data: { module: moduleName, source },
      }).catch(() => {});
    };
  }, [sessionId]);

  const restoreOriginals = useMemo(() => {
    return () => {
      if (!sessionId) return;
      sendCommand(sessionId, { type: 'cmd:hot_reload:restore' }).catch(() => {});
    };
  }, [sessionId]);

  return {
    state: normalizeHotReloadState(data),
    sendModule,
    restoreOriginals,
  };
};
