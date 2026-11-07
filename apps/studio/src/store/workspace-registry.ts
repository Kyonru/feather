/**
 * The pure half of Studio's durable named workspaces
 * (skills/feather-desktop-app/references/design-rules.md, W6).
 *
 * A workspace is "the thing I am working on": a name and an id. Each tool
 * already persists its own state per id — Shader Graph's `workspaces`, Texture
 * Lab's `textureLabWorkspaces`, Particles' local workspace map — and until now
 * nothing owned which id was current. This module decides that, without any
 * store, so the migration and the coercion can be tested on their own
 * (`scripts/tests/studioWorkspaces.test.ts`).
 */

export type WorkspaceTool = 'shaderGraph' | 'textureLab' | 'particles';

export type StudioWorkspace = {
  id: string;
  name: string;
  createdAt: number;
  /**
   * Per-tool storage keys, present only on a workspace adopted from storage
   * written before workspaces existed. Absent means "use the workspace id".
   * A fallback at the point of use, because adding a persisted field is a
   * migration (CONTRIBUTING.md, engineering lessons).
   */
  toolKeys?: Partial<Record<WorkspaceTool, string>>;
};

export type WorkspaceRegistry = {
  activeId: string;
  workspaces: StudioWorkspace[];
};

export const FIRST_WORKSPACE_ID = 'default';
export const FIRST_WORKSPACE_NAME = 'My workspace';
export const WORKSPACE_NAME_MAX = 48;
const TOOLS: readonly WorkspaceTool[] = ['shaderGraph', 'textureLab', 'particles'];

/** The storage key a tool should use for a workspace. */
export function toolKey(workspace: StudioWorkspace | null | undefined, tool: WorkspaceTool): string {
  return workspace?.toolKeys?.[tool] ?? workspace?.id ?? FIRST_WORKSPACE_ID;
}

export function normalizeWorkspaceName(name: unknown, fallback = 'Untitled'): string {
  const text = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, WORKSPACE_NAME_MAX) : '';
  return text || fallback;
}

/** Ids end up in storage keys and test ids; keep them to a boring alphabet. */
function cleanId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return id && id.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(id) ? id : null;
}

/**
 * What existing users already have, before workspaces existed.
 *
 * Each tool's current id at the moment of the first launch with workspaces:
 * Shader Graph's active workspace, Texture Lab's active workspace (which a
 * migration from Inspector may have set to a session id), and the particle key
 * the tool used to hard-code. The first workspace points at all three, so it
 * opens onto the user's work instead of an empty one.
 */
export type LegacyToolState = {
  shaderGraphId?: unknown;
  textureLabId?: unknown;
  /** Keys present in the particle workspace map. */
  particleIds?: readonly string[];
};

/** The particle key every Studio build before workspaces wrote to. */
export const LEGACY_PARTICLE_KEY = 'studio-local';

export function adoptLegacyWorkspace(legacy: LegacyToolState, now: number): StudioWorkspace {
  const toolKeys: Partial<Record<WorkspaceTool, string>> = {};
  const shader = cleanId(legacy.shaderGraphId);
  const texture = cleanId(legacy.textureLabId);
  if (shader && shader !== FIRST_WORKSPACE_ID) toolKeys.shaderGraph = shader;
  if (texture && texture !== FIRST_WORKSPACE_ID) toolKeys.textureLab = texture;
  if (legacy.particleIds?.includes(LEGACY_PARTICLE_KEY)) toolKeys.particles = LEGACY_PARTICLE_KEY;
  return {
    id: FIRST_WORKSPACE_ID,
    name: FIRST_WORKSPACE_NAME,
    createdAt: now,
    ...(Object.keys(toolKeys).length > 0 ? { toolKeys } : {}),
  };
}

/**
 * Coerce a persisted registry into a usable one. Never throws, never returns an
 * empty list: a registry with no workspace would leave every tool without a key.
 */
export function normalizeWorkspaceRegistry(raw: unknown, fallback: () => StudioWorkspace): WorkspaceRegistry {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const workspaces: StudioWorkspace[] = [];
  for (const entry of Array.isArray(source.workspaces) ? source.workspaces : []) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Record<string, unknown>;
    const id = cleanId(record.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const keys = record.toolKeys && typeof record.toolKeys === 'object' ? (record.toolKeys as Record<string, unknown>) : {};
    const toolKeys: Partial<Record<WorkspaceTool, string>> = {};
    for (const tool of TOOLS) {
      const key = cleanId(keys[tool]);
      if (key) toolKeys[tool] = key;
    }
    const createdAt = Number(record.createdAt);
    workspaces.push({
      id,
      name: normalizeWorkspaceName(record.name),
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      ...(Object.keys(toolKeys).length > 0 ? { toolKeys } : {}),
    });
  }
  if (workspaces.length === 0) workspaces.push(fallback());
  const activeId = cleanId(source.activeId);
  return {
    workspaces,
    activeId: activeId && workspaces.some((workspace) => workspace.id === activeId) ? activeId : workspaces[0].id,
  };
}

/** "Workspace 2", "Workspace 3", … — the first number not already used. */
export function nextWorkspaceName(existing: readonly StudioWorkspace[]): string {
  const names = new Set(existing.map((workspace) => workspace.name.toLowerCase()));
  for (let n = existing.length + 1; ; n += 1) {
    const name = `Workspace ${n}`;
    if (!names.has(name.toLowerCase())) return name;
  }
}

/** Every storage key a workspace owns, so deleting it removes its work and only its work. */
export function workspaceKeys(workspace: StudioWorkspace): Record<WorkspaceTool, string> {
  return {
    shaderGraph: toolKey(workspace, 'shaderGraph'),
    textureLab: toolKey(workspace, 'textureLab'),
    particles: toolKey(workspace, 'particles'),
  };
}
