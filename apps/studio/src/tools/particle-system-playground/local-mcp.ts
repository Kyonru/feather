import type {
  ParticleSystemPlaygroundData,
  ParticleSystemPlaygroundProjectFile,
  ParticleSystemPlaygroundTemplate,
} from '@studio/types/particle-system-playground';
import type { TextureLabAtlasMetadata } from '@studio/types/texture-lab';
import {
  migrateParticleProject,
  normalizeParticleTimeline,
  PARTICLE_PROJECT_TYPE,
  PARTICLE_PROJECT_VERSION,
  reindexParticleSystems,
  removeParticleTimelineTrack,
  reorderParticleTimeline,
  withNormalizedTimeline,
} from './timeline';
import {
  createLocalParticleComposite,
  createLocalParticleSystem,
  loadLocalParticleWorkspace,
  replaceLocalParticleWorkspace,
  updateLocalParticleSystem,
  type LocalParticleParamValue,
} from './use-local-particle-playground';

type JsonRecord = Record<string, unknown>;

export type LocalParticleActionResult = {
  data: ParticleSystemPlaygroundData;
  response: unknown;
};

const TEMPLATES = new Set<ParticleSystemPlaygroundTemplate>([
  'fire',
  'explosion',
  'smoke',
  'sparkles',
  'muzzle-flash',
  'magic-burst',
  'dust-puff',
  'complex-composite',
  'snowfall',
  'rainfall',
  'rain-storm',
  'falling-leaves',
]);

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function finiteInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(1, Math.trunc(number)) : fallback;
}

function template(value: unknown): ParticleSystemPlaygroundTemplate {
  return typeof value === 'string' && TEMPLATES.has(value as ParticleSystemPlaygroundTemplate)
    ? (value as ParticleSystemPlaygroundTemplate)
    : 'fire';
}

function uniqueCompositeName(data: ParticleSystemPlaygroundData, requested: unknown): string {
  const base = typeof requested === 'string' && requested.trim() ? requested.trim().slice(0, 80) : `Particle Effect ${data.composites.length + 1}`;
  if (!data.composites.includes(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!data.composites.includes(candidate)) return candidate;
  }
}

function activeSystemIndex(data: ParticleSystemPlaygroundData, params: JsonRecord): number {
  return finiteInteger(params.systemIndex, data.activeSystem || 1);
}

function updateParams(data: ParticleSystemPlaygroundData, params: JsonRecord): ParticleSystemPlaygroundData {
  if (!data.data) throw new Error('Create or import a particle composite first.');
  const index = activeSystemIndex(data, params);
  let composite = { ...data.data, movement: { ...data.data.movement } };
  const systemParams: Array<[string, LocalParticleParamValue]> = [];

  for (const [key, value] of Object.entries(params)) {
    if (key === 'composite' || key === 'systemIndex') continue;
    if (key === 'compositeX' || key === 'x') composite.x = Number(value);
    else if (key === 'compositeY' || key === 'y') composite.y = Number(value);
    else if (key === 'previewEnabled') composite.previewEnabled = value === true;
    else if (key === 'movement' && value && typeof value === 'object' && !Array.isArray(value)) {
      composite.movement = { ...composite.movement, ...(value as typeof composite.movement) };
    } else if (key.startsWith('movement.')) {
      composite.movement = { ...composite.movement, [key.slice('movement.'.length)]: value };
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      systemParams.push([key, value]);
    }
  }

  for (const [key, value] of systemParams) {
    composite = {
      ...composite,
      systems: composite.systems.map((item) => (item.index === index ? updateLocalParticleSystem(item, key, value) : item)),
    };
  }
  return { ...data, activeSystem: index, data: composite };
}

export function projectForLocalParticleData(data: ParticleSystemPlaygroundData): ParticleSystemPlaygroundProjectFile {
  if (!data.data || !data.activeComposite) throw new Error('Create or import a particle composite first.');
  const { compositeType: _compositeType, timelineState: _timelineState, ...composite } = withNormalizedTimeline(data.data);
  return {
    type: PARTICLE_PROJECT_TYPE,
    version: PARTICLE_PROJECT_VERSION,
    exportedAt: new Date().toISOString(),
    name: data.activeComposite,
    composite,
  };
}

function safeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'particle-effect';
}

function luaString(value: string): string {
  return JSON.stringify(value).replace(/\u2028|\u2029/g, ' ');
}

