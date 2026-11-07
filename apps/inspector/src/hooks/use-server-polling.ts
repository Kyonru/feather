import { sendBackgroundCommand } from '@/lib/send-command';
/**
 * Send a one-shot request to the game for all data.
 * Use this for manual reconnect / refresh buttons only.
 */
export const requestAllData = (sessionId: string) => {
  sendBackgroundCommand(sessionId, { type: 'req:config' });

  sendBackgroundCommand(sessionId, { type: 'req:performance' });

  sendBackgroundCommand(sessionId, { type: 'req:observers' });

  sendBackgroundCommand(sessionId, { type: 'req:assets' });

  sendBackgroundCommand(sessionId, { type: 'req:plugins' });
};
