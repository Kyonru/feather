import { useCallback } from 'react';
import { toast } from 'sonner';
import { sendCommand } from '@feather/session-bridge';
import { useConfigStore } from './game-config.ts';
import { sessionSupportsRuntime, useSessionStore } from './index.ts';

/**
 * Control a plugin in the attached game.
 *
 * The same shape Inspector exposes, so the tools moved without being rewritten,
 * but backed by Studio's bridge-fed mirrors rather than Inspector's stores.
 * With no game attached `available` is false and `setEnabled` is a no-op, which
 * is the standalone-editor case rather than an error.
 */
export const usePluginControl = (pluginId: string) => {
  const sessionId = useSessionStore((state) => state.sessionId);
  const activeSession = useSessionStore((state) => (state.sessionId ? state.sessions[state.sessionId] : null));
  const plugin = useConfigStore((state) => state.config?.plugins?.[pluginId]);
  const available = !!plugin;
  const enabled = !!plugin && !plugin.disabled && !plugin.incompatible;

  const setEnabled = useCallback(
    (nextEnabled: boolean, extra?: Record<string, unknown>) => {
      if (!sessionId || !sessionSupportsRuntime(activeSession)) return;

      sendCommand(sessionId, {
        type: 'cmd:plugin:set_enabled',
        plugin: pluginId,
        enabled: nextEnabled,
        ...(extra ?? {}),
      }).catch((error: unknown) => {
        toast.error(error instanceof Error ? error.message : `Failed to ${nextEnabled ? 'enable' : 'disable'} plugin`);
      });
    },
    [activeSession, pluginId, sessionId],
  );

  return { available, enabled, plugin, setEnabled };
};