function luaLiteral(value: unknown, depth = 0): string {
  if (depth > 24) throw new Error('Particle project is too deeply nested to export.');
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (typeof value === 'string') return luaString(value);
  if (Array.isArray(value)) return `{ ${value.map((item) => luaLiteral(item, depth + 1)).join(', ')} }`;
  if (typeof value === 'object') {
    return `{ ${Object.entries(value as JsonRecord)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => `[${luaString(key)}] = ${luaLiteral(item, depth + 1)}`)
      .join(', ')} }`;
  }
  throw new Error(`Cannot export particle value of type ${typeof value}.`);
}

function exportProject(data: ParticleSystemPlaygroundData) {
  const project = projectForLocalParticleData(data);
  const filename = `${safeFilename(project.name)}.featherparticles`;
  return { filename, project, download: { filename, extension: 'featherparticles', content: JSON.stringify(project, null, 2) } };
}

function exportCode(data: ParticleSystemPlaygroundData) {
  const project = projectForLocalParticleData(data);
  const source = [
    '-- Generated by Feather Studio. This is the authored particle definition.',
    '-- Feed the returned table into your project particle factory/runtime.',
    `local effect = ${luaLiteral(project.composite)}`,
    '',
    'return effect',
    '',
  ].join('\n');
  return { filename: `${safeFilename(project.name)}.lua`, clipboard: source, exportCode: source };
}

function exportZipAssets(data: ParticleSystemPlaygroundData) {
  const project = exportProject(data);
  const code = exportCode(data);
  const shaderAssets = (data.data?.systems ?? []).flatMap((system) =>
    system.shaderSource
      ? [{ path: `shaders/${safeFilename(system.shaderFilename || `emitter-${system.index}.glsl`)}`, content: system.shaderSource }]
      : [],
  );
  return {
    zipAssets: [
      { path: project.filename, content: project.download.content },
      { path: code.filename, content: code.exportCode },
      ...shaderAssets,
    ],
  };
}

