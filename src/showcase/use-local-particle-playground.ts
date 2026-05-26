import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type {
  ParticleSystemPlaygroundCompositeData,
  ParticleSystemPlaygroundData,
  ParticleSystemPlaygroundProjectFile,
  ParticleSystemPlaygroundSystem,
  ParticleSystemPlaygroundTemplate,
} from '@/types/particle-system-playground';

type ParamValue = string | number | boolean;
const PROJECT_TYPE = 'feather.particle-system-playground';

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

function system(index: number, title: string, template: ParticleSystemPlaygroundTemplate): ParticleSystemPlaygroundSystem {
  const texturePreset = template === 'smoke' ? 'light' : template === 'sparkles' ? 'star' : 'circle';
  return {
    index,
    title,
    blendMode: template === 'sparkles' ? 'add' : 'alpha',
    enabled: true,
    x: 0,
    y: 0,
    kickStartSteps: 0,
    kickStartDt: 1 / 60,
    emitAtStart: template === 'explosion' ? 160 : 0,
    texturePath: '',
    texturePreset,
    textureFilename: `${texturePreset}.png`,
    shaderPath: '',
    shaderFilename: '',
    shaderSource: '',
    exportReady: true,
    properties: {
      emissionRate: template === 'smoke' ? 45 : template === 'sparkles' ? 70 : 100,
      emitterLifetime: -1,
      particleLifetimeMin: template === 'smoke' ? 1.2 : 0.35,
      particleLifetimeMax: template === 'smoke' ? 3.2 : template === 'sparkles' ? 0.9 : 1.3,
      direction: -Math.PI / 2,
      spread: template === 'sparkles' ? Math.PI * 2 : Math.PI / 3,
      speedMin: template === 'smoke' ? 12 : template === 'sparkles' ? 80 : 40,
      speedMax: template === 'smoke' ? 45 : template === 'sparkles' ? 220 : 140,
      linearAccelXMin: template === 'smoke' ? -8 : 0,
      linearAccelYMin: template === 'smoke' ? -18 : 0,
      linearAccelXMax: template === 'smoke' ? 8 : 0,
      linearAccelYMax: template === 'smoke' ? -55 : 0,
      radialAccelMin: 0,
      radialAccelMax: 0,
      tangentialAccelMin: 0,
      tangentialAccelMax: 0,
      linearDampingMin: template === 'sparkles' ? 1.5 : 0,
      linearDampingMax: template === 'sparkles' ? 3 : 0,
      sizes: template === 'smoke' ? '0.35, 1.2, 2.2' : template === 'sparkles' ? '0.45, 0.1' : '1, 0',
      sizeVariation: template === 'smoke' ? 0.6 : template === 'sparkles' ? 0.8 : 0,
      rotationMin: 0,
      rotationMax: 0,
      relativeRotation: false,
      spinMin: 0,
      spinMax: 0,
      spinVariation: 0,
      offsetX: 0,
      offsetY: 0,
      insertMode: 'top',
      colors:
        template === 'smoke'
          ? '0.35, 0.35, 0.38, 0.45, 0.15, 0.15, 0.17, 0'
          : template === 'sparkles'
            ? '1, 0.95, 0.55, 1, 0.35, 0.75, 1, 0'
            : '1, 0.5, 0.1, 1, 1, 0.1, 0, 0',
      emissionAreaDist: 'none',
      emissionAreaDx: 0,
      emissionAreaDy: 0,
      emissionAreaAngle: 0,
      emissionAreaRelative: false,
      count: 100,
      bufferSize: 1000,
    },
  };
}

