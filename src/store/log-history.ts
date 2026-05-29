import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Config } from './config';
import type { Log } from '@/hooks/use-logs';

export const LOG_HISTORY_STORAGE_KEY = 'feather-log-history-v1';
export const MAX_LOG_HISTORY_ENTRIES = 1000;
export const LOG_HISTORY_PERSIST_DEBOUNCE_MS = 500;
const MAX_LOG_HISTORY_BUCKETS = 16;

type DebouncedStorageTimers = {
  setTimer: (callback: () => void, delayMs: number) => ReturnType<typeof globalThis.setTimeout>;
  clearTimer: (timer: ReturnType<typeof globalThis.setTimeout>) => void;
};

export type DebouncedStorage = Storage & {
  flush: () => void;
};

export type LogHistoryBucket = {
  logs: Log[];
  label?: string;
  updatedAt: number;
};

type LogUpdate = {
  id: string;
  count: number;
  time: number;
  lastTime?: number;
};

type LogHistoryState = {
  logsBySession: Record<string, LogHistoryBucket>;
  logsByHistoryKey: Record<string, LogHistoryBucket>;
  sessionHistoryKeys: Record<string, string[]>;
  rememberSession: (sessionId: string, historyKeys?: string[] | string | null, label?: string) => void;
  replaceSessionLogs: (sessionId: string, logs: Log[], historyKeys?: string[] | string | null, label?: string) => void;
  appendLog: (sessionId: string, log: Log, historyKeys?: string[] | string | null) => void;
  updateLog: (sessionId: string, update: LogUpdate, historyKeys?: string[] | string | null) => void;
  removeLogs: (sessionId: string, ids?: string[], historyKeys?: string[] | string | null) => void;
  getLogsForSession: (sessionId: string) => Log[];
  getLogsForHistoryKeys: (historyKeys?: string[] | string | null) => Log[];
};

export function createDebouncedStorage(
  storage: Storage,
  delayMs = LOG_HISTORY_PERSIST_DEBOUNCE_MS,
  timers: DebouncedStorageTimers = {
    setTimer: (callback, delay) => globalThis.setTimeout(callback, delay),
    clearTimer: (timer) => globalThis.clearTimeout(timer),
  },
): DebouncedStorage {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  function clearPendingTimer() {
    if (!timer) return;
    timers.clearTimer(timer);
    timer = null;
  }

  function flush() {
    clearPendingTimer();
    if (pending.size === 0) return;
    const writes = Array.from(pending.entries());
    pending.clear();
    for (const [key, value] of writes) {
      storage.setItem(key, value);
    }
  }

  function scheduleFlush() {
    clearPendingTimer();
    timer = timers.setTimer(flush, delayMs);
  }

  return {
    get length() {
      flush();
      return storage.length;
    },
    clear() {
      clearPendingTimer();
      pending.clear();
      storage.clear();
    },
    flush,
    getItem(key) {
      return pending.has(key) ? (pending.get(key) ?? null) : storage.getItem(key);
    },
    key(index) {
      flush();
      return storage.key(index);
    },
    removeItem(key) {
      pending.delete(key);
      storage.removeItem(key);
    },
    setItem(key, value) {
      pending.set(key, value);
      scheduleFlush();
    },
  };
}

function createLogHistoryStorage(): Storage {
  const storage = createDebouncedStorage(globalThis.localStorage);
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', storage.flush);
    window.addEventListener('pagehide', storage.flush);
  }
  return storage;
}

function trimValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '');
}

function pushKey(keys: string[], key: string | null) {
  if (!key || keys.includes(key)) return;
  keys.push(key);
}

export function resolveLogHistoryKeys(config: Partial<Config> | null | undefined, sessionId?: string): string[] {
  const keys: string[] = [];
  const deviceId = trimValue(config?.deviceId);
  const sourceDir = trimValue(config?.sourceDir);
  const rootPath = trimValue(config?.root_path);
  const location = trimValue(config?.location);

  pushKey(keys, deviceId ? `device:${deviceId}` : null);
  pushKey(keys, sourceDir ? `source:${normalizePath(sourceDir)}` : null);
  pushKey(keys, rootPath ? `root:${normalizePath(rootPath)}` : null);
  pushKey(keys, location ? `save:${normalizePath(location)}` : null);
  pushKey(keys, sessionId ? `session:${sessionId}` : null);

  return keys;
}

