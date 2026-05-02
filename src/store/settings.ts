import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type SettingsStoreState = {
  open: boolean;
  theme: 'system' | 'light' | 'dark';
  // Port the Feather desktop WS server listens on (games connect to this)
  port: number;
  textEditorPath: string;
  isLatestVersion: boolean;
  apiKey: string;
  pausedLogs: boolean;
};

type SettingsStoreActions = {
  setIsLatestVersion: (isLatestVersion: boolean) => void;
  setOpen: (open: boolean) => void;
  setTheme: (theme: 'system' | 'light' | 'dark') => void;
  setPort: (port: number) => void;
  setTextEditorPath: (textEditorPath: string) => void;
  setPausedLogs: (pausedLogs: boolean) => void;
  setApiKey: (apiKey: string) => void;
  reset: () => void;
};

type SettingsStore = SettingsStoreState & SettingsStoreActions;

const defaultSettings: SettingsStoreState = {
  isLatestVersion: true,
  open: false,
  theme: 'system',
  apiKey: '',
  port: 4004,
  textEditorPath: '/usr/local/bin/code',
  pausedLogs: false,
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
      reset: () => set((state) => ({ ...state, ...defaultSettings, open: state.open })),
      setPausedLogs: (pausedLogs: boolean) => set({ pausedLogs }),
      setApiKey: (apiKey: string) => set({ apiKey }),
    }),
    { name: 'settings-storage' },
  ),
);
