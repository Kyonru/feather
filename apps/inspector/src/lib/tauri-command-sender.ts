import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '@/store/settings';
import type { CommandMessage, CommandSender } from '@feather/session-bridge';
import { assertSessionAcceptsCommands } from '@/lib/protocol-gate';

function withAppId(message: CommandMessage): string {
  const appId = useSettingsStore.getState().appId;

  if (typeof message === 'string') {
    try {
      const parsed = JSON.parse(message) as Record<string, unknown>;
      return JSON.stringify({ ...parsed, appId });
    } catch {
      return message;
    }
  }

  return JSON.stringify({ ...message, appId });
}

/**
 * The desktop transport. Registered by the entry point when Tauri is present.
 *
 * This is the only module that knows commands travel over Tauri, which is what
 * keeps `@tauri-apps/*` out of the shared packages Feather Studio also uses.
 */
export const tauriCommandSender: CommandSender = async (sessionId, message) => {
  // A session whose wire protocol this build cannot speak receives nothing.
  assertSessionAcceptsCommands(sessionId);
  await invoke('send_command', { sessionId, message: withAppId(message) });
};
