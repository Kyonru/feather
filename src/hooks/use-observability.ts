/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from '@tanstack/react-query';
import { useSessionStore } from '@/store/session';
import { sessionQueryKey } from './use-ws-connection';

export const useObservability = (): { data: Record<string, any>[] } => {
  const sessionId = useSessionStore((state) => state.sessionId);

  const { data } = useQuery<Record<string, any>[]>({
    queryKey: sessionQueryKey.observers(sessionId ?? ''),
    queryFn: () => [],
    enabled: false, // data is pushed via WS, not fetched
  });

  return { data: data ?? [] };
};
