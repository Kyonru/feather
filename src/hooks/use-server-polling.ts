import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/store/session';
import { useConfigStore } from '@/store/config';

/**
 * Requests data from the game only on manual triggers (reconnect button, etc.).
 * Lua pushes performance/observers/plugins on its own schedule — the desktop
 * never polls periodically.
 */
export const useServerPolling = () => {
  const sessionId = useSessionStore((state) => state.sessionId);
  const disconnected = useConfigStore((state) => state.disconnected);

  // When a new session connects, the Lua side sends feather:hello automatically.
  // This hook is kept for manual refresh scenarios.
  useEffect(() => {
    // No-op: Lua pushes data on its own sampleRate timer.
    // If we ever need a manual "refresh all" button, call requestData() here.
  }, [sessionId, disconnected]);
};

/**
 * Send a one-shot request to the game for all data.
 * Use this for manual reconnect / refresh buttons only.
 */
export const requestAllData = (sessionId: string) => {
  invoke('send_command', {
    sessionId,
    message: JSON.stringify({ type: 'req:performance' }),
  }).catch(() => { });

  invoke('send_command', {
    sessionId,
    message: JSON.stringify({ type: 'req:observers' }),
  }).catch(() => { });

  invoke('send_command', {
    sessionId,
    message: JSON.stringify({ type: 'req:plugins' }),
  }).catch(() => { });
};
