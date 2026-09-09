import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useSessionStore } from '@/store/session';

/**
 * How old is what I am looking at, and is it from this run?
 *
 * Inspector has 45 ways to refresh a panel and, until now, no way to tell
 * whether you needed to. Panels deliberately go dormant when you leave — that is
 * what keeps Feather's runtime overhead low — so a panel you come back to can be
 * showing state from ten minutes and three game restarts ago, rendered
 * identically to live data. The user was given a button to fix a problem they
 * could not see.
 *
 * The honest signal is not age. It is whether the data predates the session
 * currently attached: data that arrived before this game started is from a
 * previous run, full stop, however recent the clock says it is.
 *
 * See V4-ENHANCED.md §5 (C2).
 */

/** Below this, "just now" is more honest than a number that churns every second. */
const JUST_NOW_MS = 3_000;

export type Freshness = {
  /** When this data last arrived, or null if it never has. */
  updatedAt: number | null;
  /** Age in milliseconds, or null if it never arrived. */
  ageMs: number | null;
  /** True when the data predates the attached session — it is from a previous run. */
  fromPreviousRun: boolean;
  /** Nothing has ever arrived for this key. */
  never: boolean;
  /** "just now", "12s ago", "4m ago" — or null when there is nothing to describe. */
  label: string | null;
};

export function describeAge(ageMs: number): string {
  if (ageMs < JUST_NOW_MS) return 'just now';
  const seconds = Math.floor(ageMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

/**
 * Did this data arrive before the attached session started?
 *
 * The whole judgement, kept as a pure function so it can be tested without a
 * React tree. Age is not the signal — a panel showing a value from 40 seconds
 * ago is fine if the game has been up for an hour, and wrong if the game
 * restarted 5 seconds ago.
 */
export function isFromPreviousRun(updatedAt: number | null, sessionConnectedAt?: number | null): boolean {
  if (updatedAt === null || !sessionConnectedAt) return false;
  return updatedAt < sessionConnectedAt;
}

/**
 * Track freshness for one query key.
 *
 * Ticks only while there is something to describe, and only once a second — a
 * freshness label that re-renders a panel faster than the data changes would be
 * its own kind of noise.
 */
export function useFreshness(queryKey: readonly unknown[]): Freshness {
  const queryClient = useQueryClient();
  const activeSession = useSessionStore((state) => (state.sessionId ? state.sessions[state.sessionId] : null));
  const [now, setNow] = useState(() => Date.now());

  const state = queryClient.getQueryState(queryKey);
  const updatedAt = state?.dataUpdatedAt && state.dataUpdatedAt > 0 ? state.dataUpdatedAt : null;

  useEffect(() => {
    if (updatedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [updatedAt]);

  if (updatedAt === null) {
    return { updatedAt: null, ageMs: null, fromPreviousRun: false, never: true, label: null };
  }

  const ageMs = Math.max(0, now - updatedAt);
  const fromPreviousRun = isFromPreviousRun(updatedAt, activeSession?.connectedAt);

  return {
    updatedAt,
    ageMs,
    fromPreviousRun,
    never: false,
    label: describeAge(ageMs),
  };
}
