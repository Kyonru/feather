import { sendCommand } from '@/lib/send-command';
/**
 * Send a one-shot request to the game for all data.
 * Use this for manual reconnect / refresh buttons only.
 */
export const requestAllData = (sessionId: string) => {
  sendCommand(sessionId, { type: 'req:performance' }).catch(() => {});

  sendCommand(sessionId, { type: 'req:observers' }).catch(() => {});

  sendCommand(sessionId, { type: 'req:plugins' }).catch(() => {});

  sendCommand(sessionId, { type: 'req:config' }).catch(() => {});
};