/** Pure local authoring contract used by the Studio MCP backend and focused tests. */
export function runLocalParticleAction(
  current: ParticleSystemPlaygroundData,
  action: string,
  rawParams: unknown,
): LocalParticleActionResult {
  const params = record(rawParams);
  let data = current;
  let response: unknown = true;

  if (action === 'snapshot') return { data, response: data };
  if (action === 'new-composite') {
    const name = uniqueCompositeName(data, params.name);
    data = {
      type: 'particle-system-playground',
      composites: [...data.composites, name],
      activeComposite: name,
      activeSystem: 1,
      data: createLocalParticleComposite(template(params.template)),
    };
    response = { composite: name };
  } else if (action === 'select-composite') {
    const name = typeof params.composite === 'string' ? params.composite : '';
    if (!data.composites.includes(name)) throw new Error(`Particle composite not found: ${name || '(missing name)'}.`);
    data = { ...data, activeComposite: name, activeSystem: 1 };
  } else if (action === 'select-system') {
    const index = activeSystemIndex(data, params);
    if (!data.data?.systems.some((item) => item.index === index)) throw new Error(`Particle emitter ${index} was not found.`);
    data = { ...data, activeSystem: index };
  } else if (action === 'set-params') {
    data = updateParams(data, record(params.params ?? params));
    response = data;
  } else if (action === 'add-system') {
    if (!data.data) throw new Error('Create or import a particle composite first.');
    const nextIndex = Math.max(0, ...data.data.systems.map((item) => item.index)) + 1;
    const systems = [...data.data.systems, createLocalParticleSystem(nextIndex, `Emitter ${nextIndex}`, template(params.template))];
    data = { ...data, activeSystem: nextIndex, data: withNormalizedTimeline({ ...data.data, systems }) };
    response = { systemIndex: nextIndex };
  } else if (action === 'remove-system') {
    if (!data.data || data.data.systems.length <= 1) throw new Error('A particle composite needs at least one emitter.');
    const index = activeSystemIndex(data, params);
    const timeline = removeParticleTimelineTrack(data.data.timeline, data.data.systems, index);
    const systems = reindexParticleSystems(data.data.systems.filter((item) => item.index !== index));
    if (systems.length === data.data.systems.length) throw new Error(`Particle emitter ${index} was not found.`);
    data = { ...data, activeSystem: Math.min(data.activeSystem, systems.length), data: withNormalizedTimeline({ ...data.data, systems, timeline }) };
  } else if (action === 'reorder-system') {
    if (!data.data) throw new Error('Create or import a particle composite first.');
    const from = finiteInteger(params.fromIndex, 0);
    const to = finiteInteger(params.toIndex, 0);
    const fromPosition = data.data.systems.findIndex((item) => item.index === from);
    const toPosition = data.data.systems.findIndex((item) => item.index === to);
    if (fromPosition < 0 || toPosition < 0) throw new Error('Both particle emitter indexes must exist.');
    const systems = [...data.data.systems];
    const timeline = reorderParticleTimeline(data.data.timeline, data.data.systems, from, to);
    const [moved] = systems.splice(fromPosition, 1);
    systems.splice(toPosition, 0, moved);
    data = { ...data, activeSystem: to, data: withNormalizedTimeline({ ...data.data, systems: reindexParticleSystems(systems), timeline }) };
  } else if (action === 'set-timeline') {
    if (!data.data) throw new Error('Create or import a particle composite first.');
    data = { ...data, data: withNormalizedTimeline({ ...data.data, timeline: normalizeParticleTimeline(params.timeline, data.data.systems) }) };
  } else if (action === 'set-texture') {
    if (!data.data) throw new Error('Create or import a particle composite first.');
    const index = activeSystemIndex(data, params);
    data = {
      ...data,
      activeSystem: index,
      data: {
        ...data.data,
        systems: data.data.systems.map((item) =>
          item.index === index
            ? {
                ...item,
                texturePath: typeof params.texturePath === 'string' ? params.texturePath : '',
                texturePreset: typeof params.texturePreset === 'string' ? params.texturePreset : '',
                textureFilename:
                  typeof params.textureFilename === 'string'
                    ? params.textureFilename
                    : typeof params.filename === 'string'
                      ? params.filename
                      : item.textureFilename,
                textureAtlas:
                  params.textureAtlas && typeof params.textureAtlas === 'object'
                    ? (params.textureAtlas as TextureLabAtlasMetadata)
                    : item.textureAtlas,
                exportReady: true,
              }
            : item,
        ),
      },
    };
  } else if (action === 'set-shader') {
    if (!data.data) throw new Error('Create or import a particle composite first.');
    const index = activeSystemIndex(data, params);
    const source = typeof params.shaderSource === 'string' ? params.shaderSource : typeof params.source === 'string' ? params.source : '';
    data = {
      ...data,
      activeSystem: index,
      data: {
        ...data.data,
        systems: data.data.systems.map((item) =>
          item.index === index
            ? {
                ...item,
                shaderSource: source,
                shaderPath: typeof params.shaderPath === 'string' ? params.shaderPath : '',
                shaderFilename: typeof params.shaderFilename === 'string' ? params.shaderFilename : item.shaderFilename || 'particle.glsl',
                exportReady: true,
              }
            : item,
        ),
      },
    };
  } else if (action === 'import-project') {
    const raw = params.project ?? params.projectRaw;
    let project: ParticleSystemPlaygroundProjectFile;
    try {
      project = (typeof raw === 'string' ? JSON.parse(raw) : raw) as ParticleSystemPlaygroundProjectFile;
    } catch {
      throw new Error('Particle project JSON is invalid.');
    }
    if (project?.type !== PARTICLE_PROJECT_TYPE || !project.composite?.systems?.length) {
      throw new Error('Unsupported particle project file.');
    }
    project = migrateParticleProject(project);
    const name = uniqueCompositeName(data, project.name || 'Imported Particles');
    data = {
      type: 'particle-system-playground',
      composites: [...data.composites, name],
      activeComposite: name,
      activeSystem: 1,
      data: withNormalizedTimeline({ ...project.composite, compositeType: 'scratch' }),
    };
    response = { composite: name };
  } else if (action === 'export-project') {
    response = exportProject(data);
  } else if (action === 'export-code') {
    response = exportCode(data);
  } else if (action === 'export-zip') {
    response = exportZipAssets(data);
  } else if (action === 'delete-composite') {
    if (data.composites.length <= 1) throw new Error('A particle workspace must keep at least one composite.');
    const name = typeof params.composite === 'string' ? params.composite : data.activeComposite;
    const composites = data.composites.filter((item) => item !== name);
    if (composites.length === data.composites.length) throw new Error(`Particle composite not found: ${name}.`);
    data = { ...data, composites, activeComposite: composites[0] ?? null, activeSystem: 1 };
  } else if (['runtime-preview', 'emit', 'emit-all', 'reset', 'reset-all', 'kick-start'].includes(action)) {
    throw new Error(`Particle action ${action} operates on a live game. Pass sessionId to route it through Inspector.`);
  } else {
    throw new Error(`Unknown local Particle Playground MCP action: ${action}`);
  }

  return { data, response };
}

/** Run and persist one action against the active Studio workspace. */
export function runLocalParticleWorkspaceAction(workspaceId: string, action: string, params: unknown): unknown {
  const current = loadLocalParticleWorkspace(workspaceId);
  const result = runLocalParticleAction(current, action, params);
  if (result.data !== current) replaceLocalParticleWorkspace(workspaceId, result.data);
  return result.response;
}
