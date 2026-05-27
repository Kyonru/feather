import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MainFeatureId } from '@/constants/main-features';

type SettingsStoreState = {
  open: boolean;
  theme: 'system' | 'light' | 'dark';
  // Port the Feather desktop WS server listens on (games connect to this)
  port: number;
  textEditorPath: string;
  cliPath: string;
  cliProjectDir: string;
  isLatestVersion: boolean;
  apiKey: string;
  appId: string;
  sessionApiKeys: Record<string, string>;
  pausedLogs: boolean;
  // Seconds without a message before considering a session disconnected (default 15)
  connectionTimeout: number;
  hiddenPlugins: string[];
  hiddenMainFeatures: MainFeatureId[];
  assetSourceDir: string;
};

type SettingsStoreActions = {
  setIsLatestVersion: (isLatestVersion: boolean) => void;
  setOpen: (open: boolean) => void;
  setTheme: (theme: 'system' | 'light' | 'dark') => void;
  setPort: (port: number) => void;
  setTextEditorPath: (textEditorPath: string) => void;
  setCliPath: (cliPath: string) => void;
  setCliProjectDir: (cliProjectDir: string) => void;
  setPausedLogs: (pausedLogs: boolean) => void;
  setApiKey: (apiKey: string) => void;
  setAppId: (appId: string) => void;
  regenerateAppId: () => void;
  setSessionApiKey: (sessionId: string, apiKey: string) => void;
  setConnectionTimeout: (timeout: number) => void;
  toggleHiddenPlugin: (pluginId: string) => void;
  toggleHiddenMainFeature: (featureId: MainFeatureId) => void;
  setHiddenMainFeatures: (featureIds: MainFeatureId[]) => void;
  setAssetSourceDir: (dir: string) => void;
  reset: () => void;
};

type SettingsStore = SettingsStoreState & SettingsStoreActions;

function createAppId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `feather-app-${crypto.randomUUID()}`;
  }
  return `feather-app-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const defaultSettings: SettingsStoreState = {
  isLatestVersion: true,
  open: false,
  theme: 'system',
  apiKey: '',
  appId: createAppId(),
  sessionApiKeys: {},
  port: 4004,
  textEditorPath: '/usr/local/bin/code',
  cliPath: '',
  cliProjectDir: '',
  pausedLogs: false,
  connectionTimeout: 15,
  hiddenPlugins: [],
  hiddenMainFeatures: [],
  assetSourceDir: '',
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setIsLatestVersion: (isLatestVersion: boolean) => set({ isLatestVersion }),
      setOpen: (open: boolean) => set({ open }),
      setTheme: (theme: 'system' | 'light' | 'dark') => set({ theme }),
      setPort: (port: number) => set({ port }),
      setTextEditorPath: (textEditorPath: string) => set({ textEditorPath }),
      setCliPath: (cliPath: string) => set({ cliPath }),
      setCliProjectDir: (cliProjectDir: string) => set({ cliProjectDir }),
      reset: () => set((state) => ({ ...state, ...defaultSettings, open: state.open })),
      setPausedLogs: (pausedLogs: boolean) => set({ pausedLogs }),
      setApiKey: (apiKey: string) => set({ apiKey }),
      setAppId: (appId: string) => set({ appId }),
      regenerateAppId: () => set({ appId: createAppId() }),
      setSessionApiKey: (sessionId: string, apiKey: string) =>
        set((state) => {
          const sessionApiKeys = { ...state.sessionApiKeys };
          if (apiKey.trim() === '') {
            delete sessionApiKeys[sessionId];
          } else {
            sessionApiKeys[sessionId] = apiKey;
          }
          return { sessionApiKeys };
        }),
      setConnectionTimeout: (connectionTimeout: number) => set({ connectionTimeout }),
      setAssetSourceDir: (assetSourceDir: string) => set({ assetSourceDir }),
      setHiddenMainFeatures: (hiddenMainFeatures: MainFeatureId[]) => set({ hiddenMainFeatures }),
      toggleHiddenMainFeature: (featureId: MainFeatureId) =>
        set((state) => ({
          hiddenMainFeatures: state.hiddenMainFeatures.includes(featureId)
            ? state.hiddenMainFeatures.filter((id) => id !== featureId)
            : [...state.hiddenMainFeatures, featureId],
        })),
      toggleHiddenPlugin: (pluginId: string) =>
        set((state) => ({
          hiddenPlugins: state.hiddenPlugins.includes(pluginId)
            ? state.hiddenPlugins.filter((id) => id !== pluginId)
            : [...state.hiddenPlugins, pluginId],
        })),
    }),
    { name: 'settings-storage' },
  ),
);
