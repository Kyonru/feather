import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { describeAge, previewFreshness, type PreviewFreshness } from '@feather/ui';
import { useActiveSession } from './index.ts';

/**
 * Which game each tool's live preview was last delivered to (skills/feather-desktop-app/references/design-rules.md §6.2, C2).
 *
 * Applies only when Studio is paired with Inspector. A preview reflects one run
 * of one game; when that game restarts or disconnects the preview on screen is
 * no longer what the game shows, and the tool has to say so rather than look
 * live. Ephemeral on purpose — after a Studio restart nothing has been sent.
 */

type Delivery = { sessionId: string; sentAt: number };

/** Actions that put a live preview into the game. Validation and apply are not previews. */
const PREVIEW_ACTIONS = new Set(['preview-shader']);
/** Actions that take the preview out of the game rather than putting one in. */
const CLEARING_ACTIONS = new Set(['clear-preview']);

type PreviewDeliveryStore = {
  byPlugin: Record<string, Delivery>;
  record: (delivery: { plugin: string; action: string; sessionId: string; kind: 'send' | 'cancel' }) => void;
  forget: (plugin: string) => void;
};

export const usePreviewDeliveryStore = create<PreviewDeliveryStore>()((set) => ({
  byPlugin: {},
  record: ({ plugin, action, sessionId, kind }) =>
    set((state) => {
      const byPlugin = { ...state.byPlugin };
      if (kind === 'cancel' || CLEARING_ACTIONS.has(action)) delete byPlugin[plugin];
      else if (PREVIEW_ACTIONS.has(action)) byPlugin[plugin] = { sessionId, sentAt: Date.now() };
      else return state;
      return { byPlugin };
    }),
  forget: (plugin) =>
    set((state) => {
      const byPlugin = { ...state.byPlugin };
      delete byPlugin[plugin];
      return { byPlugin };
    }),
}));

export type PreviewFreshnessView = { state: PreviewFreshness; label: string | null };

/**
 * Is the preview this tool sent still what the attached game is showing?
 *
 * `stale` when the game it went to has disconnected or restarted since. The
 * judgement is the shared one Inspector uses for its panels — against the
 * session's `connectedAt`, not the clock — so a quiet hour-long session is never
 * called stale and a five-second-old restart always is.
 */
export function usePreviewFreshness(plugin: string, paired: boolean): PreviewFreshnessView {
  const delivery = usePreviewDeliveryStore((state) => state.byPlugin[plugin] ?? null);
  const active = useActiveSession();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!delivery || !paired) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [delivery, paired]);

  if (!paired) return { state: 'none', label: null };
  const state = previewFreshness(delivery, active ? { id: active.id, connectedAt: active.connectedAt } : null);
  if (state === 'none' || !delivery) return { state, label: null };
  if (state === 'stale') {
    return {
      state,
      label: active
        ? 'From a previous game run — the game restarted since this preview was sent.'
        : 'The game this preview was sent to has disconnected.',
    };
  }
  return { state, label: `Live in ${active?.name ?? 'the game'} · sent ${describeAge(Math.max(0, now - delivery.sentAt))}` };
}
