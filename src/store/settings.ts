import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  DEFAULT_PINNED_SIDEBAR_TOOLS,
  SIDEBAR_TOOL_ORDER,
  type MainFeatureId,
  type SidebarToolId,
} from '@/constants/main-features';
import { compactStoredLogHistory, isStorageQuotaError } from './log-history';
import {
  DEFAULT_COLLAPSED_SHADER_GRAPH_NODE_CATEGORIES,
  normalizeShaderGraphNodeCategories,
} from '@/constants/shader-graph';
import { normalizeThemePreference, type ThemePreference } from '@/assets/theme/registry';
import type { NodeCategory } from '@/types/shader-graph';
import type { TextureLabRecipe } from '@/types/texture-lab';
import { DEFAULT_TEXTURE_LAB_RECIPE, normalizeTextureLabRecipe } from '@/pages/texture-lab/generator';

type SettingsStoreState = {
  open: boolean;
  theme: ThemePreference;
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
  pinnedSidebarTools: SidebarToolId[];
  collapsedShaderGraphNodeCategories: NodeCategory[];
  particleTimelineZoom: number;
  particleTimelineSnap: boolean;
  textureLabRecipe: TextureLabRecipe;
  showHiddenMainFeaturesInCommandCenter: boolean;
  assetSourceDir: string;
};

type SettingsStoreActions = {
  setIsLatestVersion: (isLatestVersion: boolean) => void;
  setOpen: (open: boolean) => void;
  setTheme: (theme: ThemePreference) => void;
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
  togglePinnedSidebarTool: (toolId: SidebarToolId) => void;
  setPinnedSidebarTools: (toolIds: SidebarToolId[]) => void;
  toggleShaderGraphNodeCategory: (category: NodeCategory) => void;
  setCollapsedShaderGraphNodeCategories: (categories: NodeCategory[]) => void;
  setParticleTimelineZoom: (zoom: number) => void;
  setParticleTimelineSnap: (snap: boolean) => void;
  setTextureLabRecipe: (recipe: Partial<TextureLabRecipe>) => void;
  setShowHiddenMainFeaturesInCommandCenter: (show: boolean) => void;
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

function normalizePinnedSidebarTools(toolIds?: unknown): SidebarToolId[] {
  if (!Array.isArray(toolIds)) return [...DEFAULT_PINNED_SIDEBAR_TOOLS];
  const valid = new Set<SidebarToolId>(SIDEBAR_TOOL_ORDER);
  const seen = new Set<SidebarToolId>();
  const normalized: SidebarToolId[] = [];

  for (const toolId of toolIds) {
    if (typeof toolId !== 'string' || !valid.has(toolId as SidebarToolId)) continue;
    const id = toolId as SidebarToolId;
    if (seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  return SIDEBAR_TOOL_ORDER.filter((toolId) => normalized.includes(toolId));
}

function normalizeParticleTimelineZoom(zoom?: unknown): number {
  const value = Number(zoom);
  if (!Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(1, Math.round(value * 4) / 4));
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
  pinnedSidebarTools: [...DEFAULT_PINNED_SIDEBAR_TOOLS],
  collapsedShaderGraphNodeCategories: [...DEFAULT_COLLAPSED_SHADER_GRAPH_NODE_CATEGORIES],
  particleTimelineZoom: 1,
  particleTimelineSnap: true,
  textureLabRecipe: DEFAULT_TEXTURE_LAB_RECIPE,
  showHiddenMainFeaturesInCommandCenter: false,
  assetSourceDir: '',
};

function createSettingsStorage(): StateStorage {
  const storage = globalThis.localStorage;
  return {
    getItem: (name) => storage.getItem(name),
    removeItem: (name) => storage.removeItem(name),
    setItem: (name, value) => {
      try {
        storage.setItem(name, value);
      } catch (error) {
        if (isStorageQuotaError(error) && compactStoredLogHistory(storage)) {
          try {
            storage.setItem(name, value);
            return;
          } catch (retryError) {
            console.warn('[Feather] Could not persist settings after compacting log history:', retryError);
            return;
          }
        }
        console.warn('[Feather] Could not persist settings:', error);
      }
    },
  };
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setIsLatestVersion: (isLatestVersion: boolean) => set({ isLatestVersion }),
      setOpen: (open: boolean) => set({ open }),
      setTheme: (theme: ThemePreference) => set({ theme: normalizeThemePreference(theme) }),
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
      setPinnedSidebarTools: (pinnedSidebarTools: SidebarToolId[]) =>
        set({ pinnedSidebarTools: normalizePinnedSidebarTools(pinnedSidebarTools) }),
      setCollapsedShaderGraphNodeCategories: (collapsedShaderGraphNodeCategories: NodeCategory[]) =>
        set({
          collapsedShaderGraphNodeCategories: normalizeShaderGraphNodeCategories(
            collapsedShaderGraphNodeCategories,
            [],
          ),
        }),
      setParticleTimelineZoom: (particleTimelineZoom: number) =>
        set({ particleTimelineZoom: normalizeParticleTimelineZoom(particleTimelineZoom) }),
      setParticleTimelineSnap: (particleTimelineSnap: boolean) => set({ particleTimelineSnap }),
      setTextureLabRecipe: (textureLabRecipe: Partial<TextureLabRecipe>) =>
        set((state) => ({ textureLabRecipe: normalizeTextureLabRecipe({ ...state.textureLabRecipe, ...textureLabRecipe }) })),
      setShowHiddenMainFeaturesInCommandCenter: (showHiddenMainFeaturesInCommandCenter: boolean) =>
        set({ showHiddenMainFeaturesInCommandCenter }),
      togglePinnedSidebarTool: (toolId: SidebarToolId) =>
        set((state) => {
          const pinnedSidebarTools = state.pinnedSidebarTools.includes(toolId)
            ? state.pinnedSidebarTools.filter((id) => id !== toolId)
            : [...state.pinnedSidebarTools, toolId];

          return { pinnedSidebarTools: normalizePinnedSidebarTools(pinnedSidebarTools) };
        }),
      toggleShaderGraphNodeCategory: (category: NodeCategory) =>
        set((state) => {
          const collapsedShaderGraphNodeCategories = state.collapsedShaderGraphNodeCategories.includes(category)
            ? state.collapsedShaderGraphNodeCategories.filter((id) => id !== category)
            : [...state.collapsedShaderGraphNodeCategories, category];

          return {
            collapsedShaderGraphNodeCategories: normalizeShaderGraphNodeCategories(
              collapsedShaderGraphNodeCategories,
              [],
            ),
          };
        }),
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
    {
      name: 'settings-storage',
      storage: createJSONStorage(createSettingsStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<SettingsStore> | undefined;

        return {
          ...currentState,
          ...persisted,
          theme: normalizeThemePreference(persisted?.theme),
          pinnedSidebarTools: normalizePinnedSidebarTools(persisted?.pinnedSidebarTools),
          collapsedShaderGraphNodeCategories: normalizeShaderGraphNodeCategories(
            persisted?.collapsedShaderGraphNodeCategories,
          ),
          particleTimelineZoom: normalizeParticleTimelineZoom(persisted?.particleTimelineZoom),
          particleTimelineSnap:
            typeof persisted?.particleTimelineSnap === 'boolean'
              ? persisted.particleTimelineSnap
              : currentState.particleTimelineSnap,
          textureLabRecipe: normalizeTextureLabRecipe(persisted?.textureLabRecipe),
        };
      },
    },
  ),
);
