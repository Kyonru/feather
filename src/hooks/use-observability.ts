/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQueryClient } from '@tanstack/react-query';
import { useSessionStore } from '@/store/session';
import { sessionQueryKey } from './use-ws-connection';

export const useObservability = (): { data: Record<string, any>[] } => {
  const queryClient = useQueryClient();
  const sessionId = useSessionStore((state) => state.sessionId);

  if (!sessionId) return { data: [] };

  const data = queryClient.getQueryData<Record<string, any>[]>(
    sessionQueryKey.observers(sessionId),
  );

  return { data: data ?? [] };
};
