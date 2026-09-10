import { create } from 'zustand';
import type { SessionDescription } from '@feather/session-bridge';

/**
 * Studio's view of a game session.
 *
 * Studio does not own sessions — Feather Inspector does. What Studio needs is
 * narrower: *is a game reachable right now, and may I push to it?* That answer
 * arrives over the authenticated bridge and is mirrored here.
 *
 * The shape deliberately matches the Inspector session store's, because the
 * creative tools were written against it. Keeping the shape means the tools
 * moved across the application boundary without being rewritten — but they are
 * now reading a mirror fed by the bridge, not Inspector's own state, and there
 * is no import path from here back into Inspector.
 *
 * With no Inspector attached this store is simply empty, which is the same thing
 * the tools already understood as "no session".
 */

export type SessionKind = 'live';

export type SessionInfo = {
  id: string;
  name?: string;
  kind?: SessionKind;
  connected: boolean;
  connectedAt: number;
  runtimeSuspended?: boolean;
};

/**
 * Is a game attached and accepting commands?
 *
 * The honest question, and the only one Studio needs to ask about sessions.
 * `false` is the ordinary answer: most of the time nobody has a game running,
 * and Studio is fully useful anyway.
 */
export function sessionSupportsRuntime(
  session?: SessionInfo | null,
): session is SessionInfo & { connected: true; kind?: undefined } {
  return !!session && !session.kind && session.connected;
}

/**
 * Studio's two modes.
 *
 * `local` — authoring against Studio's own state. **This is the default**, and
 * it is fully capable: every tool works, nothing is disabled, no empty state
 * asks for a session.
 *
 * `attached` — a game is reachable through Inspector, which *adds* live preview
 * and pushing work into the running game. Nothing else changes.
 *
 * This replaced a predicate called `isCreativeSession`, inherited from Inspector
 * where a gameless workspace was the exception you deliberately created. In
 * Studio the same words name the default, which is why the code read backwards:
 * `creativeSession ? localPlayground : livePlayground` selected the *live*
 * controller whenever no game was attached, because Studio never creates a
 * creative session. Asking the question the right way round removes the bug and
 * the vocabulary together.
 */
export type StudioMode = 'local' | 'attached';

export function studioModeFor(session?: SessionInfo | null): StudioMode {
  return sessionSupportsRuntime(session) ? 'attached' : 'local';
}

type StudioSessionStore = {
  sessionId: string | null;
  sessions: Record<string, SessionInfo>;
  /** Replace the mirror with what the bridge just reported. */
  syncFromBridge: (description: SessionDescription) => void;
  /** Drop the mirror. Called when the bridge disconnects. */
  clear: () => void;
};

export const useSessionStore = create<StudioSessionStore>()((set) => ({
  sessionId: null,
  sessions: {},

  syncFromBridge: (description) =>
    set(() => {
      if (!description.sessionId) return { sessionId: null, sessions: {} };
      return {
        sessionId: description.sessionId,
        sessions: {
          [description.sessionId]: {
            id: description.sessionId,
            name: description.name ?? undefined,
            connected: description.connected,
            connectedAt: Date.now(),
          },
        },
      };
    }),

  clear: () => set({ sessionId: null, sessions: {} }),
}));

/** The active session, or null when no game is attached. */
export function useActiveSession(): SessionInfo | null {
  return useSessionStore((state) => (state.sessionId ? (state.sessions[state.sessionId] ?? null) : null));
}

/** Studio's current mode. See `StudioMode`. */
export function useStudioMode(): StudioMode {
  return studioModeFor(useActiveSession());
}

/** Convenience for the common branch: local is the default. */
export function useIsLocalMode(): boolean {
  return useStudioMode() === 'local';
}


