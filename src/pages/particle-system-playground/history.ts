import type {
  ParticleSystemPlaygroundCompositeData,
  ParticleSystemPlaygroundData,
} from '@/types/particle-system-playground';
import { withNormalizedTimeline } from './timeline';

export const PARTICLE_HISTORY_LIMIT = 100;
export const PARTICLE_HISTORY_COALESCE_MS = 500;

export type ParticleAuthoringSnapshot = {
  activeSystem: number;
  data: ParticleSystemPlaygroundCompositeData;
};

export type ParticleHistoryEntry = {
  snapshot: ParticleAuthoringSnapshot;
  groupKey?: string;
  recordedAt: number;
};

export type ParticleHistoryState = {
  undoStack: ParticleHistoryEntry[];
  redoStack: ParticleHistoryEntry[];
  lastGroupKey?: string;
  lastRecordedAt?: number;
};

export type ParticleHistoryRecordOptions = {
  groupKey?: string;
  coalesce?: boolean;
  now?: number;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createParticleHistoryState(): ParticleHistoryState {
  return {
    undoStack: [],
    redoStack: [],
  };
}

export function snapshotParticleAuthoring(data: ParticleSystemPlaygroundData): ParticleAuthoringSnapshot | null {
  if (!data.data || data.data.compositeType !== 'scratch') return null;
  const normalized = withNormalizedTimeline(data.data);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { timelineState: _timelineState, ...authoringData } = normalized;
  return clone({
    activeSystem: data.activeSystem,
    data: authoringData,
  });
}

export function sameParticleSnapshot(
  a: ParticleAuthoringSnapshot | null | undefined,
  b: ParticleAuthoringSnapshot | null | undefined,
): boolean {
  if (!a || !b) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function recordParticleHistory(
  state: ParticleHistoryState,
  snapshot: ParticleAuthoringSnapshot | null,
  options: ParticleHistoryRecordOptions = {},
): ParticleHistoryState {
  if (!snapshot) return state;
  const now = options.now ?? Date.now();
  const coalesce = options.coalesce === true && !!options.groupKey;
  const latest = state.undoStack.at(-1);
  if (sameParticleSnapshot(latest?.snapshot, snapshot)) {
    return {
      ...state,
      lastGroupKey: options.groupKey,
      lastRecordedAt: now,
    };
  }

  if (
    coalesce &&
    latest &&
    state.lastGroupKey === options.groupKey &&
    typeof state.lastRecordedAt === 'number' &&
    now - state.lastRecordedAt <= PARTICLE_HISTORY_COALESCE_MS
  ) {
    return {
      ...state,
      redoStack: [],
      lastRecordedAt: now,
    };
  }

  return {
    undoStack: [...state.undoStack, { snapshot, groupKey: options.groupKey, recordedAt: now }].slice(
      -PARTICLE_HISTORY_LIMIT,
    ),
    redoStack: [],
    lastGroupKey: options.groupKey,
    lastRecordedAt: now,
  };
}

export function undoParticleHistory(
  state: ParticleHistoryState,
  current: ParticleAuthoringSnapshot | null,
): { state: ParticleHistoryState; snapshot: ParticleAuthoringSnapshot | null } {
  if (!current) return { state, snapshot: null };
  const undoStack = [...state.undoStack];
  let previous = undoStack.pop();
  while (previous && sameParticleSnapshot(previous.snapshot, current)) {
    previous = undoStack.pop();
  }
  if (!previous) return { state: { ...state, undoStack }, snapshot: null };
  return {
    snapshot: previous.snapshot,
    state: {
      undoStack,
      redoStack: [...state.redoStack, { snapshot: current, recordedAt: Date.now() }].slice(-PARTICLE_HISTORY_LIMIT),
    },
  };
}

export function redoParticleHistory(
  state: ParticleHistoryState,
  current: ParticleAuthoringSnapshot | null,
): { state: ParticleHistoryState; snapshot: ParticleAuthoringSnapshot | null } {
  if (!current) return { state, snapshot: null };
  const redoStack = [...state.redoStack];
  let next = redoStack.pop();
  while (next && sameParticleSnapshot(next.snapshot, current)) {
    next = redoStack.pop();
  }
  if (!next) return { state: { ...state, redoStack }, snapshot: null };
  return {
    snapshot: next.snapshot,
    state: {
      undoStack: [...state.undoStack, { snapshot: current, recordedAt: Date.now() }].slice(-PARTICLE_HISTORY_LIMIT),
      redoStack,
    },
  };
}

export function restoreParticleSnapshotToData(
  current: ParticleSystemPlaygroundData | undefined,
  snapshot: ParticleAuthoringSnapshot,
): ParticleSystemPlaygroundData | undefined {
  if (!current) return current;
  return {
    ...current,
    activeSystem: snapshot.activeSystem,
    data: clone(withNormalizedTimeline(snapshot.data)),
  };
}
