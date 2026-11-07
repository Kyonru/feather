/**
 * Is what I am looking at from this run of the game? (skills/feather-desktop-app/references/design-rules.md §6.2, C2.)
 *
 * The honest signal is not age. It is whether the data predates the session
 * currently attached: data that arrived before this game started is from a
 * previous run, however recent the clock says it is. A value from 40 seconds
 * ago is fine if the game has been up for an hour, and wrong if the game
 * restarted 5 seconds ago.
 *
 * Shared by Inspector (`useFreshness`, its panels) and Studio (live previews
 * sent through Inspector), which cannot import each other. Pure: no React, no
 * stores, so both apps and `scripts/tests/` judge with the same function.
 */

/** Below this, "just now" is more honest than a number that churns every second. */
const JUST_NOW_MS = 3_000;

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
 * Unknown is not stale: with no data, or no session to compare against, this
 * makes no claim.
 */
export function isFromPreviousRun(updatedAt: number | null, sessionConnectedAt?: number | null): boolean {
  if (updatedAt === null || !sessionConnectedAt) return false;
  return updatedAt < sessionConnectedAt;
}

export type PreviewFreshness = 'none' | 'current' | 'stale';

/**
 * Does a preview that was sent into a game still reflect the game attached now?
 *
 * Studio sends a preview to one session. It is stale when that session is no
 * longer the attached one — it disconnected, or the game restarted, which is a
 * new session — or when the attached session connected after the preview was
 * sent. The last case is the same rule Inspector applies to its panels.
 */
export function previewFreshness(
  delivery: { sessionId: string; sentAt: number } | null | undefined,
  attached: { id: string; connectedAt: number } | null | undefined,
): PreviewFreshness {
  if (!delivery) return 'none';
  if (!attached || attached.id !== delivery.sessionId) return 'stale';
  return isFromPreviousRun(delivery.sentAt, attached.connectedAt) ? 'stale' : 'current';
}