export function normalizeLogHistoryKeys(historyKeys?: string[] | string | null): string[] {
  if (!historyKeys) return [];
  const raw = Array.isArray(historyKeys) ? historyKeys : [historyKeys];
  return raw.map((key) => key.trim()).filter((key, index, keys) => key.length > 0 && keys.indexOf(key) === index);
}

function canPersistSession(sessionId: string): boolean {
  return !!sessionId && !sessionId.startsWith('file:');
}

export function sanitizeLogForHistory(log: Log): Log {
  if (!log.screenshot) return log;
  const rest = { ...log };
  delete rest.screenshot;
  return rest;
}

function capLogs(logs: Log[]): Log[] {
  return logs.length > MAX_LOG_HISTORY_ENTRIES ? logs.slice(-MAX_LOG_HISTORY_ENTRIES) : logs;
}

function logFingerprint(log: Log): string {
  return [
    log.id,
    log.firstTime ?? log.time,
    log.lastTime ?? '',
    log.type,
    log.str,
    log.trace ?? '',
  ].join('\u001f');
}

export function mergeLogLists(...lists: Array<Log[] | undefined>): Log[] {
  const seen = new Set<string>();
  const merged: Log[] = [];

  for (const list of lists) {
    for (const log of list ?? []) {
      const fingerprint = logFingerprint(log);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      merged.push(log);
    }
  }

  return capLogs(merged);
}

export function applyLogUpdate(logs: Log[], update: LogUpdate): Log[] {
  const index = logs.findLastIndex((log) => log.id === update.id);
  if (index === -1) return logs;

  const next = [...logs];
  next[index] = {
    ...next[index],
    count: update.count,
    time: update.time,
    lastTime: update.lastTime ?? update.time,
  };
  return next;
}

function makeBucket(logs: Log[], previous?: LogHistoryBucket, label?: string): LogHistoryBucket {
  return {
    logs: mergeLogLists(logs.map(sanitizeLogForHistory)),
    label: label ?? previous?.label,
    updatedAt: Date.now(),
  };
}

function appendToBucket(bucket: LogHistoryBucket | undefined, log: Log): LogHistoryBucket {
  return {
    logs: capLogs([...(bucket?.logs ?? []), sanitizeLogForHistory(log)]),
    label: bucket?.label,
    updatedAt: Date.now(),
  };
}

function updateBucket(bucket: LogHistoryBucket | undefined, update: LogUpdate): LogHistoryBucket | undefined {
  if (!bucket) return bucket;
  return {
    ...bucket,
    logs: applyLogUpdate(bucket.logs, update),
    updatedAt: Date.now(),
  };
}

function removeFromBucket(bucket: LogHistoryBucket | undefined, ids?: string[]): LogHistoryBucket | undefined {
  if (!bucket) return bucket;
  const idSet = ids ? new Set(ids) : null;
  return {
    ...bucket,
    logs: idSet ? bucket.logs.filter((log) => !idSet.has(log.id)) : [],
    updatedAt: Date.now(),
  };
}

function pruneBuckets(buckets: Record<string, LogHistoryBucket>): Record<string, LogHistoryBucket> {
  const entries = Object.entries(buckets);
  if (entries.length <= MAX_LOG_HISTORY_BUCKETS) return buckets;

  return Object.fromEntries(
    entries
      .sort(([, a], [, b]) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_LOG_HISTORY_BUCKETS),
  );
}

function keysForSession(state: LogHistoryState, sessionId: string, historyKeys?: string[] | string | null): string[] {
  const normalized = normalizeLogHistoryKeys(historyKeys);
  return normalized.length > 0 ? normalized : (state.sessionHistoryKeys[sessionId] ?? []);
}

