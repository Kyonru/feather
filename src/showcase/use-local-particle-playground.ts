import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type {
  ParticleTimeline,
  ParticleTimelineState,
  ParticleSystemPlaygroundCompositeData,
  ParticleSystemPlaygroundData,
  ParticleSystemPlaygroundProjectFile,
  ParticleSystemPlaygroundSystem,
  ParticleSystemPlaygroundTemplate,
} from '@/types/particle-system-playground';
import {
  migrateParticleProject,
  normalizeParticleTimeline,
  PARTICLE_PROJECT_TYPE,
  PARTICLE_PROJECT_VERSION,
  normalizeParticleTimelineMode,
  reindexParticleSystems,
  removeParticleTimelineTrack,
  reorderParticleTimeline,
  timelineForTemplate,
  withNormalizedTimeline,
} from '@/pages/particle-system-playground/timeline';
import {
  createParticleHistoryState,
  recordParticleHistory,
  redoParticleHistory,
  restoreParticleSnapshotToData,
  snapshotParticleAuthoring,
  undoParticleHistory,
  type ParticleAuthoringSnapshot,
  type ParticleHistoryState,
} from '@/pages/particle-system-playground/history';
import type { TextureLabAtlasMetadata } from '@/types/texture-lab';

type ParamValue = string | number | boolean;

