import { useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/store/session';
import { useSettingsStore } from '@/store/settings';
import { sessionQueryKey, type EvalResponse } from './use-ws-connection';
import { toast } from 'sonner';

export type ConsoleEntry = {
  id: string;
  input: string;
  response?: EvalResponse;
  timestamp: number;
};

export const useConsole = () => {
  const queryClient = useQueryClient();
  const sessionId = useSessionStore((state) => state.sessionId);
  const apiKey = useSettingsStore((state) => state.apiKey);
  const counterRef = useRef(0);

  const queryKey = sessionId ? sessionQueryKey.console(sessionId) : ['noop-console'];

  const { data: responses } = useQuery<EvalResponse[]>({
    queryKey,
    queryFn: () => [],
    enabled: false,
  });

  const execute = useCallback(
    (code: string): ConsoleEntry => {
      counterRef.current += 1;
      const id = `eval-${Date.now()}-${counterRef.current}`;

      const entry: ConsoleEntry = {
        id,
        input: code,
        timestamp: Date.now(),
      };

      if (!sessionId) {
        toast.error('No active session');
        return entry;
      }

      invoke('send_command', {
        sessionId,
        message: JSON.stringify({
          type: 'cmd:eval',
          code,
          id,
          apiKey: apiKey || undefined,
        }),
      }).catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'Failed to send eval command');
      });

      return entry;
    },
    [sessionId, apiKey],
  );

  const clear = useCallback(() => {
    if (sessionId) {
      queryClient.setQueryData(sessionQueryKey.console(sessionId), []);
    }
  }, [sessionId, queryClient]);

  return {
    responses: responses ?? [],
    execute,
    clear,
  };
};
