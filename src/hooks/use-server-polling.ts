import { useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useSessionStore } from '@/store/session';
import { useConfigStore } from '@/store/config';

/**
 * Server-driven polling: the desktop app requests data from the game at a controlled interval.
 * Lua only responds — it never pushes performance/observers/plugins on its own.
 * Logs are still pushed in real-time by Lua since they are event-driven.
 *
 * This approach minimizes game-side CPU usage (no constant JSON encoding unless asked)
 * and gives the desktop full control over refresh rate.
 */
export const useServerPolling = () => {
  const sessionId = useSessionStore((state) => state.sessionId);
  const sampleRate = useConfigStore((state) => state.config?.sampleRate ?? 1);
  const disconnected = useConfigStore((state) => state.disconnected);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!sessionId || disconnected) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const pollInterval = sampleRate * 1000; // sampleRate is in seconds

    const requestData = () => {
      // Request performance, observers, and plugin data from the game
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
    };

    // Initial request immediately after connection
    requestData();

    intervalRef.current = setInterval(requestData, pollInterval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId, sampleRate, disconnected]);
};
