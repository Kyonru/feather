import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type SettingsStoreState = {
  open: boolean;
  theme: 'system' | 'light' | 'dark';
  host: string;
  port: number;
  textEditorPath: string;
  isLatestVersion: boolean;
  pausedLogs: boolean;
};

type SettingsStoreActions = {
  setIsLatestVersion: (isLatestVersion: boolean) => void;
  setOpen: (open: boolean) => void;
  setTheme: (theme: 'system' | 'light' | 'dark') => void;
  setHost: (host: string) => void;
  setPort: (port: number) => void;
  setTextEditorPath: (textEditorPath: string) => void;
  setPausedLogs: (pausedLogs: boolean) => void;
  reset: () => void;
};

type SettingsStore = SettingsStoreState & SettingsStoreActions;

const defaultSettings: SettingsStoreState = {
  isLatestVersion: true,
  open: false,
  theme: 'system',
  host: 'http://localhost',
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
      setHost: (host: string) => set({ host }),
      setPort: (port: number) => set({ port }),
      setTextEditorPath: (textEditorPath: string) => set({ textEditorPath }),
      reset: () => set((state) => ({ ...state, ...defaultSettings, open: state.open })),
      setPausedLogs: (pausedLogs: boolean) => set({ pausedLogs }),
    }),
    { name: 'settings-storage' },
  ),
);
