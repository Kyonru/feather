import { useCallback } from 'react';
import { toast } from 'sonner';
import { sendCommand } from '@/lib/send-command';
import { useConfigStore } from '@/store/config';
import { useSessionStore } from '@/store/session';

export const usePluginControl = (pluginId: string) => {
  const sessionId = useSessionStore((state) => state.sessionId);
  const plugin = useConfigStore((state) => state.config?.plugins?.[pluginId]);
  const available = !!plugin;
  const enabled = !!plugin && !plugin.disabled && !plugin.incompatible;

  const setEnabled = useCallback(
    (nextEnabled: boolean, extra?: Record<string, unknown>) => {
      if (!sessionId) return;

      sendCommand(sessionId, {
        type: 'cmd:plugin:set_enabled',
        plugin: pluginId,
        enabled: nextEnabled,
        ...(extra ?? {}),
      }).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : `Failed to ${nextEnabled ? 'enable' : 'disable'} plugin`);
      });
    },
    [pluginId, sessionId],
  );

  return {
    available,
    enabled,
    plugin,
    setEnabled,
  };
};
