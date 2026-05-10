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
};

export const useObservability = (search?: string): { data: ObserverEntry[]; all: ObserverEntry[] } => {
  const sessionId = useSessionStore((state) => state.sessionId);

  const { data } = useQuery<ObserverEntry[]>({
    queryKey: sessionQueryKey.observers(sessionId ?? ''),
    queryFn: () => [],
    enabled: false,
  });

  const filtered = useMemo(() => {
    const entries = data ?? [];
    if (!search?.trim()) return entries;
    const q = search.toLowerCase();
    return entries.filter((e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
  }, [data, search]);

  return { data: filtered, all: data ?? [] };
};
