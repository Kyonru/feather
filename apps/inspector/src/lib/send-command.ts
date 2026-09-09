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
