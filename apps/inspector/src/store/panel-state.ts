import { useCallback } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Where a panel's UI state lives.
 *
 * Inspector is a tabbed tool people bounce between constantly: filter the log,
 * jump to Performance to check a number, come back. Every panel that held its
 * filters in `useState` forgot them on the way out, so the most common thing
 * this tool asked of anyone was to type the same filter again. That is the tax
 * C1 removes.
 *
 * **Global, not per session.** What someone is looking for outlives the process
 * they are looking at: you filter for `collision` because that is the bug, and
 * it is still the bug after a restart, and still the bug in the other session
 * you open to compare against.
 *
 * (An earlier version of this comment justified it by claiming a restart mints a
 * new session id. That is not reliably true — the runtime derives the session id
 * from a device id it persists to disk, so a restart usually reconnects as the
 * same session. The conclusion stands on its own; the reason given for it did
 * not.)
 *
 * **What does not belong here:** anything transient. A dialog being open, a
 * hover, an in-flight request. Persisting those means reopening the app into a
 * state the user did not leave it in. The rule of thumb: if the user chose it
 * and would be annoyed to choose it again, it belongs here.
 *
 * See V4.md §6.2 (C1).
 */

type PanelStateStore = {
  values: Record<string, unknown>;
  set: (key: string, value: unknown) => void;
  reset: (key: string) => void;
  /** Drop everything. Exposed for settings, so the state is not a trap. */
  resetAll: () => void;
};

export const usePanelStateStore = create<PanelStateStore>()(
  persist(
    (set) => ({
      values: {},
      set: (key, value) => set((state) => ({ values: { ...state.values, [key]: value } })),
      reset: (key) =>
        set((state) => {
          if (!(key in state.values)) return state;
          const values = { ...state.values };
          delete values[key];
          return { values };
        }),
      resetAll: () => set({ values: {} }),
    }),
    {
      name: 'feather-panel-state',
      version: 1,
    },
  ),
);

/**
 * `useState`, but the value survives navigation and restarts.
 *
 * Drop-in for the common case: same tuple, same functional-update support, so
 * migrating a panel is a one-line change per piece of state.
 *
 * `key` is a stable string namespaced by panel — `logs.search`, not `search` —
 * because the store is flat and two panels wanting "search" must not collide.
 */
export function usePanelState<T>(key: string, fallback: T): [T, (next: T | ((previous: T) => T)) => void] {
  const stored = usePanelStateStore((state) => state.values[key]);
  const write = usePanelStateStore((state) => state.set);

  // `undefined` means never set. A stored `null` or `false` is a real value and
  // must not be replaced by the fallback.
  const value = (stored === undefined ? fallback : stored) as T;

  const setValue = useCallback(
    (next: T | ((previous: T) => T)) => {
      const current = (usePanelStateStore.getState().values[key] ?? fallback) as T;
      const resolved = typeof next === 'function' ? (next as (previous: T) => T)(current) : next;
      write(key, resolved);
    },
    [key, fallback, write],
  );

  return [value, setValue];
}
