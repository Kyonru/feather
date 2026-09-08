import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import {
  DEFAULT_COLLAPSED_SHADER_GRAPH_NODE_CATEGORIES,
  normalizeShaderGraphNodeCategories,
} from '@/constants/shader-graph';
import type { NodeCategory } from '@/types/shader-graph';
import type { TextureLabRecipe, TextureLabSavedRecipe } from '@/types/texture-lab';
import {
  DEFAULT_TEXTURE_LAB_RECIPE,
  normalizeTextureLabRecipe,
  normalizeTextureLabSavedRecipes,
  TEXTURE_LAB_SAVED_RECIPE_LIMIT,
} from '@/pages/texture-lab/generator';

/**
 * Studio-owned preferences.
 *
 * These lived in the Inspector settings store, which is why that store imports
 * texture-lab and shader-graph code — the coupling that makes a shared app-state
 * package circular and blocks the application split (V4.md Phase 05).
 *
 * This stage extracts them **in place**: the tools still run inside the current
 * application, but their state now has its own store, its own storage key, and a
 * versioned payload that can be handed to a separately installed Feather Studio
 * later. Studio will have its own data directory and storage origin, so it can
 * never read `settings-storage` directly — the payload has to travel.
 *
 * The legacy copy is read but never deleted. Rollback has to stay possible.
 */

export const STUDIO_PREFERENCES_VERSION = 1;

/** The storage key for the extracted store. */
export const STUDIO_PREFERENCES_STORAGE_KEY = 'studio-preferences';

/** The Inspector store this state came from. Read-only from here, forever. */
export const LEGACY_SETTINGS_STORAGE_KEY = 'settings-storage';

export type TextureLabWorkspaceSnapshot = {
  recipe: TextureLabRecipe;
  savedRecipes: TextureLabSavedRecipe[];
};

/**
 * The transfer payload.
 *
 * Versioned deliberately: a separately installed Studio may be older or newer
 * than the Inspector handing this over, so the receiver must be able to tell.
 */
export type StudioPreferencesV1 = {
  version: typeof STUDIO_PREFERENCES_VERSION;
  textureLabRecipe: TextureLabRecipe;
  textureLabSavedRecipes: TextureLabSavedRecipe[];
  textureLabWorkspaceId: string;
  textureLabWorkspaces: Record<string, TextureLabWorkspaceSnapshot>;
  collapsedShaderGraphNodeCategories: NodeCategory[];
  particleTimelineZoom: number;
  particleTimelineSnap: boolean;
  /**
   * Studio's own copy. Seeded from the Inspector value at migration and then
   * owned independently — the two applications do not share a source directory
   * setting after the split.
   */
  assetSourceDir: string;
};

type StudioPreferencesState = Omit<StudioPreferencesV1, 'version'> & {
  /** Which migration produced this state, or 0 when it started clean. */
  migratedFrom: number;
};

type StudioPreferencesActions = {
  setTextureLabRecipe: (recipe: Partial<TextureLabRecipe>) => void;
  activateTextureLabWorkspace: (workspaceId: string) => void;
  deleteTextureLabWorkspace: (workspaceId: string) => void;
  saveTextureLabRecipe: (name: string, recipe?: Partial<TextureLabRecipe>) => void;
  deleteTextureLabSavedRecipe: (id: string) => void;
  toggleShaderGraphNodeCategory: (category: NodeCategory) => void;
  setCollapsedShaderGraphNodeCategories: (categories: NodeCategory[]) => void;
  setParticleTimelineZoom: (zoom: number) => void;
  setParticleTimelineSnap: (snap: boolean) => void;
  setAssetSourceDir: (dir: string) => void;
  /** Idempotent. Returns false when the payload was rejected or already applied. */
  importPreferences: (payload: unknown, options?: { force?: boolean }) => boolean;
};

export type StudioPreferencesStore = StudioPreferencesState & StudioPreferencesActions;

// --- normalizers -----------------------------------------------------------
// Behaviour preserved from the Inspector settings store. Changing any of these
// would silently reshape data users already have.

