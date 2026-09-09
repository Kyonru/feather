import { toast } from 'sonner';

import type { CommandMessage } from '@feather/session-bridge';
import { sendCommand } from '@feather/session-bridge';

/**
 * Re-exported from `@feather/session-bridge` so existing call sites keep working
 * while the transport itself stays out of this module's import graph.
 *
 * With no session attached this resolves without doing anything, which is what
 * lets a consumer with no game — Feather Studio standalone, or the showcase on
 * the web — stay fully usable rather than erroring.
 */
export { sendCommand, hasSession } from '@feather/session-bridge';
export type { CommandMessage } from '@feather/session-bridge';

/**
 * Send a command the user asked for, and say so if it does not arrive.
 *
 * Inspector had 44 `.catch(() => {})` sites, and they were not all the same
 * thing. Background sync failing transiently is not worth interrupting anyone —
 * it will be retried, and a toast per hiccup is the noise L6 warns about. But a
 * command the user *pressed a button for* is different: if "Stop replay" or
 * "Clear logs" never reaches the game, silence leaves them believing something
 * happened that did not, and the panel simply looks broken.
 *
 * `action` completes the sentence "Could not ..." — pass "stop the replay", not
 * "Stop replay failed".
 *
 * See V4-ENHANCED.md §5 (C4).
 */
export async function sendUserCommand(
  sessionId: string,
  message: CommandMessage,
  action: string,
): Promise<boolean> {
  try {
    await sendCommand(sessionId, message);
    return true;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    toast.error(`Could not ${action}`, { description: reason });
    return false;
  }
}

/**
 * Send a command the user did not ask for, and stay quiet if it does not arrive.
 *
 * The counterpart to `sendUserCommand`, and the reason both exist: a bare
 * `.catch(() => {})` cannot tell you whether the silence was considered or
 * merely convenient. These are background refreshes and connection setup —
 * `req:assets` when a panel opens, `req:config` on reconnect. They are retried
 * the next time the panel asks, and a toast per transient hiccup is exactly the
 * noise that trains people to dismiss toasts without reading them.
 *
 * What the user *does* get is the panel saying its data is stale, which is the
 * honest signal and is C2's job rather than this one's.
 *
 * See V4-ENHANCED.md §5 (C4).
 */
export function sendBackgroundCommand(sessionId: string, message: CommandMessage): void {
  void sendCommand(sessionId, message).catch(() => {
    // Intentional: see above. The panel's freshness indicator carries this.
  });
}
