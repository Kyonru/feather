import { create } from 'zustand';

export type GamePluginInfo = {
  disabled?: boolean;
  incompatible?: boolean;
  tabName?: string;
  icon?: string;
  [key: string]: unknown;
};

/**
 * The slice of the attached game's config Studio actually uses: the source
 * directory for resolving preview asset paths, and per-plugin availability for
 * the three tools' own plugins.
 *
 * Inspector holds the full config. Mirroring one slice here keeps Studio from
 * importing a store it has no business reading, and keeps it working when there
 * is no game at all.
 */
type GameConfigStore = {
  config: { sourceDir?: string; plugins?: Record<string, GamePluginInfo> } | null;
  setConfig: (config: { sourceDir?: string; plugins?: Record<string, GamePluginInfo> } | null) => void;
};

export const useConfigStore = create<GameConfigStore>()((set) => ({
  config: null,
  setConfig: (config) => set({ config }),
}));
