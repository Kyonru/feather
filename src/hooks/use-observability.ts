import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSessionStore } from '@/store/session';
import { sessionQueryKey } from './use-ws-connection';

export type ObserverEntry = {
  key: string;
  value: string;
  type: string;
  previous?: string;
  changed: boolean;
  history: string[];
  group?: string;
  firstSeen?: number;
  lastSeen?: number;
  lastChanged?: number;
  changeCount?: number;
  valueLength?: number;
};

type RawObserverEntry = Partial<Omit<ObserverEntry, 'key' | 'value' | 'type' | 'history'>> & {
  key?: unknown;
  value?: unknown;
  type?: unknown;
  history?: unknown;
};

function normalizeObserverEntry(entry: RawObserverEntry): ObserverEntry | null {
  if (entry.key == null) return null;
  const value = entry.value == null ? '' : String(entry.value);
  const type = typeof entry.type === 'string' && entry.type ? entry.type : typeof entry.value;

  return {
    key: String(entry.key),
    value,
    type,
    previous: entry.previous == null ? undefined : String(entry.previous),
    changed: entry.changed === true,
    history: Array.isArray(entry.history) ? entry.history.map((item) => String(item)) : [],
    group: typeof entry.group === 'string' ? entry.group : undefined,
    firstSeen: typeof entry.firstSeen === 'number' ? entry.firstSeen : undefined,
    lastSeen: typeof entry.lastSeen === 'number' ? entry.lastSeen : undefined,
    lastChanged: typeof entry.lastChanged === 'number' ? entry.lastChanged : undefined,
    changeCount: typeof entry.changeCount === 'number' ? entry.changeCount : undefined,
    valueLength: typeof entry.valueLength === 'number' ? entry.valueLength : value.length,
  };
}

export const useObservability = (search?: string): { data: ObserverEntry[]; all: ObserverEntry[] } => {
  const sessionId = useSessionStore((state) => state.sessionId);

  const { data } = useQuery<RawObserverEntry[]>({
    queryKey: sessionQueryKey.observers(sessionId ?? ''),
    queryFn: () => [],
    enabled: false,
  });

  const entries = useMemo(() => (data ?? []).map(normalizeObserverEntry).filter((entry): entry is ObserverEntry => !!entry), [data]);

  const filtered = useMemo(() => {
    if (!search?.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter(
      (e) =>
        e.key.toLowerCase().includes(q) ||
        e.value.toLowerCase().includes(q) ||
        e.type.toLowerCase().includes(q) ||
        (e.group ?? '').toLowerCase().includes(q),
    );
  }, [entries, search]);

  return { data: filtered, all: entries };
};
