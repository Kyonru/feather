import { invoke } from '@tauri-apps/api/core';
/**
 * Send a one-shot request to the game for all data.
 * Use this for manual reconnect / refresh buttons only.
 */
export const requestAllData = (sessionId: string) => {
  invoke('send_command', {
    sessionId,
    message: JSON.stringify({ type: 'req:performance' }),
  }).catch(() => {});

  invoke('send_command', {
    sessionId,
    message: JSON.stringify({ type: 'req:observers' }),
  }).catch(() => {});

  invoke('send_command', {
    sessionId,
    message: JSON.stringify({ type: 'req:plugins' }),
  }).catch(() => {});

  invoke('send_command', {
    sessionId,
    message: JSON.stringify({ type: 'req:config' }),
  }).catch(() => {});
};
