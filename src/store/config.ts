import { create } from 'zustand';

export interface Config {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: Record<string, any>;
  root_path: string;
  version: string;
}

interface ConfigStore {
  config: Config | null;
  disconnected: boolean;
  setConfig: (config: Config | null) => void;
  setDisconnected: (disconnected: boolean) => void;
}

export const useConfigStore = create<ConfigStore>((set) => ({
  config: null,
  disconnected: true,
  setDisconnected: (disconnected: boolean) => set({ disconnected }),
  setConfig: (config: Config | null) => set({ config }),
}));
