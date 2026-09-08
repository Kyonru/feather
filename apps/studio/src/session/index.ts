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

export const CREATIVE_SESSION_PREFIX = 'creative:';

export type SessionKind = 'live' | 'creative';

export type SessionInfo = {
  id: string;
  name?: string;
  kind?: SessionKind;
  connected: boolean;
  connectedAt: number;
  runtimeSuspended?: boolean;
};

export function createCreativeSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${CREATIVE_SESSION_PREFIX}${crypto.randomUUID()}`;
  }
  return `${CREATIVE_SESSION_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/**
 * A local, gameless workspace.
 *
 * Standalone Studio is always in this state, which is why it stays fully useful
 * with no Inspector installed.
 */
export function isCreativeSession(session?: SessionInfo | null): boolean {
  return session?.kind === 'creative' || session?.id.startsWith(CREATIVE_SESSION_PREFIX) === true;
}

/** A real game is attached and accepting commands. */
export function sessionSupportsRuntime(
  session?: SessionInfo | null,
): session is SessionInfo & { connected: true; kind?: undefined } {
  return !!session && !isCreativeSession(session) && !session.kind && session.connected;
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
