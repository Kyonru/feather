import { useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sendCommand } from '@/lib/send-command';
import { useSessionStore } from '@/store/session';
import { useEffectiveApiKey } from './use-session-api-key';
import {
  sessionQueryKey,
  type ConsoleGlobalsResponse,
  type ConsoleInspectResultResponse,
  type ConsolePinsResponse,
  type EvalResponse,
} from './use-ws-connection';
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
  const apiKey = useEffectiveApiKey();
  const counterRef = useRef(0);

  const queryKey = sessionId ? sessionQueryKey.console(sessionId) : ['noop-console'];
  const globalsQueryKey = sessionId ? sessionQueryKey.consoleGlobals(sessionId) : ['noop-console-globals'];
  const pinsQueryKey = sessionId ? sessionQueryKey.consolePins(sessionId) : ['noop-console-pins'];
  const inspectQueryKey = sessionId ? sessionQueryKey.consoleInspect(sessionId) : ['noop-console-inspect'];

  const { data: responses } = useQuery<EvalResponse[]>({
    queryKey,
    queryFn: () => [],
    enabled: false,
  });

  const { data: globals } = useQuery<ConsoleGlobalsResponse>({
    queryKey: globalsQueryKey,
    queryFn: () => ({ ok: false, error: 'Globals not loaded' }),
    enabled: false,
  });

  const { data: pins } = useQuery<ConsolePinsResponse>({
    queryKey: pinsQueryKey,
    queryFn: () => ({ ok: true, pins: [] }),
    enabled: false,
  });

  const { data: inspectResult } = useQuery<ConsoleInspectResultResponse>({
    queryKey: inspectQueryKey,
    queryFn: () => ({ ok: false }),
    enabled: false,
  });

  const execute = useCallback(
    (code: string, options?: { readOnly?: boolean }): ConsoleEntry => {
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

      sendCommand(sessionId, {
        type: 'cmd:eval',
        code,
        id,
        apiKey: apiKey || undefined,
        readOnly: options?.readOnly === true,
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

  const refreshGlobals = useCallback(() => {
    if (!sessionId) {
      queryClient.setQueryData(globalsQueryKey, { ok: false, error: 'No active session' });
      return;
    }
    queryClient.setQueryData(globalsQueryKey, { ok: false, error: 'Loading globals...' });
    sendCommand(sessionId, { type: 'req:console:globals' }).catch((e: unknown) => {
      queryClient.setQueryData<ConsoleGlobalsResponse>(globalsQueryKey, {
        ok: false,
        error: e instanceof Error ? e.message : 'Failed to request globals',
      });
      toast.error(e instanceof Error ? e.message : 'Failed to request globals');
    });
  }, [globalsQueryKey, queryClient, sessionId]);

  const refreshPins = useCallback(() => {
    if (!sessionId) return;
    sendCommand(sessionId, { type: 'req:console:pins' }).catch(() => {});
  }, [sessionId]);

  const pinExpression = useCallback(
    (expression: string, name?: string) => {
      if (!sessionId) return;
      sendCommand(sessionId, {
        type: 'cmd:console:pin',
        data: {
          expression,
          name: name || expression.replace(/[^A-Za-z0-9_.-]+/g, '_').slice(0, 48) || 'pin',
        },
        apiKey: apiKey || undefined,
      }).catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'Failed to pin expression');
      });
    },
    [apiKey, sessionId],
  );

  const unpinExpression = useCallback(
    (id: string) => {
      if (!sessionId) return;
      sendCommand(sessionId, { type: 'cmd:console:unpin', data: { id } }).catch(() => {});
    },
    [sessionId],
  );

  const inspectResultPath = useCallback(
    (handle: string, path: string[]) => {
      if (!sessionId) return;
      sendCommand(sessionId, {
        type: 'cmd:console:inspect_result',
        data: { handle, path, id: `${handle}:${path.join('.')}` },
      }).catch(() => {});
    },
    [sessionId],
  );

  return {
    responses: responses ?? [],
    globals,
    pins,
    inspectResult,
    execute,
    clear,
    refreshGlobals,
    refreshPins,
    pinExpression,
    unpinExpression,
    inspectResultPath,
  };
};
