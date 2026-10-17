import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useShaderGraphStore } from '@studio/store/shader-graph';
import { useStudioPreferencesStore } from '@studio/store/studio-preferences';
import {
  deleteLocalParticleWorkspace,
  listLocalParticleWorkspaceIds,
} from '@studio/tools/particle-system-playground/use-local-particle-playground';
import {
  adoptLegacyWorkspace,
  nextWorkspaceName,
  normalizeWorkspaceName,
  normalizeWorkspaceRegistry,
  toolKey,
  workspaceKeys,
  type StudioWorkspace,
  type WorkspaceRegistry,
  type WorkspaceTool,
} from './workspace-registry';

/**
 * Studio's workspaces (skills/feather-desktop-app/references/design-rules.md, W6):
 * named, listed, switchable, and
 * saved continuously.
 *
 * This store owns only *which* workspace is current and what each is called.
 * The work itself stays where each tool already keeps it, keyed by the
 * workspace's id — so switching is cheap, and every tool is saved on every
 * change by the persistence it already had. All of it lives in local storage,
 * which both the Tauri webview and the browser showcase have.
 */

export const STUDIO_WORKSPACES_STORAGE_KEY = 'feather-studio-workspaces';

type StudioWorkspacesStore = WorkspaceRegistry & {
  create: (name?: string) => string;
  rename: (id: string, name: string) => void;
  switchTo: (id: string) => void;
  /** Permanent. The UI confirms first; this does not. Refuses the last workspace. */
  remove: (id: string) => boolean;
};

/** The first workspace adopts whatever the tools were already showing. */
function firstWorkspace(): StudioWorkspace {
  return adoptLegacyWorkspace(
    {
      shaderGraphId: useShaderGraphStore.getState().activeWorkspaceId,
      textureLabId: useStudioPreferencesStore.getState().textureLabWorkspaceId,
      particleIds: listLocalParticleWorkspaceIds(),
    },
    Date.now(),
  );
}

function newWorkspaceId(): string {
  const random =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `ws-${random}`;
}

/**
 * Point the stores that are not React-owned at a workspace.
 *
 * Shader Graph and Texture Lab fold the outgoing state into their per-id
 * snapshot before loading the incoming one, so nothing is lost on a switch.
 * Particles reads its key from this store through `useWorkspaceToolKey`.
 */
function activateTools(workspace: StudioWorkspace | undefined) {
  if (!workspace) return;
  useShaderGraphStore.getState().activateWorkspace(toolKey(workspace, 'shaderGraph'));
  useStudioPreferencesStore.getState().activateTextureLabWorkspace(toolKey(workspace, 'textureLab'));
}

export const useStudioWorkspacesStore = create<StudioWorkspacesStore>()(
  persist(
    (set, get) => ({
      ...normalizeWorkspaceRegistry(null, firstWorkspace),

      create: (name) => {
        const workspace: StudioWorkspace = {
          id: newWorkspaceId(),
          name: normalizeWorkspaceName(name, nextWorkspaceName(get().workspaces)),
          createdAt: Date.now(),
        };
        set((state) => ({ workspaces: [...state.workspaces, workspace], activeId: workspace.id }));
        activateTools(workspace);
        return workspace.id;
      },

      rename: (id, name) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === id ? { ...workspace, name: normalizeWorkspaceName(name, workspace.name) } : workspace,
          ),
        })),

      switchTo: (id) => {
        const workspace = get().workspaces.find((item) => item.id === id);
        if (!workspace || get().activeId === id) return;
        set({ activeId: id });
        activateTools(workspace);
      },

      remove: (id) => {
        const { workspaces, activeId } = get();
        const index = workspaces.findIndex((workspace) => workspace.id === id);
        if (index === -1 || workspaces.length <= 1) return false;
        const doomed = workspaces[index];
        const remaining = workspaces.filter((workspace) => workspace.id !== id);

        // Leave it first, so no tool is holding — and about to re-save — the
        // state being deleted.
        if (activeId === id) {
          const next = remaining[Math.min(index, remaining.length - 1)];
          set({ activeId: next.id });
          activateTools(next);
        }
        set({ workspaces: remaining });

        const keys = workspaceKeys(doomed);
        useShaderGraphStore.getState().deleteWorkspace(keys.shaderGraph);
        useStudioPreferencesStore.getState().deleteTextureLabWorkspace(keys.textureLab);
        deleteLocalParticleWorkspace(keys.particles);
        return true;
      },
    }),
    {
      name: STUDIO_WORKSPACES_STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ activeId: state.activeId, workspaces: state.workspaces }),
      // Nothing persisted is the migration case: the default state already
      // adopted the legacy keys. Anything persisted is coerced — a registry
      // with no usable workspace would leave every tool without a key.
      merge: (persisted, current) => ({
        ...current,
        ...(persisted ? normalizeWorkspaceRegistry(persisted, firstWorkspace) : {}),
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // Materialize on first run, so the adoption is recorded once rather
        // than recomputed from whatever the tools hold on every launch.
        useStudioWorkspacesStore.setState({ activeId: state.activeId, workspaces: state.workspaces });
      },
    },
  ),
);

// Point the tools at the workspace that was current when Studio last closed.
activateTools(
  useStudioWorkspacesStore.getState().workspaces.find(
    (workspace) => workspace.id === useStudioWorkspacesStore.getState().activeId,
  ),
);

export function useActiveWorkspace(): StudioWorkspace {
  return useStudioWorkspacesStore(
    (state) => state.workspaces.find((workspace) => workspace.id === state.activeId) ?? state.workspaces[0],
  );
}

/** The storage key a tool should read and write for the current workspace. */
export function useWorkspaceToolKey(tool: WorkspaceTool): string {
  return toolKey(useActiveWorkspace(), tool);
}
