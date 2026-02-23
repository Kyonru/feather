import { create } from 'zustand';

export interface Config {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: Record<string, any>;
  root_path: string;
  version: string;
  API: number;
  sampleRate: number;
  outfile: string;
  language: 'lua';
}

interface ConfigState {
  config: Config | null;
  overrideConfig?: Config | null;
  disconnected: boolean;
}

interface ConfigAction {
  setConfig: (config: Config | null) => void;
  setDisconnected: (disconnected: boolean) => void;
  setSampleRate: (sampleRate: number) => void;
  setLogOverride: (filePath?: string) => void;
}

type ConfigStore = ConfigState & ConfigAction;

export const useConfigStore = create<ConfigStore>((set) => ({
  config: null,
  disconnected: true,
  setDisconnected: (disconnected: boolean) => set({ disconnected }),
  setConfig: (config: Config | null) => set({ config }),
  setSampleRate: (sampleRate: number) =>
    set((state) => ({ ...state, config: state.config ? { ...state.config, sampleRate } : null })),
  setLogOverride: (filePath?: string) =>
    set((state) => ({
      ...state,
      overrideConfig: {
        ...state.config,
        ...state.overrideConfig,
        outfile: filePath,
      } as Config,
    })),
}));