function composite(template: ParticleSystemPlaygroundTemplate): ParticleSystemPlaygroundCompositeData {
  const systems =
    template === 'explosion'
      ? [system(1, 'Core Blast', 'explosion'), system(2, 'Smoke Bloom', 'smoke'), system(3, 'Sparks', 'sparkles')]
      : [system(1, template === 'smoke' ? 'Smoke' : template === 'sparkles' ? 'Sparkles' : 'Flame', template)];
  return {
    compositeType: 'scratch',
    x: 400,
    y: 300,
    previewEnabled: true,
    movement: { pattern: 'none', radius: 80, radiusX: 120, radiusY: 60, speed: 1, scale: 1 },
    systems,
  };
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

  const activeSystem = useMemo(
    () => data.data?.systems.find((item) => item.index === data.activeSystem) ?? null,
    [data.activeSystem, data.data?.systems],
  );

  function updateActiveParam(key: string, value: ParamValue) {
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

  function updateParam(key: string, value: ParamValue) {
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

  function createComposite(name?: string, template: ParticleSystemPlaygroundTemplate = 'fire') {
    const nextName = name?.trim() || `Showcase ${data.composites.length + 1}`;
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
    data,
    composites: data.composites,
    activeComposite: data.activeComposite,
    activeSystemIndex: data.activeSystem,
    composite: data.data,
    activeSystem,
    shaderError: '',
    updateActiveParam,
    updateParam,
    sendAction: () => Promise.resolve(),
    refreshAfterAction: () => undefined,
    selectComposite: (name: string) => setData((current) => ({ ...current, activeComposite: name })),
    selectSystem: (index: number) => setData((current) => ({ ...current, activeSystem: index })),
    createComposite,
    deleteComposite: () => toast.info('The showcase keeps one demo composite available.'),
    addSystem: () =>
      setData((current) => {
        if (!current.data) return current;
        const nextIndex = Math.max(0, ...current.data.systems.map((item) => item.index)) + 1;
        return {
          ...current,
          activeSystem: nextIndex,
          data: { ...current.data, systems: [...current.data.systems, system(nextIndex, `Emitter ${nextIndex}`, 'sparkles')] },
        };
      }),
    removeSystem: (systemIndex: number) =>
      setData((current) => {
        if (!current.data || current.data.systems.length <= 1) return current;
        const systems = current.data.systems.filter((item) => item.index !== systemIndex);
        return { ...current, activeSystem: systems[0]?.index ?? 1, data: { ...current.data, systems } };
      }),
    reorderSystem: (fromIndex: number, toIndex: number) =>
      setData((current) => {
        if (!current.data) return current;
        const systems = [...current.data.systems];
        const fromPos = systems.findIndex((s) => s.index === fromIndex);
        const toPos = systems.findIndex((s) => s.index === toIndex);
        if (fromPos === -1 || toPos === -1 || fromPos === toPos) return current;
        const [moved] = systems.splice(fromPos, 1);
        systems.splice(toPos, 0, moved);
        return { ...current, data: { ...current.data, systems } };
      }),
    emit: () => toast.success('Emit sent to the showcase preview'),
    reset: () => toast.success('Preview reset'),
    kickStart: () => toast.success('Kick start sent to the showcase preview'),
    setTexturePreset: (preset: string) => {
      setData((current) => {
        if (!current.data) return current;
        return {
          ...current,
          data: {
            ...current.data,
            systems: current.data.systems.map((item) =>
              item.index === current.activeSystem
                ? { ...item, texturePreset: preset, texturePath: '', textureFilename: `${preset}.png`, exportReady: true }
                : item,
            ),
          },
        };
      });
    },
    setTexturePath: (texturePath: string) =>
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
                    exportReady: true,
                  }
                : item,
            ),
          },
        };
      }),
    setTextureFromUpload: (filename: string) => {
      toast.success(`Texture loaded for preview: ${filename}`);
      return Promise.resolve();
    },
    setShader: (params: Record<string, unknown>) => {
      if (typeof params.shaderSource === 'string') updateActiveParam('shaderSource', params.shaderSource);
      toast.success('Shader applied to showcase preview');
    },
    exportCode: () => {
      navigator.clipboard.writeText(JSON.stringify(data.data, null, 2)).catch(() => {});
      toast.success('Copied showcase particle data');
    },
    exportZip: () => toast.info('ZIP export is available in the Feather desktop app.'),
    saveProject: () => {
      if (!data.data || !data.activeComposite) return;
      downloadProject({
        type: PROJECT_TYPE,
        version: 1,
        exportedAt: new Date().toISOString(),
        name: data.activeComposite,
        composite: data.data,
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
      if (project.type !== PROJECT_TYPE || project.version !== 1 || !project.composite?.systems?.length) {
        toast.error('Unsupported particle project file');
        return;
      }
      const nextName = project.name && !data.composites.includes(project.name)
        ? project.name
        : `${project.name || 'Imported Particles'} ${data.composites.length + 1}`;
      setData({
        type: 'particle-system-playground',
        composites: [...data.composites, nextName],
        activeComposite: nextName,
        activeSystem: 1,
        data: { ...project.composite, compositeType: 'scratch' },
      });
      toast.success('Particle project imported');
    },
  };
}
