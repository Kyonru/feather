import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const PENDING_SESSION_NAME = 'Connecting game';

/**
 * Feather Studio owns the creative tools as of v4, and with them the gameless
 * "creative workspace" session. Inspector still recognizes the old marker so a
 * workspace persisted by an earlier version is dropped on load rather than
 * restored as a tab that opens nothing.
 */
const LEGACY_CREATIVE_SESSION_PREFIX = 'creative:';

export type SessionKind = 'live' | 'log-file' | 'time-travel-file';

export type SessionInfo = {
  id: string;
  os?: string;
  name?: string;
  deviceId?: string;
  kind?: SessionKind;
  filePath?: string;
  connected: boolean;
  connectedAt: number;
  insecure?: boolean;
  pendingConfig?: boolean;
  runtimeSuspended?: boolean;
};

function isLegacyCreativeSession(id: string, session: SessionInfo): boolean {
  return (session.kind as string) === 'creative' || id.startsWith(LEGACY_CREATIVE_SESSION_PREFIX);
}

export function sessionSupportsRuntime(session?: SessionInfo | null): session is SessionInfo & { connected: true; kind?: undefined } {
  return !!session && !session.kind && session.connected;
}

export function sessionCanOpenRuntimePages(session?: SessionInfo | null): boolean {
  return !!session;
}

/**
 * Should a session's `feather:hello` make it the one being viewed?
 *
 * Every hello used to, so a second game connecting pulled the view — and the
 * global config — away from the game being debugged. A hello takes over only
 * when nothing usable is active: no session, the same session, or one that is
 * disconnected or still waiting for its own hello.
 */
export function shouldActivateOnHello(
  activeSessionId: string | null,
  sessions: Record<string, SessionInfo>,
  helloSessionId: string,
): boolean {
  if (!activeSessionId || activeSessionId === helloSessionId) return true;
  const active = sessions[activeSessionId];
  return !active || !active.connected || active.pendingConfig === true;
}

/**
 * The session store after `endedId` disconnects.
 *
 * The end event names a session; it used to be treated as "the active one
 * ended" whichever game it was, so a background game quitting disconnected the
 * game being viewed.
 */
export function endSessionState(
  state: Pick<SessionStore, 'sessionId' | 'sessions'>,
  endedId: string,
): Pick<SessionStore, 'sessionId' | 'sessions'> {
  const ended = state.sessions[endedId];
  const sessions = ended ? { ...state.sessions, [endedId]: { ...ended, connected: false } } : state.sessions;
  return { sessions, sessionId: state.sessionId === endedId ? null : state.sessionId };
}

type SessionStore = {
  sessionId: string | null;
  sessions: Record<string, SessionInfo>;
  setSession: (sessionId: string) => void;
  clearSession: () => void;
  /** Mark one session disconnected; clears the active session only if it was that one. */
  endSession: (sessionId: string) => void;
  addSession: (info: SessionInfo) => void;
  removeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  setRuntimeSuspended: (sessionId: string, suspended: boolean) => void;
};

export function prepareSessionsForPersistence(sessions: Record<string, SessionInfo>): Record<string, SessionInfo> {
  return Object.fromEntries(
    Object.entries(sessions)
      .filter(
        ([id, session]) =>
          !id.startsWith('file:') &&
          !session.pendingConfig &&
          session.name !== PENDING_SESSION_NAME &&
          !isLegacyCreativeSession(id, session),
      )
      .map(([id, session]) => [id, { ...session, connected: false, pendingConfig: false, runtimeSuspended: false }]),
  );
}

export const useSessionStore = create<SessionStore>()(
  persist(
    (set) => ({
      sessionId: null,
      sessions: {},
      setSession: (sessionId) => set({ sessionId }),
      clearSession: () =>
        set((state) => {
          const sessions = { ...state.sessions };
          if (state.sessionId && sessions[state.sessionId]) {
            sessions[state.sessionId] = { ...sessions[state.sessionId], connected: false };
          }
          return { sessionId: null, sessions };
        }),
      endSession: (endedId) => set((state) => endSessionState(state, endedId)),
      addSession: (info) =>
        set((state) => {
          const sessions = { ...state.sessions };
          if (info.deviceId) {
            for (const [id, existing] of Object.entries(sessions)) {
              if (existing.deviceId === info.deviceId && id !== info.id) {
                delete sessions[id];
              }
            }
          }
          sessions[info.id] = info;
          return { sessions };
        }),
      removeSession: (sessionId) =>
        set((state) => {
          const sessions = { ...state.sessions };
          delete sessions[sessionId];
          return {
            sessions,
            sessionId: state.sessionId === sessionId ? null : state.sessionId,
          };
        }),
      setActiveSession: (sessionId) => set({ sessionId }),
      setRuntimeSuspended: (sessionId, runtimeSuspended) =>
        set((state) => {
          const session = state.sessions[sessionId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [sessionId]: {
                ...session,
                runtimeSuspended,
              },
            },
          };
        }),
    }),
    {
      name: 'session-storage',
      partialize: (state) => ({
        // Only persist real device sessions, not ephemeral file sessions.
        // Remembered live sessions are history affordances after an app restart;
        // they become live again only after the current frontend receives config.
        sessions: prepareSessionsForPersistence(state.sessions),
      }),
      merge: (persisted, current) => {
        const persistedState = typeof persisted === 'object' && persisted !== null ? persisted as {
          sessions?: Record<string, SessionInfo>;
          __e2eLiveSessions?: boolean;
        } : {};
        const persistedSessions = persistedState.sessions ?? {};
        return {
          ...current,
          sessions: persistedState.__e2eLiveSessions === true
            ? persistedSessions
            : prepareSessionsForPersistence(persistedSessions),
        };
      },
    },
  ),
);