function downloadProject(project: ParticleSystemPlaygroundProjectFile) {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.name.replace(/[^a-zA-Z0-9._-]+/g, '-') || 'particle-project'}.featherparticles`;
  a.click();
  URL.revokeObjectURL(url);
}

function timelinesEqual(a: ParticleTimeline, b: ParticleTimeline): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function system(index: number, title: string, template: ParticleSystemPlaygroundTemplate): ParticleSystemPlaygroundSystem {
  const texturePreset =
    template === 'smoke' || template === 'dust-puff' || template === 'snowfall' || template === 'rainfall'
      ? 'light'
      : template === 'sparkles' || template === 'magic-burst' || template === 'falling-leaves'
        ? 'star'
        : 'circle';
  return {
    index,
    title,
    blendMode: template === 'sparkles' || template === 'muzzle-flash' || template === 'magic-burst' ? 'add' : 'alpha',
    enabled: true,
    x: 0,
    y: 0,
    kickStartSteps: 0,
    kickStartDt: 1 / 60,
    emitAtStart:
      template === 'explosion'
        ? 160
        : template === 'muzzle-flash'
          ? 90
          : template === 'magic-burst'
            ? 120
            : template === 'dust-puff'
              ? 120
              : 0,
    texturePath: '',
    texturePreset,
    textureFilename: `${texturePreset}.png`,
    shaderPath: '',
    shaderFilename: '',
    shaderSource: '',
    exportReady: true,
    properties: {
      emissionRate:
        template === 'snowfall'
          ? 120
          : template === 'rainfall'
            ? 260
            : template === 'falling-leaves'
              ? 32
        : template === 'smoke'
          ? 45
          : template === 'sparkles'
            ? 70
            : template === 'muzzle-flash'
              ? 900
              : template === 'dust-puff'
                ? 80
                : 100,
      emitterLifetime: -1,
      particleLifetimeMin:
        template === 'snowfall'
          ? 4
          : template === 'rainfall'
            ? 0.65
            : template === 'falling-leaves'
              ? 5
        : template === 'smoke' || template === 'dust-puff' ? 1.2 : template === 'muzzle-flash' ? 0.08 : 0.35,
      particleLifetimeMax:
        template === 'snowfall'
          ? 7
          : template === 'rainfall'
            ? 1.2
            : template === 'falling-leaves'
              ? 9
        : template === 'smoke' || template === 'dust-puff' ? 3.2 : template === 'sparkles' ? 0.9 : template === 'muzzle-flash' ? 0.22 : 1.3,
      direction: template === 'muzzle-flash' ? 0 : template === 'snowfall' || template === 'rainfall' || template === 'falling-leaves' ? Math.PI / 2 : -Math.PI / 2,
      spread:
        template === 'snowfall'
          ? Math.PI / 6
          : template === 'rainfall'
            ? Math.PI / 18
            : template === 'falling-leaves'
              ? Math.PI / 3
        : template === 'sparkles' || template === 'magic-burst' || template === 'dust-puff' ? Math.PI * 2 : template === 'muzzle-flash' ? Math.PI / 8 : Math.PI / 3,
      speedMin:
        template === 'snowfall'
          ? 18
          : template === 'rainfall'
            ? 360
            : template === 'falling-leaves'
              ? 18
        : template === 'smoke' || template === 'dust-puff'
          ? 12
          : template === 'sparkles'
            ? 80
            : template === 'muzzle-flash'
              ? 260
              : 40,
      speedMax:
        template === 'snowfall'
          ? 55
          : template === 'rainfall'
            ? 620
            : template === 'falling-leaves'
              ? 72
        : template === 'smoke' || template === 'dust-puff'
          ? 45
          : template === 'sparkles'
            ? 220
            : template === 'muzzle-flash'
              ? 680
              : 140,
      linearAccelXMin: template === 'falling-leaves' ? -16 : template === 'snowfall' ? -6 : template === 'smoke' || template === 'dust-puff' ? -8 : 0,
      linearAccelYMin: template === 'falling-leaves' ? 8 : template === 'snowfall' ? 10 : template === 'smoke' || template === 'dust-puff' ? -18 : 0,
      linearAccelXMax: template === 'falling-leaves' ? 16 : template === 'snowfall' ? 6 : template === 'smoke' || template === 'dust-puff' ? 8 : 0,
      linearAccelYMax: template === 'falling-leaves' ? 26 : template === 'snowfall' ? 22 : template === 'smoke' || template === 'dust-puff' ? -55 : 0,
      radialAccelMin: 0,
      radialAccelMax: 0,
      tangentialAccelMin: 0,
      tangentialAccelMax: 0,
      linearDampingMin: template === 'falling-leaves' ? 0.4 : template === 'sparkles' ? 1.5 : 0,
      linearDampingMax: template === 'falling-leaves' ? 1.2 : template === 'sparkles' ? 3 : 0,
      sizes:
        template === 'snowfall'
          ? '0.12, 0.16'
          : template === 'rainfall'
            ? '0.06, 0.18'
            : template === 'falling-leaves'
              ? '0.24, 0.32, 0.2'
        : template === 'smoke' || template === 'dust-puff'
          ? '0.35, 1.2, 2.2'
          : template === 'sparkles' || template === 'magic-burst'
            ? '0.45, 0.1'
            : template === 'muzzle-flash'
              ? '0.6, 1.15, 0'
              : '1, 0',
      sizeVariation: template === 'snowfall' || template === 'falling-leaves' ? 0.7 : template === 'smoke' || template === 'dust-puff' ? 0.6 : template === 'sparkles' || template === 'magic-burst' ? 0.8 : 0,
      rotationMin: 0,
      rotationMax: 0,
      relativeRotation: false,
      spinMin: 0,
      spinMax: template === 'falling-leaves' ? 1.2 : 0,
      spinVariation: 0,
      offsetX: 0,
      offsetY: 0,
      insertMode: 'top',
      colors:
        template === 'snowfall'
          ? '1, 1, 1, 0.82, 0.8, 0.92, 1, 0.45'
          : template === 'rainfall'
            ? '0.55, 0.78, 1, 0.55, 0.3, 0.5, 0.95, 0.15'
            : template === 'falling-leaves'
              ? '0.95, 0.55, 0.16, 0.85, 0.45, 0.22, 0.06, 0.25'
        : template === 'smoke'
          ? '0.35, 0.35, 0.38, 0.45, 0.15, 0.15, 0.17, 0'
          : template === 'dust-puff'
            ? '0.7, 0.62, 0.48, 0.55, 0.45, 0.38, 0.28, 0'
            : template === 'muzzle-flash'
              ? '1, 0.96, 0.45, 1, 1, 0.35, 0.05, 0'
              : template === 'magic-burst'
                ? '0.75, 0.35, 1, 1, 0.2, 0.85, 1, 0'
          : template === 'sparkles'
            ? '1, 0.95, 0.55, 1, 0.35, 0.75, 1, 0'
            : '1, 0.5, 0.1, 1, 1, 0.1, 0, 0',
      emissionAreaDist: template === 'snowfall' || template === 'rainfall' || template === 'falling-leaves' ? 'uniform' : 'none',
      emissionAreaDx: template === 'snowfall' || template === 'rainfall' || template === 'falling-leaves' ? 520 : 0,
      emissionAreaDy: template === 'snowfall' || template === 'rainfall' || template === 'falling-leaves' ? 16 : 0,
      emissionAreaAngle: 0,
      emissionAreaRelative: false,
      count: 100,
      bufferSize: 1000,
    },
  };
}

function customizeSystem(
  base: ParticleSystemPlaygroundSystem,
  overrides: Partial<Omit<ParticleSystemPlaygroundSystem, 'properties'>> & {
    properties?: Partial<ParticleSystemPlaygroundSystem['properties']>;
  },
): ParticleSystemPlaygroundSystem {
  return {
    ...base,
    ...overrides,
    properties: {
      ...base.properties,
      ...(overrides.properties ?? {}),
    },
  };
}

function composite(template: ParticleSystemPlaygroundTemplate): ParticleSystemPlaygroundCompositeData {
  const systems =
    template === 'explosion'
      ? [system(1, 'Core Blast', 'explosion'), system(2, 'Smoke Bloom', 'smoke'), system(3, 'Sparks', 'sparkles')]
      : template === 'snowfall'
        ? [system(1, 'Snow Field', 'snowfall')]
        : template === 'rainfall'
          ? [system(1, 'Rain Sheet', 'rainfall')]
          : template === 'falling-leaves'
            ? [system(1, 'Leaf Drift', 'falling-leaves')]
      : template === 'muzzle-flash'
        ? [system(1, 'Flash Cone', 'muzzle-flash'), system(2, 'Barrel Sparks', 'sparkles')]
        : template === 'magic-burst'
          ? [system(1, 'Core Pulse', 'magic-burst'), system(2, 'Swirl', 'sparkles'), system(3, 'Glitter Trail', 'sparkles')]
          : template === 'complex-composite'
            ? [
                customizeSystem(system(1, 'Core Pulse', 'magic-burst'), {
                  emitAtStart: 140,
                  properties: { emissionRate: 720, sizes: '0.35, 1.8, 0.3' },
                }),
                customizeSystem(system(2, 'Shock Ring', 'sparkles'), {
                  emitAtStart: 90,
                  properties: { speedMin: 160, speedMax: 360, sizes: '0.18, 1.4, 0', spread: Math.PI * 2 },
                }),
                customizeSystem(system(3, 'Smoke Bloom', 'smoke'), {
                  emitAtStart: 110,
                  y: -8,
                  properties: { emissionRate: 95, speedMin: 18, speedMax: 90, sizes: '0.45, 1.8, 2.6' },
                }),
                customizeSystem(system(4, 'Spark Trails', 'sparkles'), {
                  emitAtStart: 180,
                  y: -10,
                  properties: { emissionRate: 520, speedMin: 120, speedMax: 300, direction: -0.9, spread: 4.6 },
                }),
                customizeSystem(system(5, 'Dust Wake', 'dust-puff'), {
                  emitAtStart: 100,
                  y: 18,
                  properties: { emissionRate: 70, speedMin: 20, speedMax: 70, sizes: '0.3, 1.2, 2' },
                }),
              ]
            : [system(1, template === 'smoke' ? 'Smoke' : template === 'sparkles' ? 'Sparkles' : 'Flame', template)];
  const data: ParticleSystemPlaygroundCompositeData = {
    compositeType: 'scratch',
    x: 400,
    y: 300,
    previewEnabled: true,
    movement: { pattern: 'none', radius: 80, radiusX: 120, radiusY: 60, speed: 1, scale: 1 },
    systems,
  };
  return withNormalizedTimeline({ ...data, timeline: timelineForTemplate(template, systems) }, template);
}

function updateSystemDraft(systemDraft: ParticleSystemPlaygroundSystem, key: string, value: ParamValue): ParticleSystemPlaygroundSystem {
  if (key === 'title') return { ...systemDraft, title: String(value) };
  if (key === 'blendMode') return { ...systemDraft, blendMode: String(value) };
  if (key === 'enabled') return { ...systemDraft, enabled: value === true };
  if (key === 'emitterOffsetX') return { ...systemDraft, x: Number(value) };
  if (key === 'emitterOffsetY') return { ...systemDraft, y: Number(value) };
  if (key === 'kickStartSteps') return { ...systemDraft, kickStartSteps: Number(value) };
  if (key === 'kickStartDt') return { ...systemDraft, kickStartDt: Number(value) };
  if (key === 'emitAtStart') return { ...systemDraft, emitAtStart: Number(value) };
  if (key === 'shaderSource') return { ...systemDraft, shaderSource: String(value), shaderFilename: 'showcase-shader.glsl' };
  return { ...systemDraft, properties: { ...systemDraft.properties, [key]: value } };
}

export function useLocalParticlePlayground() {
  const [data, setData] = useState<ParticleSystemPlaygroundData>({
    type: 'particle-system-playground',
    composites: ['Showcase Fire'],
    activeComposite: 'Showcase Fire',
    activeSystem: 1,
    data: composite('fire'),
  });
  const [historyState, setHistoryState] = useState<ParticleHistoryState>(() => createParticleHistoryState());
  const historyStateRef = useRef<ParticleHistoryState>(historyState);
  const historyScope = useRef<string | null>('Showcase Fire');
  const dataRef = useRef<ParticleSystemPlaygroundData>(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    historyStateRef.current = historyState;
  }, [historyState]);

  function clearHistory() {
    const empty = createParticleHistoryState();
    historyStateRef.current = empty;
    setHistoryState(empty);
  }

  useEffect(() => {
    const nextScope = data.activeComposite;
    if (historyScope.current === nextScope) return;
    historyScope.current = nextScope;
    clearHistory();
  }, [data.activeComposite]);

  const currentHistorySnapshot = useCallback(() => snapshotParticleAuthoring(dataRef.current), []);

  function recordSnapshot(snapshot: ParticleAuthoringSnapshot | null, groupKey: string, coalesce = false) {
    if (!snapshot) return;
    setHistoryState((current) => {
      const next = recordParticleHistory(current, snapshot, { groupKey, coalesce });
      historyStateRef.current = next;
      return next;
    });
  }

  function recordHistory(groupKey: string, coalesce = false) {
    recordSnapshot(currentHistorySnapshot(), groupKey, coalesce);
  }

  function setDataAndRef(updater: (current: ParticleSystemPlaygroundData) => ParticleSystemPlaygroundData) {
    setData((current) => {
      const next = updater(current);
      dataRef.current = next;
      return next;
    });
  }

  function restoreSnapshot(snapshot: ParticleAuthoringSnapshot) {
    dataRef.current = restoreParticleSnapshotToData(dataRef.current, snapshot) ?? dataRef.current;
    setData((current) => restoreParticleSnapshotToData(current, snapshot) ?? current);
  }

  function undo() {
    const result = undoParticleHistory(historyStateRef.current, currentHistorySnapshot());
    historyStateRef.current = result.state;
    setHistoryState(result.state);
    if (result.snapshot) restoreSnapshot(result.snapshot);
  }

  function redo() {
    const result = redoParticleHistory(historyStateRef.current, currentHistorySnapshot());
    historyStateRef.current = result.state;
    setHistoryState(result.state);
    if (result.snapshot) restoreSnapshot(result.snapshot);
  }

  const activeSystem = useMemo(
    () => data.data?.systems.find((item) => item.index === data.activeSystem) ?? null,
    [data.activeSystem, data.data?.systems],
  );

  function updateActiveParam(key: string, value: ParamValue) {
    recordHistory(`system:${data.activeSystem}:${key}`, true);
    setData((current) => {
      if (!current.data) return current;
      return {
        ...current,
        data: {
          ...current.data,
          systems: current.data.systems.map((item) =>
            item.index === current.activeSystem ? updateSystemDraft(item, key, value) : item,
          ),
        },
      };
    });
  }

  function updateSystemParam(systemIndex: number, key: string, value: ParamValue) {
    recordHistory(`system:${systemIndex}:${key}`, true);
    setData((current) => {
      if (!current.data) return current;
      return {
        ...current,
        data: {
          ...current.data,
          systems: current.data.systems.map((item) =>
            item.index === systemIndex ? updateSystemDraft(item, key, value) : item,
          ),
        },
      };
    });
  }

  function updateParam(key: string, value: ParamValue) {
    recordHistory(`composite:${key}`, true);
    setData((current) => {
      if (!current.data) return current;
      if (key === 'compositeX') return { ...current, data: { ...current.data, x: Number(value) } };
      if (key === 'compositeY') return { ...current, data: { ...current.data, y: Number(value) } };
      if (key === 'previewEnabled') return { ...current, data: { ...current.data, previewEnabled: value === true } };
      if (key.startsWith('movement.')) {
        return {
          ...current,
          data: {
            ...current.data,
            movement: { ...current.data.movement, [key.slice('movement.'.length)]: value },
          },
        };
      }
      return current;
    });
  }

  function updateTimeline(timeline: ParticleTimeline) {
    const currentComposite = dataRef.current.data;
    if (!currentComposite) return;
    const nextTimeline = normalizeParticleTimeline(timeline, currentComposite.systems);
    const currentTimeline = normalizeParticleTimeline(currentComposite.timeline, currentComposite.systems);
    if (timelinesEqual(nextTimeline, currentTimeline)) return;
    recordHistory('timeline', false);
    setDataAndRef((current) => {
      if (!current.data) return current;
      return { ...current, data: withNormalizedTimeline({ ...current.data, timeline: nextTimeline }) };
    });
  }

  function setTimelineState(state: Partial<ParticleTimelineState>) {
    setData((current) => {
      if (!current.data) return current;
      const previous = current.data.timelineState ?? { time: 0, playing: false, scrubVersion: 0 };
      return {
        ...current,
        data: {
          ...current.data,
          timelineState: {
            ...previous,
            ...state,
            scrubVersion: state.time !== undefined ? (previous.scrubVersion ?? 0) + 1 : previous.scrubVersion,
          },
        },
      };
    });
  }

  function createComposite(name?: string, template: ParticleSystemPlaygroundTemplate = 'fire') {
    const nextName = name?.trim() || `Showcase ${data.composites.length + 1}`;
    clearHistory();
    setData({
      type: 'particle-system-playground',
      composites: [...data.composites, nextName],
      activeComposite: nextName,
      activeSystem: 1,
      data: composite(template),
    });
  }

  return {
    plugin: { id: 'particle-system-playground', disabled: false, incompatible: false },
    available: true,
    enabled: true,
    runtimeSuspended: false,
    data,
    composites: data.composites,
    activeComposite: data.activeComposite,
    activeSystemIndex: data.activeSystem,
    composite: data.data,
    activeSystem,
    shaderError: '',
    canUndo: historyState.undoStack.length > 0,
    canRedo: historyState.redoStack.length > 0,
    historyUnavailableReason: undefined,
    undo,
    redo,
    updateActiveParam,
    updateSystemParam,
    updateParam,
    sendAction: () => Promise.resolve(),
    setRuntimePreviewActive: () => Promise.resolve(),
    refreshAfterAction: () => undefined,
    selectComposite: (name: string) => {
      clearHistory();
      setData((current) => ({ ...current, activeComposite: name }));
    },
    selectSystem: (index: number) => setData((current) => ({ ...current, activeSystem: index })),
    createComposite,
    deleteComposite: () => toast.info('The showcase keeps one demo composite available.'),
    addSystem: () => {
      recordHistory('systems:add', false);
      setData((current) => {
        if (!current.data) return current;
        const nextIndex = Math.max(0, ...current.data.systems.map((item) => item.index)) + 1;
        const systems = [...current.data.systems, system(nextIndex, `Emitter ${nextIndex}`, 'sparkles')];
        return {
          ...current,
          activeSystem: nextIndex,
          data: withNormalizedTimeline({ ...current.data, systems }),
        };
      });
    },
    removeSystem: (systemIndex: number) => {
      recordHistory(`systems:remove:${systemIndex}`, false);
      setData((current) => {
        if (!current.data || current.data.systems.length <= 1) return current;
        const timeline = removeParticleTimelineTrack(current.data.timeline, current.data.systems, systemIndex);
        const systems = reindexParticleSystems(current.data.systems.filter((item) => item.index !== systemIndex));
        const activeSystem =
          current.activeSystem === systemIndex
            ? Math.min(systemIndex, systems.length)
            : current.activeSystem > systemIndex
              ? current.activeSystem - 1
              : current.activeSystem;
        return {
          ...current,
          activeSystem,
          data: withNormalizedTimeline({ ...current.data, systems, timeline }),
        };
      });
    },
    reorderSystem: (fromIndex: number, toIndex: number) => {
      recordHistory(`systems:reorder:${fromIndex}:${toIndex}`, false);
      setData((current) => {
        if (!current.data) return current;
        const systems = [...current.data.systems];
        const fromPos = systems.findIndex((s) => s.index === fromIndex);
        const toPos = systems.findIndex((s) => s.index === toIndex);
        if (fromPos === -1 || toPos === -1 || fromPos === toPos) return current;
        const timeline = reorderParticleTimeline(current.data.timeline, current.data.systems, fromIndex, toIndex);
        const [moved] = systems.splice(fromPos, 1);
        systems.splice(toPos, 0, moved);
        return {
          ...current,
          activeSystem: toIndex,
          data: withNormalizedTimeline({ ...current.data, systems: reindexParticleSystems(systems), timeline }),
        };
      });
    },
    updateTimeline,
    playTimeline: () => {
      const timeline = data.data ? normalizeParticleTimeline(data.data.timeline, data.data.systems) : null;
      const time = data.data?.timelineState?.time ?? 0;
      const restart = !!timeline && normalizeParticleTimelineMode(timeline.mode, timeline.loop ? 'loop' : 'one-shot') === 'one-shot' && time >= timeline.duration - 0.001;
      setTimelineState({ ...(restart ? { time: 0 } : {}), playing: true });
    },
    pauseTimeline: (time?: number) =>
      setTimelineState({
        ...(typeof time === 'number' && Number.isFinite(time) ? { time } : {}),
        playing: false,
      }),
    stopTimeline: () => setTimelineState({ time: 0, playing: false }),
    seekTimeline: (time: number) => setTimelineState({ time, playing: false }),
    emit: () => toast.success('Emit sent to the showcase preview'),
    reset: () => toast.success('Preview reset'),
    kickStart: () => toast.success('Kick start sent to the showcase preview'),
    setTexturePreset: (preset: string) => {
      recordHistory(`system:${data.activeSystem}:texture`, false);
      setData((current) => {
        if (!current.data) return current;
        return {
          ...current,
          data: {
            ...current.data,
            systems: current.data.systems.map((item) =>
              item.index === current.activeSystem
                ? { ...item, texturePreset: preset, texturePath: '', textureFilename: `${preset}.png`, textureAtlas: undefined, exportReady: true }
                : item,
            ),
          },
        };
      });
    },
    setTexturePath: (texturePath: string) => {
      recordHistory(`system:${data.activeSystem}:texture`, false);
      setData((current) => {
        if (!current.data) return current;
        return {
          ...current,
          data: {
            ...current.data,
            systems: current.data.systems.map((item) =>
              item.index === current.activeSystem
                ? {
                    ...item,
                    texturePath,
                    texturePreset: '',
                    textureFilename: texturePath.split(/[\\/]/).pop() || 'texture.png',
                    textureAtlas: undefined,
                    exportReady: true,
                  }
                : item,
            ),
          },
        };
      });
    },
    setTextureFromUpload: (filename: string, _dataBase64?: string, textureAtlas?: TextureLabAtlasMetadata) => {
      recordHistory(`system:${data.activeSystem}:texture`, false);
      setData((current) => {
        if (!current.data) return current;
        return {
          ...current,
          data: {
            ...current.data,
            systems: current.data.systems.map((item) =>
              item.index === current.activeSystem
                ? {
                    ...item,
                    texturePath: '',
                    texturePreset: '',
                    textureFilename: filename,
                    textureAtlas,
                    exportReady: true,
                  }
                : item,
            ),
          },
        };
      });
      toast.success(`Texture loaded for preview: ${filename}`);
      return Promise.resolve();
    },
    setShader: (params: Record<string, unknown>) => {
      recordHistory(`system:${data.activeSystem}:shader`, false);
      if (typeof params.shaderSource === 'string') {
        setData((current) => {
          if (!current.data) return current;
          return {
            ...current,
            data: {
              ...current.data,
              systems: current.data.systems.map((item) =>
                item.index === current.activeSystem ? updateSystemDraft(item, 'shaderSource', String(params.shaderSource)) : item,
              ),
            },
          };
        });
      }
      toast.success('Shader applied to showcase preview');
    },
    exportCode: () => {
      navigator.clipboard.writeText(JSON.stringify(data.data, null, 2)).catch(() => {});
      toast.success('Copied showcase particle data');
    },
    exportZip: () => toast.info('ZIP export is available in the Feather desktop app.'),
    saveProject: () => {
      if (!data.data || !data.activeComposite) return;
      const compositeData = { ...withNormalizedTimeline(data.data) };
      delete compositeData.timelineState;
      downloadProject({
        type: PARTICLE_PROJECT_TYPE,
        version: PARTICLE_PROJECT_VERSION,
        exportedAt: new Date().toISOString(),
        name: data.activeComposite,
        composite: compositeData,
      });
      toast.success('Particle project saved');
    },
    importProject: (raw: string) => {
      let project: ParticleSystemPlaygroundProjectFile;
      try {
        project = JSON.parse(raw) as ParticleSystemPlaygroundProjectFile;
      } catch {
        toast.error('Particle project JSON is invalid');
        return;
      }
      if (
        project.type !== PARTICLE_PROJECT_TYPE ||
        (project.version !== 1 && project.version !== 2 && project.version !== 3) ||
        !project.composite?.systems?.length
      ) {
        toast.error('Unsupported particle project file');
        return;
      }
      project = migrateParticleProject(project);
      const nextName = project.name && !data.composites.includes(project.name)
        ? project.name
        : `${project.name || 'Imported Particles'} ${data.composites.length + 1}`;
      clearHistory();
      setData({
        type: 'particle-system-playground',
        composites: [...data.composites, nextName],
        activeComposite: nextName,
        activeSystem: 1,
        data: withNormalizedTimeline({ ...project.composite, compositeType: 'scratch' }),
      });
      toast.success('Particle project imported');
    },
  };
}