function createSavedTextureRecipeId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `texture-recipe-${crypto.randomUUID()}`;
  }
  return `texture-recipe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function normalizeTextureLabSavedName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 64);
}

export function normalizeTextureLabWorkspace(
  snapshot?: Partial<TextureLabWorkspaceSnapshot>,
): TextureLabWorkspaceSnapshot {
  return {
    recipe: normalizeTextureLabRecipe(snapshot?.recipe),
    savedRecipes: normalizeTextureLabSavedRecipes(snapshot?.savedRecipes),
  };
}

export function normalizeParticleTimelineZoom(zoom?: unknown): number {
  const value = Number(zoom);
  if (!Number.isFinite(value)) return 1;
  return Math.min(4, Math.max(1, Math.round(value * 4) / 4));
}

function normalizeWorkspaces(raw: unknown): Record<string, TextureLabWorkspaceSnapshot> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([id, workspace]) => [
      id,
      normalizeTextureLabWorkspace(workspace as Partial<TextureLabWorkspaceSnapshot>),
    ]),
  );
}

const defaultPreferences: StudioPreferencesState = {
  textureLabRecipe: DEFAULT_TEXTURE_LAB_RECIPE,
  textureLabSavedRecipes: [],
  textureLabWorkspaceId: 'default',
  textureLabWorkspaces: {},
  collapsedShaderGraphNodeCategories: [...DEFAULT_COLLAPSED_SHADER_GRAPH_NODE_CATEGORIES],
  particleTimelineZoom: 1,
  particleTimelineSnap: true,
  assetSourceDir: '',
  migratedFrom: 0,
};

/**
 * Coerce anything into a valid payload.
 *
 * Accepts partial and malformed input on purpose: this parses data that may have
 * come from an older application over a process bridge, so it must never throw.
 * Unrecognised fields are dropped rather than carried through.
 */
export function normalizeStudioPreferences(raw: unknown): StudioPreferencesV1 {
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;

  return {
    version: STUDIO_PREFERENCES_VERSION,
    textureLabRecipe: normalizeTextureLabRecipe(source.textureLabRecipe as Partial<TextureLabRecipe>),
    textureLabSavedRecipes: normalizeTextureLabSavedRecipes(source.textureLabSavedRecipes),
    textureLabWorkspaceId:
      typeof source.textureLabWorkspaceId === 'string' && source.textureLabWorkspaceId.trim()
        ? source.textureLabWorkspaceId
        : 'default',
    textureLabWorkspaces: normalizeWorkspaces(source.textureLabWorkspaces),
    collapsedShaderGraphNodeCategories: normalizeShaderGraphNodeCategories(
      source.collapsedShaderGraphNodeCategories,
    ),
    particleTimelineZoom: normalizeParticleTimelineZoom(source.particleTimelineZoom),
    particleTimelineSnap: typeof source.particleTimelineSnap === 'boolean' ? source.particleTimelineSnap : true,
    assetSourceDir: typeof source.assetSourceDir === 'string' ? source.assetSourceDir : '',
  };
}

/**
 * Read the Studio-owned slice out of the Inspector's persisted settings.
 *
 * Returns null when there is nothing to adopt, which is the case for a fresh
 * install and for any environment without local storage. Never writes, never
 * clears: the Inspector copy is the rollback path.
 */
export function readLegacyStudioPreferences(
  storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage,
): StudioPreferencesV1 | null {
  if (!storage) return null;
  let parsed: unknown;
  try {
    const raw = storage.getItem(LEGACY_SETTINGS_STORAGE_KEY);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // zustand/persist wraps state as { state, version }.
  const state = (parsed as { state?: unknown } | null)?.state;
  if (!state || typeof state !== 'object') return null;

  const source = state as Record<string, unknown>;
  const hasStudioFields = [
    'textureLabRecipe',
    'textureLabSavedRecipes',
    'textureLabWorkspaces',
    'collapsedShaderGraphNodeCategories',
    'particleTimelineZoom',
    'particleTimelineSnap',
  ].some((key) => key in source);

  if (!hasStudioFields) return null;
  return normalizeStudioPreferences(source);
}

function createStudioStorage(): StateStorage {
  const storage = globalThis.localStorage;
  return {
    getItem: (name) => storage.getItem(name),
    removeItem: (name) => storage.removeItem(name),
    setItem: (name, value) => {
      try {
        storage.setItem(name, value);
      } catch (error) {
        console.warn('[Feather] Could not persist studio preferences:', error);
      }
    },
  };
}

export const useStudioPreferencesStore = create<StudioPreferencesStore>()(
  persist(
    (set, get) => ({
      ...defaultPreferences,

      setTextureLabRecipe: (textureLabRecipe: Partial<TextureLabRecipe>) =>
        set((state) => ({
          textureLabRecipe: normalizeTextureLabRecipe({ ...state.textureLabRecipe, ...textureLabRecipe }),
        })),

      activateTextureLabWorkspace: (workspaceId: string) =>
        set((state) => {
          const id = workspaceId.trim() || 'default';
          if (state.textureLabWorkspaceId === id) return {};
          const textureLabWorkspaces = {
            ...state.textureLabWorkspaces,
            [state.textureLabWorkspaceId]: normalizeTextureLabWorkspace({
              recipe: state.textureLabRecipe,
              savedRecipes: state.textureLabSavedRecipes,
            }),
          };
          const next = textureLabWorkspaces[id] ?? normalizeTextureLabWorkspace();
          return {
            textureLabWorkspaceId: id,
            textureLabWorkspaces,
            textureLabRecipe: next.recipe,
            textureLabSavedRecipes: next.savedRecipes,
          };
        }),

      deleteTextureLabWorkspace: (workspaceId: string) =>
        set((state) => {
          const textureLabWorkspaces = { ...state.textureLabWorkspaces };
          delete textureLabWorkspaces[workspaceId];
          if (state.textureLabWorkspaceId !== workspaceId) {
            return { textureLabWorkspaces };
          }
          const fallback = textureLabWorkspaces.default ?? normalizeTextureLabWorkspace();
          return {
            textureLabWorkspaceId: 'default',
            textureLabWorkspaces,
            textureLabRecipe: fallback.recipe,
            textureLabSavedRecipes: fallback.savedRecipes,
          };
        }),

      saveTextureLabRecipe: (name: string, textureLabRecipe?: Partial<TextureLabRecipe>) =>
        set((state) => {
          const savedName = normalizeTextureLabSavedName(name);
          if (!savedName) return {};
          const now = Date.now();
          const recipe = normalizeTextureLabRecipe(textureLabRecipe ?? state.textureLabRecipe);
          const existing = state.textureLabSavedRecipes.find(
            (item) => item.name.toLowerCase() === savedName.toLowerCase(),
          );
          const nextSavedRecipe: TextureLabSavedRecipe = {
            id: existing?.id ?? createSavedTextureRecipeId(),
            name: savedName,
            recipe,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          };
          const rest = state.textureLabSavedRecipes.filter((item) => item.id !== nextSavedRecipe.id);
          return {
            textureLabSavedRecipes: normalizeTextureLabSavedRecipes([nextSavedRecipe, ...rest]).slice(
              0,
              TEXTURE_LAB_SAVED_RECIPE_LIMIT,
            ),
          };
        }),

      deleteTextureLabSavedRecipe: (id: string) =>
        set((state) => ({
          textureLabSavedRecipes: state.textureLabSavedRecipes.filter((item) => item.id !== id),
        })),

      toggleShaderGraphNodeCategory: (category: NodeCategory) =>
        set((state) => ({
          collapsedShaderGraphNodeCategories: state.collapsedShaderGraphNodeCategories.includes(category)
            ? state.collapsedShaderGraphNodeCategories.filter((id) => id !== category)
            : [...state.collapsedShaderGraphNodeCategories, category],
        })),

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

      setAssetSourceDir: (assetSourceDir: string) => set({ assetSourceDir }),

      importPreferences: (payload: unknown, options?: { force?: boolean }) => {
        const candidate = payload as { version?: unknown } | null;
        const version = Number(candidate?.version);

        // A payload from a newer Studio than this build understands. Refuse
        // rather than silently dropping the fields we cannot read.
        if (Number.isFinite(version) && version > STUDIO_PREFERENCES_VERSION) return false;

        // Idempotent: a repeated import of the same migration is a no-op unless
        // the caller explicitly asks to overwrite.
        const current = get();
        if (!options?.force && current.migratedFrom >= STUDIO_PREFERENCES_VERSION) return false;

        const normalized = normalizeStudioPreferences(payload);
        set({ ...normalized, migratedFrom: STUDIO_PREFERENCES_VERSION });
        return true;
      },
    }),
    {
      name: STUDIO_PREFERENCES_STORAGE_KEY,
      storage: createJSONStorage(createStudioStorage),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<StudioPreferencesStore> | undefined;

        // Nothing persisted yet: adopt the Inspector's copy once. This is the
        // in-place half of the migration. After the application split, a
        // separately installed Studio has no access to that key and instead
        // receives the payload over the bridge (Phase 05b).
        if (!persisted) {
          const legacy = readLegacyStudioPreferences();
          if (legacy) {
            const fields: Omit<StudioPreferencesV1, 'version'> = {
              textureLabRecipe: legacy.textureLabRecipe,
              textureLabSavedRecipes: legacy.textureLabSavedRecipes,
              textureLabWorkspaceId: legacy.textureLabWorkspaceId,
              textureLabWorkspaces: legacy.textureLabWorkspaces,
              collapsedShaderGraphNodeCategories: legacy.collapsedShaderGraphNodeCategories,
              particleTimelineZoom: legacy.particleTimelineZoom,
              particleTimelineSnap: legacy.particleTimelineSnap,
              assetSourceDir: legacy.assetSourceDir,
            };
            return { ...currentState, ...fields, migratedFrom: STUDIO_PREFERENCES_VERSION };
          }
          return currentState;
        }

        return {
          ...currentState,
          ...persisted,
          collapsedShaderGraphNodeCategories: normalizeShaderGraphNodeCategories(
            persisted.collapsedShaderGraphNodeCategories,
          ),
          particleTimelineZoom: normalizeParticleTimelineZoom(persisted.particleTimelineZoom),
          particleTimelineSnap:
            typeof persisted.particleTimelineSnap === 'boolean'
              ? persisted.particleTimelineSnap
              : currentState.particleTimelineSnap,
          textureLabRecipe: normalizeTextureLabRecipe(persisted.textureLabRecipe),
          textureLabSavedRecipes: normalizeTextureLabSavedRecipes(persisted.textureLabSavedRecipes),
          textureLabWorkspaceId: persisted.textureLabWorkspaceId ?? currentState.textureLabWorkspaceId,
          textureLabWorkspaces: normalizeWorkspaces(persisted.textureLabWorkspaces),
        };
      },
      /**
       * Materialize the store on first run.
       *
       * Zustand only writes on a state change, so without this an adoption from
       * legacy settings would sit in memory until the user happened to touch a
       * Studio control — and be redone on every launch until then. Persisting
       * eagerly also records the difference the two-step migration depends on:
       * `migratedFrom: 0` means "this install started clean", which is not the
       * same as "this install has never run".
       */
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        useStudioPreferencesStore.setState({ migratedFrom: state.migratedFrom });
      },
      // Mirrors the Inspector store: the active recipe and saved list are folded
      // back into the current workspace snapshot on write, so switching
      // workspaces never loses the one you were editing.
      partialize: (state) => ({
        ...state,
        textureLabWorkspaces: {
          ...state.textureLabWorkspaces,
          [state.textureLabWorkspaceId]: normalizeTextureLabWorkspace({
            recipe: state.textureLabRecipe,
            savedRecipes: state.textureLabSavedRecipes,
          }),
        },
      }),
    },
  ),
);

/**
 * The payload to hand a separately installed Studio on first pairing.
 *
 * Reads through `partialize`'s workspace folding so the in-flight recipe is
 * included, not just what was last written.
 */
export function exportStudioPreferencesV1(): StudioPreferencesV1 {
  const state = useStudioPreferencesStore.getState();
  return normalizeStudioPreferences({
    ...state,
    textureLabWorkspaces: {
      ...state.textureLabWorkspaces,
      [state.textureLabWorkspaceId]: normalizeTextureLabWorkspace({
        recipe: state.textureLabRecipe,
        savedRecipes: state.textureLabSavedRecipes,
      }),
    },
  });
}
