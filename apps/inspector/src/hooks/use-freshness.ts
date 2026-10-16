import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { describeAge, isFromPreviousRun } from '@feather/ui';

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
 * See V4.md §6.2 (C2).
 */

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

// The judgement itself lives in `@feather/ui` so Studio applies the same rule
// to previews it sends through Inspector; it is re-exported here so existing
// callers and `scripts/tests/freshness.test.ts` keep their import.
export { describeAge, isFromPreviousRun };

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
