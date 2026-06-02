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
  ParticleTimeline,
  ParticleTimelineState,
  ParticleSystemPlaygroundData,
  ParticleSystemPlaygroundProjectFile,
  ParticleSystemPlaygroundSystem,
  ParticleSystemPlaygroundTemplate,
} from '@/types/particle-system-playground';
import {
  advanceParticleTimelineState,
  migrateParticleProject,
  PARTICLE_PROJECT_TYPE,
  normalizeParticleTimeline,
  normalizeParticleTimelineMode,
  reindexParticleSystems,
  removeParticleTimelineTrack,
  reorderParticleTimeline,
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
type TimelineStateByComposite = Record<string, ParticleTimelineState>;

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
    Pick<ParticleSystemPlaygroundSystem, 'texturePath' | 'texturePreset' | 'textureFilename' | 'textureAtlas' | 'exportReady'>
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

function updateTimelineDraft(
  data: ParticleSystemPlaygroundData | undefined,
  timeline: ParticleTimeline,
): ParticleSystemPlaygroundData | undefined {
  if (!data?.data) return data;
  return {
    ...data,
    data: withNormalizedTimeline({
      ...data.data,
      timeline: normalizeParticleTimeline(timeline, data.data.systems),
    }),
  };
}

function updateTimelineStateDraft(
  data: ParticleSystemPlaygroundData | undefined,
  state: Partial<ParticleTimelineState>,
): ParticleSystemPlaygroundData | undefined {
  if (!data?.data) return data;
  const previous = data.data.timelineState ?? { time: 0, playing: false, scrubVersion: 0 };
  return {
    ...data,
    data: {
      ...data.data,
      timelineState: {
        ...previous,
        ...state,
        scrubVersion: state.time !== undefined ? (previous.scrubVersion ?? 0) + 1 : previous.scrubVersion,
      },
    },
  };
}

function clampTimelineState(state: ParticleTimelineState, duration: number): ParticleTimelineState {
  const safeDuration = Math.max(0.01, Number.isFinite(duration) ? duration : 3);
  const time = Math.max(0, Math.min(safeDuration, Number(state.time) || 0));
  return {
    time,
    playing: state.playing === true,
    scrubVersion: Number.isFinite(Number(state.scrubVersion)) ? Number(state.scrubVersion) : 0,
  };
}

function valuesEqual(a: unknown, b: unknown) {
  if (typeof a === 'number' || typeof b === 'number') {
    return Math.abs(Number(a) - Number(b)) < 0.0001;
  }
  return a === b;
}

function timelinesEqual(a: ParticleTimeline, b: ParticleTimeline): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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
  const runtimeSuspended = useSessionStore((state) =>
    sessionId ? state.sessions[sessionId]?.runtimeSuspended === true : false,
  );
  const plugin = useConfigStore((state) => state.config?.plugins?.[PLUGIN_ID]);
  const queryClient = useQueryClient();
  const pendingParams = useRef<ScopedParamBatches>({});
  const pendingTimelineSeek = useRef<{ composite: string; time: number } | null>(null);
  const pendingTimelineUpdate = useRef<{ composite: string; timeline: ParticleTimeline } | null>(null);
  const pendingRestore = useRef<{ composite: string; snapshot: ParticleAuthoringSnapshot } | null>(null);
  const historyScope = useRef<string | null>(null);
  const [optimisticParams, setOptimisticParams] = useState<ScopedParamBatches>({});
  const [localTimelineStates, setLocalTimelineStates] = useState<TimelineStateByComposite>({});
  const [historyState, setHistoryState] = useState<ParticleHistoryState>(() => createParticleHistoryState());
  const historyStateRef = useRef<ParticleHistoryState>(historyState);

  const { data: serverData } = useQuery<ParticleSystemPlaygroundData>({
    queryKey: sessionQueryKey.plugin(sessionId ?? '', PLUGIN_ID),
    queryFn: () => EMPTY_DATA,
    enabled: false,
    initialData: EMPTY_DATA,
  });

  const data = useMemo(() => {
    const draft = updateDraft(serverData, optimisticParams) ?? serverData;
    if (!draft.data) return draft;
    const normalized = withNormalizedTimeline(draft.data);
    const localState = draft.activeComposite ? localTimelineStates[draft.activeComposite] : undefined;
    return {
      ...draft,
      data: {
        ...normalized,
        timelineState: localState
          ? clampTimelineState(localState, normalized.timeline?.duration ?? 3)
          : normalized.timelineState,
      },
    };
  }, [localTimelineStates, serverData, optimisticParams]);
  const dataRef = useRef<ParticleSystemPlaygroundData>(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

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

  const historyUnavailableReason =
    data.data?.compositeType === 'game' ? 'Undo history is available for scratch composites only.' : undefined;

  useEffect(() => {
    historyStateRef.current = historyState;
  }, [historyState]);

  useEffect(() => {
    const nextScope = sessionId && data.activeComposite ? `${sessionId}\u0000${data.activeComposite}` : null;
    if (historyScope.current === nextScope) return;
    historyScope.current = nextScope;
    const empty = createParticleHistoryState();
    historyStateRef.current = empty;
    setHistoryState(empty);
    pendingRestore.current = null;
  }, [data.activeComposite, sessionId]);

  const clearHistory = useCallback(() => {
    const empty = createParticleHistoryState();
    historyStateRef.current = empty;
    setHistoryState(empty);
    pendingRestore.current = null;
  }, []);

  const currentHistorySnapshot = useCallback(() => snapshotParticleAuthoring(dataRef.current), []);

  const recordSnapshot = useCallback(
    (snapshot: ParticleAuthoringSnapshot | null, groupKey: string, coalesce = false) => {
      if (historyUnavailableReason) return;
      if (!snapshot) return;
      setHistoryState((current) => {
        const next = recordParticleHistory(current, snapshot, { groupKey, coalesce });
        historyStateRef.current = next;
        return next;
      });
    },
    [historyUnavailableReason],
  );

  const recordHistory = useCallback(
    (groupKey: string, coalesce = false) => {
      recordSnapshot(currentHistorySnapshot(), groupKey, coalesce);
    },
    [currentHistorySnapshot, recordSnapshot],
  );

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
        if (runtimeSuspended) return;
        const batches = pendingParams.current;
        pendingParams.current = {};
        for (const params of Object.values(batches)) {
          if (Object.keys(params).length === 0) continue;
          send({ type: 'cmd:plugin:params', plugin: PLUGIN_ID, params });
        }
      }, 150),
    [runtimeSuspended, send],
  );

  useEffect(() => {
    if (!runtimeSuspended) flushParams();
  }, [flushParams, runtimeSuspended]);

  const updateParam = useCallback(
    (key: string, value: ParamValue) => {
      const composite = data.activeComposite ?? '';
      const systemIndex = data.activeSystem;
      const currentValue = valueForParam(data, { composite, systemIndex }, key);
      if (currentValue !== undefined && valuesEqual(currentValue, value)) return;
      recordHistory(`composite:${key}`, true);
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
    [data, flushParams, recordHistory, setOptimisticData],
  );

  const updateActiveParam = useCallback(
    (key: string, value: ParamValue) => {
      const composite = data.activeComposite ?? '';
      const systemIndex = data.activeSystem;
      const currentValue = valueForParam(data, { composite, systemIndex }, key);
      if (currentValue !== undefined && valuesEqual(currentValue, value)) return;
      recordHistory(`system:${systemIndex}:${key}`, true);
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
    [data, flushParams, recordHistory, setOptimisticData],
  );

  const updateSystemParam = useCallback(
    (systemIndex: number, key: string, value: ParamValue) => {
      const composite = data.activeComposite ?? '';
      const currentValue = valueForParam(data, { composite, systemIndex }, key);
      if (currentValue !== undefined && valuesEqual(currentValue, value)) return;
      recordHistory(`system:${systemIndex}:${key}`, true);
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
    [data, flushParams, recordHistory, setOptimisticData],
  );

  const sendAction = useCallback(
    (action: string, extra: ActionParams = {}) => {
      const allowedWhileSuspended = action === 'runtime-preview' && extra.active === false;
      if (runtimeSuspended && !allowedWhileSuspended) return Promise.resolve();
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
    [data.activeComposite, data.activeSystem, runtimeSuspended, send],
  );

  const setRuntimePreviewActive = useCallback(
    (active: boolean, composite?: string | null) => {
      if (runtimeSuspended && active) return Promise.resolve();
      return send({
        type: 'cmd:plugin:action',
        plugin: PLUGIN_ID,
        action: 'runtime-preview',
        params: {
          composite: composite ?? data.activeComposite ?? '',
          systemIndex: data.activeSystem,
          active,
        },
      });
    },
    [data.activeComposite, data.activeSystem, runtimeSuspended, send],
  );

  const sendRestoreSnapshot = useCallback(
    (composite: string, snapshot: ParticleAuthoringSnapshot) => {
      if (!composite) return Promise.resolve();
      if (runtimeSuspended) {
        pendingRestore.current = { composite, snapshot };
        return Promise.resolve();
      }
      pendingRestore.current = null;
      return send({
        type: 'cmd:plugin:action',
        plugin: PLUGIN_ID,
        action: 'restore-composite',
        params: {
          composite,
          activeSystem: snapshot.activeSystem,
          data: snapshot.data,
        },
      });
    },
    [runtimeSuspended, send],
  );

  const restoreSnapshot = useCallback(
    (snapshot: ParticleAuthoringSnapshot) => {
      const composite = data.activeComposite ?? '';
      pendingParams.current = {};
      pendingTimelineSeek.current = null;
      pendingTimelineUpdate.current = null;
      setOptimisticParams({});
      setLocalTimelineStates((current) => {
        if (!composite) return current;
        const { [composite]: _removed, ...rest } = current;
        return rest;
      });
      queryClient.setQueryData<ParticleSystemPlaygroundData>(pluginQueryKey, (current) =>
        restoreParticleSnapshotToData(current ?? data, snapshot),
      );
      dataRef.current = restoreParticleSnapshotToData(dataRef.current, snapshot) ?? dataRef.current;
      void sendRestoreSnapshot(composite, snapshot);
    },
    [data, pluginQueryKey, queryClient, sendRestoreSnapshot],
  );

  useEffect(() => {
    if (runtimeSuspended) return;
    const restore = pendingRestore.current;
    if (restore) {
      pendingRestore.current = null;
      void sendRestoreSnapshot(restore.composite, restore.snapshot);
    }
    const pending = pendingTimelineUpdate.current;
    if (!pending) return;
    pendingTimelineUpdate.current = null;
    void sendAction('set-timeline', {
      composite: pending.composite,
      timeline: pending.timeline,
    });
  }, [runtimeSuspended, sendAction, sendRestoreSnapshot]);

  const setTextureFromUpload = useCallback(
    (filename: string, dataBase64: string, textureAtlas?: TextureLabAtlasMetadata) => {
      recordHistory(`system:${data.activeSystem}:texture`, false);
      queryClient.setQueryData<ParticleSystemPlaygroundData>(pluginQueryKey, (current) =>
        updateTextureDraft(current, data.activeSystem, {
          texturePath: '',
          texturePreset: '',
          textureFilename: filename,
          textureAtlas,
          exportReady: true,
        }),
      );
      return sendAction('set-texture', { filename, dataBase64, textureAtlas });
    },
    [data.activeSystem, pluginQueryKey, queryClient, recordHistory, sendAction],
  );

  const refreshAfterAction = useCallback(
    (action: string, extra?: ActionParams) => {
      sendAction(action, extra).then(() => {
        queryClient.invalidateQueries({ queryKey: sessionQueryKey.plugin(sessionId ?? '', PLUGIN_ID) }).catch(() => {});
      });
    },
    [queryClient, sendAction, sessionId],
  );

  const setTimelineState = useCallback(
    (state: Partial<ParticleTimelineState>) => {
      const composite = data.activeComposite ?? '';
      if (composite) {
        setLocalTimelineStates((current) => {
          const previous = current[composite] ?? data.data?.timelineState ?? { time: 0, playing: false, scrubVersion: 0 };
          return {
            ...current,
            [composite]: {
              ...previous,
              ...state,
              scrubVersion: state.time !== undefined ? (previous.scrubVersion ?? 0) + 1 : previous.scrubVersion,
            },
          };
        });
      }
      queryClient.setQueryData<ParticleSystemPlaygroundData>(pluginQueryKey, (current) =>
        updateTimelineStateDraft(current, state),
      );
    },
    [data.activeComposite, data.data?.timelineState, pluginQueryKey, queryClient],
  );

  const localTimeline = data.data ? normalizeParticleTimeline(data.data.timeline, data.data.systems) : null;
  const localTimelineDuration = localTimeline?.duration ?? 0;
  const localTimelineMode = normalizeParticleTimelineMode(localTimeline?.mode, localTimeline?.loop ? 'loop' : 'one-shot');
  const localTimelinePlaying = data.data?.timelineState?.playing === true;

  useEffect(() => {
    const composite = data.activeComposite;
    const initialTimelineState = data.data?.timelineState;
    if (!composite || localTimelineDuration <= 0 || !localTimelinePlaying) return;

    let last = performance.now();
    const interval = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.max(0, Math.min(0.12, (now - last) / 1000));
      last = now;
      setLocalTimelineStates((current) => {
        const previous = current[composite] ?? initialTimelineState ?? { time: 0, playing: true, scrubVersion: 0 };
        if (previous.playing !== true) return current;
        const next = advanceParticleTimelineState(
          { duration: localTimelineDuration, mode: localTimelineMode, loop: localTimelineMode === 'loop' },
          previous,
          dt,
        );
        return {
          ...current,
          [composite]: next,
        };
      });
    }, 33);

    return () => window.clearInterval(interval);
  }, [data.activeComposite, localTimelineDuration, localTimelineMode, localTimelinePlaying]);

  const sendTimelineSeek = useMemo(
    () =>
      debounce(() => {
        const pending = pendingTimelineSeek.current;
        if (!pending) return;
        pendingTimelineSeek.current = null;
        sendAction('timeline-control', {
          command: 'seek',
          composite: pending.composite,
          time: pending.time,
        });
      }, 120),
    [sendAction],
  );

  const undo = useCallback(() => {
    if (historyUnavailableReason) return;
    const current = currentHistorySnapshot();
    const result = undoParticleHistory(historyStateRef.current, current);
    historyStateRef.current = result.state;
    setHistoryState(result.state);
    if (result.snapshot) restoreSnapshot(result.snapshot);
  }, [currentHistorySnapshot, historyUnavailableReason, restoreSnapshot]);

  const redo = useCallback(() => {
    if (historyUnavailableReason) return;
    const current = currentHistorySnapshot();
    const result = redoParticleHistory(historyStateRef.current, current);
    historyStateRef.current = result.state;
    setHistoryState(result.state);
    if (result.snapshot) restoreSnapshot(result.snapshot);
  }, [currentHistorySnapshot, historyUnavailableReason, restoreSnapshot]);

  return {
    plugin,
    available: !!plugin,
    enabled: !!plugin && !plugin.disabled && !plugin.incompatible,
    runtimeSuspended,
    data,
    composites: data.composites,
    activeComposite: data.activeComposite,
    activeSystemIndex: data.activeSystem,
    composite: data.data,
    activeSystem: data.data?.systems.find((system) => system.index === data.activeSystem) ?? null,
    shaderError: lastShaderResponse?.status === 'error' ? lastShaderResponse.message : '',
    canUndo: !historyUnavailableReason && historyState.undoStack.length > 0,
    canRedo: !historyUnavailableReason && historyState.redoStack.length > 0,
    historyUnavailableReason,
    undo,
    redo,
    updateActiveParam,
    updateSystemParam,
    updateParam,
    sendAction,
    setRuntimePreviewActive,
    refreshAfterAction,
    selectComposite: (name: string) => {
      clearHistory();
      refreshAfterAction('select-composite', { composite: name });
    },
    selectSystem: (index: number) => refreshAfterAction('select-system', { systemIndex: index }),
    createComposite: (name?: string, template?: ParticleSystemPlaygroundTemplate) => {
      clearHistory();
      refreshAfterAction('new-composite', { ...(name ? { name } : {}), ...(template ? { template } : {}) });
    },
    deleteComposite: () => {
      clearHistory();
      refreshAfterAction('delete-composite');
    },
    addSystem: () => {
      recordHistory('systems:add', false);
      refreshAfterAction('add-system');
    },
    removeSystem: (systemIndex: number) => {
      recordHistory(`systems:remove:${systemIndex}`, false);
      queryClient.setQueryData<ParticleSystemPlaygroundData>(pluginQueryKey, (current) => {
        if (!current?.data || current.data.systems.length <= 1) return current;
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
      refreshAfterAction('remove-system', { systemIndex });
    },
    reorderSystem: (fromIndex: number, toIndex: number) => {
      recordHistory(`systems:reorder:${fromIndex}:${toIndex}`, false);
      queryClient.setQueryData<ParticleSystemPlaygroundData>(pluginQueryKey, (current) => {
        if (!current?.data) return current;
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
          data: withNormalizedTimeline({
            ...current.data,
            systems: reindexParticleSystems(systems),
            timeline,
          }),
        };
      });
      refreshAfterAction('reorder-system', { fromIndex, toIndex });
    },
    updateTimeline: (timeline: ParticleTimeline) => {
      const currentComposite = dataRef.current.data;
      if (!currentComposite) return;
      const nextTimeline = normalizeParticleTimeline(timeline, currentComposite.systems);
      const currentTimeline = normalizeParticleTimeline(currentComposite.timeline, currentComposite.systems);
      if (timelinesEqual(nextTimeline, currentTimeline)) return;
      recordHistory('timeline', false);
      queryClient.setQueryData<ParticleSystemPlaygroundData>(pluginQueryKey, (current) => {
        const next = updateTimelineDraft(current, nextTimeline);
        if (next) dataRef.current = next;
        return next;
      });
      if (runtimeSuspended) {
        pendingTimelineUpdate.current = {
          composite: data.activeComposite ?? '',
          timeline: nextTimeline,
        };
        return;
      }
      refreshAfterAction('set-timeline', { timeline: nextTimeline });
    },
    playTimeline: (sendRuntime = true) => {
      const timeline = data.data ? normalizeParticleTimeline(data.data.timeline, data.data.systems) : null;
      const time = data.data?.timelineState?.time ?? 0;
      const restart =
        !!timeline &&
        normalizeParticleTimelineMode(timeline.mode, timeline.loop ? 'loop' : 'one-shot') === 'one-shot' &&
        time >= timeline.duration - 0.001;
      setTimelineState({ ...(restart ? { time: 0 } : {}), playing: true });
      if (!sendRuntime) return;
      refreshAfterAction('timeline-control', { command: 'play' });
    },
    pauseTimeline: (time?: number, sendRuntime = true) => {
      setTimelineState({
        ...(typeof time === 'number' && Number.isFinite(time) ? { time } : {}),
        playing: false,
      });
      if (!sendRuntime) return;
      refreshAfterAction('timeline-control', {
        command: 'pause',
        ...(typeof time === 'number' && Number.isFinite(time) ? { time } : {}),
      });
    },
    stopTimeline: (sendRuntime = true) => {
      setTimelineState({ time: 0, playing: false });
      pendingTimelineSeek.current = null;
      if (!sendRuntime) return;
      refreshAfterAction('timeline-control', { command: 'stop', time: 0 });
    },
    seekTimeline: (time: number, immediate = false, sendRuntime = true) => {
      const composite = data.activeComposite ?? '';
      setTimelineState({ time, playing: false });
      if (!sendRuntime) {
        pendingTimelineSeek.current = null;
        return;
      }
      if (immediate) {
        pendingTimelineSeek.current = null;
        refreshAfterAction('timeline-control', { command: 'seek', time, composite });
        return;
      }
      pendingTimelineSeek.current = { composite, time };
      sendTimelineSeek();
    },
    emit: (_all = true, count = 100) => refreshAfterAction('emit', { count }),
    reset: (_all = true) => refreshAfterAction('reset'),
    kickStart: () => refreshAfterAction('kick-start'),
    setTexturePreset: (preset: string) => {
      recordHistory(`system:${data.activeSystem}:texture`, false);
      queryClient.setQueryData<ParticleSystemPlaygroundData>(pluginQueryKey, (current) =>
        updateTextureDraft(current, data.activeSystem, {
          texturePath: '',
          texturePreset: preset,
          textureFilename: `${preset}.png`,
          textureAtlas: undefined,
          exportReady: true,
        }),
      );
      refreshAfterAction('set-texture', { preset });
    },
    setTexturePath: (texturePath: string) => {
      recordHistory(`system:${data.activeSystem}:texture`, false);
      queryClient.setQueryData<ParticleSystemPlaygroundData>(pluginQueryKey, (current) =>
        updateTextureDraft(current, data.activeSystem, {
          texturePath,
          texturePreset: '',
          textureFilename: texturePath.split(/[\\/]/).pop() || 'texture.png',
          textureAtlas: undefined,
          exportReady: true,
        }),
      );
      refreshAfterAction('set-texture', { texturePath });
    },
    setTextureFromUpload,
    setShader: (params: ActionParams) => {
      recordHistory(`system:${data.activeSystem}:shader`, false);
      refreshAfterAction('set-shader', params);
    },
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
      if (project.type !== PARTICLE_PROJECT_TYPE || (project.version !== 1 && project.version !== 2 && project.version !== 3)) {
        toast.error('Unsupported particle project file');
        return;
      }
      project = migrateParticleProject(project);
      clearHistory();
      refreshAfterAction('import-project', { project });
      toast.success('Particle project import requested');
    },
  };
}