export const useLogHistoryStore = create<LogHistoryState>()(
  persist(
    (set, get) => ({
      logsBySession: {},
      logsByHistoryKey: {},
      sessionHistoryKeys: {},
      rememberSession: (sessionId, historyKeys, label) => {
        if (!canPersistSession(sessionId)) return;
        const keys = keysForSession(get(), sessionId, historyKeys);
        set((state) => ({
          sessionHistoryKeys: keys.length
            ? { ...state.sessionHistoryKeys, [sessionId]: keys }
            : state.sessionHistoryKeys,
          logsBySession: pruneBuckets({
            ...state.logsBySession,
            [sessionId]: makeBucket(state.logsBySession[sessionId]?.logs ?? [], state.logsBySession[sessionId], label),
          }),
        }));
      },
      replaceSessionLogs: (sessionId, logs, historyKeys, label) => {
        if (!canPersistSession(sessionId)) return;
        const keys = keysForSession(get(), sessionId, historyKeys);
        set((state) => {
          const logsByHistoryKey = { ...state.logsByHistoryKey };
          for (const key of keys) {
            logsByHistoryKey[key] = makeBucket(logs, logsByHistoryKey[key], label);
          }
          return {
            sessionHistoryKeys: keys.length
              ? { ...state.sessionHistoryKeys, [sessionId]: keys }
              : state.sessionHistoryKeys,
            logsBySession: pruneBuckets({
              ...state.logsBySession,
              [sessionId]: makeBucket(logs, state.logsBySession[sessionId], label),
            }),
            logsByHistoryKey: pruneBuckets(logsByHistoryKey),
          };
        });
      },
      appendLog: (sessionId, log, historyKeys) => {
        if (!canPersistSession(sessionId)) return;
        const keys = keysForSession(get(), sessionId, historyKeys);
        set((state) => {
          const logsByHistoryKey = { ...state.logsByHistoryKey };
          for (const key of keys) {
            logsByHistoryKey[key] = appendToBucket(logsByHistoryKey[key], log);
          }
          return {
            logsBySession: pruneBuckets({
              ...state.logsBySession,
              [sessionId]: appendToBucket(state.logsBySession[sessionId], log),
            }),
            logsByHistoryKey: pruneBuckets(logsByHistoryKey),
          };
        });
      },
      updateLog: (sessionId, update, historyKeys) => {
        if (!canPersistSession(sessionId)) return;
        const keys = keysForSession(get(), sessionId, historyKeys);
        set((state) => {
          const logsByHistoryKey = { ...state.logsByHistoryKey };
          for (const key of keys) {
            const updated = updateBucket(logsByHistoryKey[key], update);
            if (updated) logsByHistoryKey[key] = updated;
          }
          const sessionBucket = updateBucket(state.logsBySession[sessionId], update);
          return {
            logsBySession: sessionBucket
              ? { ...state.logsBySession, [sessionId]: sessionBucket }
              : state.logsBySession,
            logsByHistoryKey,
          };
        });
      },
      removeLogs: (sessionId, ids, historyKeys) => {
        if (!canPersistSession(sessionId)) return;
        const keys = keysForSession(get(), sessionId, historyKeys);
        set((state) => {
          const logsByHistoryKey = { ...state.logsByHistoryKey };
          for (const key of keys) {
            const updated = removeFromBucket(logsByHistoryKey[key], ids);
            if (updated) logsByHistoryKey[key] = updated;
          }
          const sessionBucket = removeFromBucket(state.logsBySession[sessionId], ids);
          return {
            logsBySession: sessionBucket
              ? { ...state.logsBySession, [sessionId]: sessionBucket }
              : state.logsBySession,
            logsByHistoryKey,
          };
        });
      },
      getLogsForSession: (sessionId) => get().logsBySession[sessionId]?.logs ?? [],
      getLogsForHistoryKeys: (historyKeys) => {
        const state = get();
        return mergeLogLists(...normalizeLogHistoryKeys(historyKeys).map((key) => state.logsByHistoryKey[key]?.logs));
      },
    }),
    {
      name: LOG_HISTORY_STORAGE_KEY,
      storage: createJSONStorage(createLogHistoryStorage),
      partialize: (state) => ({
        logsBySession: state.logsBySession,
        logsByHistoryKey: state.logsByHistoryKey,
        sessionHistoryKeys: state.sessionHistoryKeys,
      }),
    },
  ),
);
