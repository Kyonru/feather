import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Studio's shell state.
 *
 * Which tool you had open is something you chose and would be mildly annoyed to
 * choose again, which is the test skills/feather-desktop-app/references/design-rules.md **C1** settled on for what belongs
 * in storage. Global rather than per session, for the same reason Inspector's
 * panel state is: what you are working on outlives any particular game, and in
 * Studio there is usually no game at all.
 *
 * Deliberately not here: anything transient. A dialog being open, a drag in
 * progress. Restoring those reopens the app into a state nobody left it in.
 */

export const STUDIO_TOOLS = ['shader-graph', 'particle-playground', 'texture-lab'] as const;

export type StudioToolId = (typeof STUDIO_TOOLS)[number];

function isStudioTool(value: unknown): value is StudioToolId {
  return typeof value === 'string' && (STUDIO_TOOLS as readonly string[]).includes(value);
}

type StudioUiStore = {
  activeTool: StudioToolId;
  setActiveTool: (tool: StudioToolId) => void;
};

export const useStudioUiStore = create<StudioUiStore>()(
  persist(
    (set) => ({
      activeTool: 'shader-graph',
      setActiveTool: (activeTool) => set({ activeTool }),
    }),
    {
      name: 'feather-studio-ui',
      version: 1,
      merge: (persisted, current) => {
        const saved = persisted as Partial<StudioUiStore> | undefined;
        return {
          ...current,
          ...saved,
          // A tool id written by an older build — or a renamed one — must not
          // leave the shell with nothing to render. Adding a field to a
          // persisted store is a migration whether or not anyone calls it one.
          activeTool: isStudioTool(saved?.activeTool) ? saved.activeTool : current.activeTool,
        };
      },
    },
  ),
);
