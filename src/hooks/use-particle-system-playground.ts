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

function updateSystemDraft(
  system: ParticleSystemPlaygroundSystem,
  key: string,
  value: ParamValue,
): ParticleSystemPlaygroundSystem {
  if (key === 'title') return { ...system, title: String(value) };
  if (key === 'blendMode') return { ...system, blendMode: String(value) };
  if (key === 'emitterOffsetX') return { ...system, x: Number(value) };
  if (key === 'emitterOffsetY') return { ...system, y: Number(value) };
  if (key === 'kickStartSteps') return { ...system, kickStartSteps: Number(value) };
  if (key === 'kickStartDt') return { ...system, kickStartDt: Number(value) };
  if (key === 'emitAtStart') return { ...system, emitAtStart: Number(value) };
  return { ...system, properties: { ...system.properties, [key]: value } };
}

function updateDraft(
  data: ParticleSystemPlaygroundData | undefined,
  params: Record<string, ParamValue>,
): ParticleSystemPlaygroundData | undefined {
  if (!data?.data) return data;
  const targetComposite = String(params.composite ?? data.activeComposite ?? '');
  if (targetComposite && targetComposite !== data.activeComposite) return data;

  const next: ParticleSystemPlaygroundData = {
    ...data,
    activeSystem: Number(params.systemIndex ?? data.activeSystem),
    data: {
      ...data.data,
      movement: { ...data.data.movement },
      systems: data.data.systems.map((system) => ({ ...system, properties: { ...system.properties } })),
    },
  };
  const nextData = next.data;
  if (!nextData) return next;

  if (params.compositeX !== undefined) nextData.x = Number(params.compositeX);
  if (params.compositeY !== undefined) nextData.y = Number(params.compositeY);

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
        key.startsWith('movement.')
      ) {
        continue;
      }
      draft = updateSystemDraft(draft, key, value);
    }
    return draft;
  });

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
  if (key.startsWith('movement.')) {
    const movementKey = key.slice('movement.'.length) as keyof typeof data.data.movement;
    return data.data.movement[movementKey] as ParamValue | undefined;
  }

  const systemIndex = Number(params.systemIndex ?? data.activeSystem);
  const system = data.data.systems.find((item) => item.index === systemIndex);
  if (!system) return undefined;
  if (key === 'title') return system.title;
  if (key === 'blendMode') return system.blendMode;
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
  const pendingParams = useRef<Record<string, ParamValue>>({});
  const [optimisticParams, setOptimisticParams] = useState<Record<string, ParamValue>>({});

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
  const setOptimisticData = useCallback((params: Record<string, ParamValue>) => {
    setOptimisticParams((current) => ({ ...current, ...params }));
  }, []);

  useEffect(() => {
    setOptimisticParams((current) => {
      const entries = Object.entries(current).filter(([key, value]) => {
        const serverValue = valueForParam(serverData, current, key);
        return serverValue === undefined || !valuesEqual(serverValue, value);
      });
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [serverData]);

  const flushParams = useMemo(
    () =>
      debounce(() => {
        const params = pendingParams.current;
        pendingParams.current = {};
        if (Object.keys(params).length === 0) return;
        send({ type: 'cmd:plugin:params', plugin: PLUGIN_ID, params });
      }, 150),
    [send],
  );

  const updateParam = useCallback(
    (key: string, value: ParamValue) => {
      setOptimisticData({ composite: data.activeComposite ?? '', systemIndex: data.activeSystem, [key]: value });
      pendingParams.current[key] = value;
      flushParams();
    },
    [data.activeComposite, data.activeSystem, flushParams, setOptimisticData],
  );

  const updateActiveParam = useCallback(
    (key: string, value: ParamValue) => {
      pendingParams.current.composite = data.activeComposite ?? '';
      pendingParams.current.systemIndex = data.activeSystem;
      setOptimisticData({ composite: data.activeComposite ?? '', systemIndex: data.activeSystem, [key]: value });
      pendingParams.current[key] = value;
      flushParams();
    },
    [data.activeComposite, data.activeSystem, flushParams, setOptimisticData],
  );

  const sendAction = useCallback(
    (action: string, extra: Record<string, ParamValue> = {}) => {
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
    (action: string, extra?: Record<string, ParamValue>) => {
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
    emit: (all = false, count = 100) => refreshAfterAction(all ? 'emit-all' : 'emit', { count }),
    reset: (all = false) => refreshAfterAction(all ? 'reset-all' : 'reset'),
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
    setShader: (params: Record<string, ParamValue>) => refreshAfterAction('set-shader', params),
    exportCode: () => refreshAfterAction('export-code'),
    exportZip: () => refreshAfterAction('export-zip'),
  };
}
