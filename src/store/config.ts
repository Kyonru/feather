import { create } from 'zustand';

export interface SysInfo {
  arch: string;
  os: string;
  cpuCount: number;
}

export interface Config {
  plugins: Record<string, PluginConfig>;
  root_path: string;
  version: string;
  API: number;
  sampleRate: number;
  outfile: string;
  language: 'lua';
  captureScreenshot: boolean;
  location: string;
  sourceDir?: string;
  assets?: { enabled?: boolean };
  debugger?: {
    enabled?: boolean;
    hotReload?: {
      enabled?: boolean;
      active?: boolean;
      persistToDisk?: boolean;
      requireLocalNetwork?: boolean;
      modifiedModules?: string[];
      persistedModules?: string[];
      failedModules?: string[];
      history?: unknown[];
    };
  };
  sysInfo?: SysInfo;
  deviceId?: string;
  sessionName?: string;
}

export interface PluginConfig {
  type?: string;
  tabName?: string;
  icon?: string;
  disabled?: boolean;
  incompatible?: boolean;
  incompatibilityReason?: string;
  api?: number | number[];
  minApi?: number;
  maxApi?: number;
  currentApi?: number;
  version?: string;
  docs?: string;
  actions?: Array<Record<string, unknown>>;
  [key: string]: unknown;
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
