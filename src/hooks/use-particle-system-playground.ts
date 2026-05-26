/* eslint-disable @typescript-eslint/no-unused-vars */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { sendCommand } from '@/lib/send-command';
import { useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';
import { debounce } from '@/utils/timers';
import { sessionQueryKey } from './use-ws-connection';
import type {
  ParticleSystemPlaygroundData,
  ParticleSystemPlaygroundProjectFile,
  ParticleSystemPlaygroundSystem,
  ParticleSystemPlaygroundTemplate,
} from '@/types/particle-system-playground';

const PLUGIN_ID = 'particle-system-playground';

const EMPTY_DATA: ParticleSystemPlaygroundData = {
  type: 'particle-system-playground',
  composites: [],
  activeComposite: null,
  activeSystem: 1,
  data: null,
};

type ParamValue = string | number | boolean;
type ParamBatch = Record<string, ParamValue>;
type ScopedParamBatches = Record<string, ParamBatch>;
type ActionParams = Record<string, unknown>;

function targetKey(composite: string, systemIndex: number) {
  return `${composite}\u0000${systemIndex}`;
}

function updateSystemDraft(
  system: ParticleSystemPlaygroundSystem,
  key: string,
  value: ParamValue,
): ParticleSystemPlaygroundSystem {
  if (key === 'title') return { ...system, title: String(value) };
  if (key === 'blendMode') return { ...system, blendMode: String(value) };
  if (key === 'enabled') return { ...system, enabled: value === true || value === 'true' || value === 1 };
  if (key === 'emitterOffsetX') return { ...system, x: Number(value) };
  if (key === 'emitterOffsetY') return { ...system, y: Number(value) };
  if (key === 'kickStartSteps') return { ...system, kickStartSteps: Number(value) };
  if (key === 'kickStartDt') return { ...system, kickStartDt: Number(value) };
  if (key === 'emitAtStart') return { ...system, emitAtStart: Number(value) };
  return { ...system, properties: { ...system.properties, [key]: value } };
}

function updateDraft(
  data: ParticleSystemPlaygroundData | undefined,
  batches: ScopedParamBatches,
): ParticleSystemPlaygroundData | undefined {
  if (!data?.data) return data;

  const next: ParticleSystemPlaygroundData = {
    ...data,
    data: {
      ...data.data,
      movement: { ...data.data.movement },
      systems: data.data.systems.map((system) => ({ ...system, properties: { ...system.properties } })),
    },
  };
  const nextData = next.data;
  if (!nextData) return next;

  for (const params of Object.values(batches)) {
    const targetComposite = String(params.composite ?? data.activeComposite ?? '');
    if (targetComposite && targetComposite !== data.activeComposite) continue;

    if (params.compositeX !== undefined) nextData.x = Number(params.compositeX);
    if (params.compositeY !== undefined) nextData.y = Number(params.compositeY);
    if (params.previewEnabled !== undefined) nextData.previewEnabled = params.previewEnabled === true;

    for (const [key, value] of Object.entries(params)) {
      if (key.startsWith('movement.')) {
        const movementKey = key.slice('movement.'.length);
        nextData.movement = { ...nextData.movement, [movementKey]: value };
      }
    }

    const systemIndex = Number(params.systemIndex ?? data.activeSystem);
    nextData.systems = nextData.systems.map((system) => {
      if (system.index !== systemIndex) return system;
      let draft = system;
      for (const [key, value] of Object.entries(params)) {
        if (
          key === 'composite' ||
          key === 'systemIndex' ||
          key === 'compositeX' ||
          key === 'compositeY' ||
          key === 'previewEnabled' ||
          key.startsWith('movement.')
        ) {
          continue;
        }
        draft = updateSystemDraft(draft, key, value);
      }
      return draft;
    });
  }

  return next;
}

function updateTextureDraft(
  data: ParticleSystemPlaygroundData | undefined,
  systemIndex: number,
  texture: Partial<
    Pick<ParticleSystemPlaygroundSystem, 'texturePath' | 'texturePreset' | 'textureFilename' | 'exportReady'>
  >,
): ParticleSystemPlaygroundData | undefined {
  if (!data?.data) return data;
  return {
    ...data,
    data: {
      ...data.data,
      systems: data.data.systems.map((system) => (system.index === systemIndex ? { ...system, ...texture } : system)),
    },
  };
}

function valuesEqual(a: unknown, b: unknown) {
  if (typeof a === 'number' || typeof b === 'number') {
    return Math.abs(Number(a) - Number(b)) < 0.0001;
  }
  return a === b;
}

function valueForParam(
  data: ParticleSystemPlaygroundData | undefined,
  params: Record<string, ParamValue>,
  key: string,
): ParamValue | undefined {
  if (!data?.data) return undefined;
  if (key === 'composite') return data.activeComposite ?? '';
  if (key === 'systemIndex') return data.activeSystem;
  if (key === 'compositeX') return data.data.x;
  if (key === 'compositeY') return data.data.y;
  if (key === 'previewEnabled') return data.data.previewEnabled;
  if (key.startsWith('movement.')) {
    const movementKey = key.slice('movement.'.length) as keyof typeof data.data.movement;
    return data.data.movement[movementKey] as ParamValue | undefined;
  }

  const systemIndex = Number(params.systemIndex ?? data.activeSystem);
  const system = data.data.systems.find((item) => item.index === systemIndex);
  if (!system) return undefined;
  if (key === 'title') return system.title;
  if (key === 'blendMode') return system.blendMode;
  if (key === 'enabled') return system.enabled;
  if (key === 'emitterOffsetX') return system.x;
  if (key === 'emitterOffsetY') return system.y;
  if (key === 'kickStartSteps') return system.kickStartSteps;
  if (key === 'kickStartDt') return system.kickStartDt;
  if (key === 'emitAtStart') return system.emitAtStart;
  return system.properties[key as keyof typeof system.properties] as ParamValue | undefined;
}

export function useParticleSystemPlayground() {
  const sessionId = useSessionStore((state) => state.sessionId);
  const plugin = useConfigStore((state) => state.config?.plugins?.[PLUGIN_ID]);
  const queryClient = useQueryClient();
  const pendingParams = useRef<ScopedParamBatches>({});
  const [optimisticParams, setOptimisticParams] = useState<ScopedParamBatches>({});

  const { data: serverData } = useQuery<ParticleSystemPlaygroundData>({
    queryKey: sessionQueryKey.plugin(sessionId ?? '', PLUGIN_ID),
    queryFn: () => EMPTY_DATA,
    enabled: false,
    initialData: EMPTY_DATA,
  });

  const data = useMemo(() => updateDraft(serverData, optimisticParams) ?? serverData, [serverData, optimisticParams]);

  const lastShaderResponse = useQuery<{ status?: string; message?: string }>({
    queryKey: sessionQueryKey.pluginAction(sessionId ?? '', PLUGIN_ID, 'set-shader'),
    queryFn: () => ({}),
    enabled: false,
  }).data;

  const send = useCallback(
    (message: Record<string, unknown>) => {
      if (!sessionId) return Promise.resolve();
      return sendCommand(sessionId, message).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : 'Particles Playground command failed');
      });
    },
    [sessionId],
  );

  const pluginQueryKey = sessionQueryKey.plugin(sessionId ?? '', PLUGIN_ID);
  const setOptimisticData = useCallback((composite: string, systemIndex: number, params: ParamBatch) => {
    const key = targetKey(composite, systemIndex);
    setOptimisticParams((current) => ({
      ...current,
      [key]: {
        ...(current[key] ?? {}),
        composite,
        systemIndex,
        ...params,
      },
    }));
  }, []);

  useEffect(() => {
    setOptimisticParams((current) => {
      const next: ScopedParamBatches = {};
      for (const [batchKey, params] of Object.entries(current)) {
        const entries = Object.entries(params).filter(([key, value]) => {
          if (key === 'composite' || key === 'systemIndex') return false;
          const serverValue = valueForParam(serverData, params, key);
          return serverValue === undefined || !valuesEqual(serverValue, value);
        });
        if (entries.length > 0) {
          next[batchKey] = {
            composite: params.composite ?? '',
            systemIndex: params.systemIndex ?? 1,
            ...(Object.fromEntries(entries) as ParamBatch),
          };
        }
      }
      return Object.keys(next).length === 0 && Object.keys(current).length === 0 ? current : next;
    });
  }, [serverData]);

  const flushParams = useMemo(
    () =>
      // Particle property edits can fire quickly from text fields and gizmos; keep runtime updates debounced.
      debounce(() => {
        const batches = pendingParams.current;
        pendingParams.current = {};
        for (const params of Object.values(batches)) {
          if (Object.keys(params).length === 0) continue;
          send({ type: 'cmd:plugin:params', plugin: PLUGIN_ID, params });
        }
      }, 150),
    [send],
  );

  const updateParam = useCallback(
    (key: string, value: ParamValue) => {
      const composite = data.activeComposite ?? '';
      const systemIndex = data.activeSystem;
      const batchKey = targetKey(composite, systemIndex);
      setOptimisticData(composite, systemIndex, { [key]: value });
      pendingParams.current[batchKey] = {
        ...(pendingParams.current[batchKey] ?? {}),
        composite,
        systemIndex,
        [key]: value,
      };
      flushParams();
    },
    [data.activeComposite, data.activeSystem, flushParams, setOptimisticData],
  );

  const updateActiveParam = useCallback(
    (key: string, value: ParamValue) => {
      const composite = data.activeComposite ?? '';
      const systemIndex = data.activeSystem;
      const batchKey = targetKey(composite, systemIndex);
      setOptimisticData(composite, systemIndex, { [key]: value });
      pendingParams.current[batchKey] = {
        ...(pendingParams.current[batchKey] ?? {}),
        composite,
        systemIndex,
        [key]: value,
      };
      flushParams();
    },
    [data.activeComposite, data.activeSystem, flushParams, setOptimisticData],
  );

  const sendAction = useCallback(
    (action: string, extra: ActionParams = {}) => {
      return send({
        type: 'cmd:plugin:action',
        plugin: PLUGIN_ID,
        action,
        params: {
          composite: data.activeComposite ?? '',
          systemIndex: data.activeSystem,
          ...extra,
        },
      });
    },
    [data.activeComposite, data.activeSystem, send],
  );

  const setTextureFromUpload = useCallback(
    (filename: string, dataBase64: string) => {
      queryClient.setQueryData<ParticleSystemPlaygroundData>(pluginQueryKey, (current) =>
        updateTextureDraft(current, data.activeSystem, {
          texturePath: '',
          texturePreset: '',
          textureFilename: filename,
          exportReady: true,
        }),
      );
      return sendAction('set-texture', { filename, dataBase64 });
    },
    [data.activeSystem, pluginQueryKey, queryClient, sendAction],
  );

  const refreshAfterAction = useCallback(
    (action: string, extra?: ActionParams) => {
      sendAction(action, extra).then(() => {
        queryClient.invalidateQueries({ queryKey: sessionQueryKey.plugin(sessionId ?? '', PLUGIN_ID) }).catch(() => {});
      });
    },
    [queryClient, sendAction, sessionId],
  );

  return {
    plugin,
    available: !!plugin,
    enabled: !!plugin && !plugin.disabled && !plugin.incompatible,
    data,
    composites: data.composites,
    activeComposite: data.activeComposite,
    activeSystemIndex: data.activeSystem,
    composite: data.data,
    activeSystem: data.data?.systems.find((system) => system.index === data.activeSystem) ?? null,
    shaderError: lastShaderResponse?.status === 'error' ? lastShaderResponse.message : '',
    updateActiveParam,
    updateParam,
    sendAction,
    refreshAfterAction,
    selectComposite: (name: string) => refreshAfterAction('select-composite', { composite: name }),
    selectSystem: (index: number) => refreshAfterAction('select-system', { systemIndex: index }),
    createComposite: (name?: string, template?: ParticleSystemPlaygroundTemplate) =>
      refreshAfterAction('new-composite', { ...(name ? { name } : {}), ...(template ? { template } : {}) }),
    deleteComposite: () => refreshAfterAction('delete-composite'),
    addSystem: () => refreshAfterAction('add-system'),
    removeSystem: (systemIndex: number) => refreshAfterAction('remove-system', { systemIndex }),
    reorderSystem: (fromIndex: number, toIndex: number) => {
      queryClient.setQueryData<ParticleSystemPlaygroundData>(pluginQueryKey, (current) => {
        if (!current?.data) return current;
        const systems = [...current.data.systems];
        const fromPos = systems.findIndex((s) => s.index === fromIndex);
        const toPos = systems.findIndex((s) => s.index === toIndex);
        if (fromPos === -1 || toPos === -1 || fromPos === toPos) return current;
        const [moved] = systems.splice(fromPos, 1);
        systems.splice(toPos, 0, moved);
        return { ...current, data: { ...current.data, systems } };
      });
      refreshAfterAction('reorder-system', { fromIndex, toIndex });
    },
    emit: (_all = true, count = 100) => refreshAfterAction('emit', { count }),
    reset: (_all = true) => refreshAfterAction('reset'),
    kickStart: () => refreshAfterAction('kick-start'),
    setTexturePreset: (preset: string) => {
      queryClient.setQueryData<ParticleSystemPlaygroundData>(pluginQueryKey, (current) =>
        updateTextureDraft(current, data.activeSystem, {
          texturePath: '',
          texturePreset: preset,
          textureFilename: `${preset}.png`,
          exportReady: true,
        }),
      );
      refreshAfterAction('set-texture', { preset });
    },
    setTexturePath: (texturePath: string) => {
      queryClient.setQueryData<ParticleSystemPlaygroundData>(pluginQueryKey, (current) =>
        updateTextureDraft(current, data.activeSystem, {
          texturePath,
          texturePreset: '',
          textureFilename: texturePath.split(/[\\/]/).pop() || 'texture.png',
          exportReady: true,
        }),
      );
      refreshAfterAction('set-texture', { texturePath });
    },
    setTextureFromUpload,
    setShader: (params: ActionParams) => refreshAfterAction('set-shader', params),
    exportCode: () => refreshAfterAction('export-code'),
    exportZip: () => refreshAfterAction('export-zip'),
    saveProject: () => refreshAfterAction('export-project'),
    importProject: (raw: string) => {
      let project: ParticleSystemPlaygroundProjectFile;
      try {
        project = JSON.parse(raw) as ParticleSystemPlaygroundProjectFile;
      } catch {
        toast.error('Particle project JSON is invalid');
        return;
      }
      if (project.type !== 'feather.particle-system-playground' || project.version !== 1) {
        toast.error('Unsupported particle project file');
        return;
      }
      refreshAfterAction('import-project', { project });
      toast.success('Particle project import requested');
    },
  };
}
