import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type SettingsStoreState = {
  open: boolean;
  theme: 'system' | 'light' | 'dark';
  host: string;
  port: number;
  textEditorPath: string;
};

type SettingsStoreActions = {
  setOpen: (open: boolean) => void;
  setTheme: (theme: 'system' | 'light' | 'dark') => void;
  setHost: (host: string) => void;
  setPort: (port: number) => void;
  setTextEditorPath: (textEditorPath: string) => void;
  reset: () => void;
};

type SettingsStore = SettingsStoreState & SettingsStoreActions;

const defaultSettings: SettingsStoreState = {
  open: false,
  theme: 'system',
  host: 'http://localhost',
  port: 4004,
  textEditorPath: '/usr/local/bin/code',
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setOpen: (open: boolean) => set({ open }),
      setTheme: (theme: 'system' | 'light' | 'dark') => set({ theme }),
      setHost: (host: string) => set({ host }),
      setPort: (port: number) => set({ port }),
      setTextEditorPath: (textEditorPath: string) => set({ textEditorPath }),
      reset: () => set((state) => ({ ...state, ...defaultSettings, open: state.open })),
    }),
    { name: 'settings-storage' },
  ),
);
