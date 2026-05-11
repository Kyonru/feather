import { invoke } from '@tauri-apps/api/core';
import { useSettingsStore } from '@/store/settings';

type CommandMessage = string | Record<string, unknown>;

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

export function sendCommand(sessionId: string, message: CommandMessage): Promise<void> {
  return invoke('send_command', {
    sessionId,
    message: withAppId(message),
  });
}
