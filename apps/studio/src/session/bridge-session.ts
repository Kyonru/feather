import type { BridgeSessionSummary, CommandMessage } from '@feather/session-bridge';

/**
 * The two judgements Studio makes about a paired Inspector, kept pure so they
 * can be tested without a bridge (`scripts/tests/studioBridgeSession.test.ts`).
 */

/**
 * Which game should previews go to?
 *
 * In order: the one Inspector already has this pairing scoped to; the one the
 * user picked last, if it is still connected; the only game, when there is
 * exactly one. Otherwise nobody — with two games running, guessing is how a
 * preview lands in the wrong one, so the user chooses.
 *
 * A restarted game has a new id, so "the one picked last" stops matching and a
 * single remaining game is re-selected explicitly rather than silently.
 */
export function chooseSessionSelection(input: {
  sessions: readonly BridgeSessionSummary[];
  scoped: string | null;
  remembered: string | null;
}): string | null {
  const ids = input.sessions.map((session) => session.id);
  if (input.scoped && ids.includes(input.scoped)) return input.scoped;
  if (input.remembered && ids.includes(input.remembered)) return input.remembered;
  if (ids.length === 1) return ids[0];
  return null;
}

export type BridgePreviewRequest =
  | { kind: 'send'; plugin: string; action: string; params: Record<string, unknown> }
  | { kind: 'cancel'; plugin: string; action: string };

/**
 * What a tool's game command becomes on the bridge, or null if it cannot go.
 *
 * The tools were written against Inspector's `sendCommand`, which takes any
 * message. Over the bridge only creative plugin actions exist; anything else is
 * refused here, in Studio, before it is even offered to Inspector.
 */
export function previewRequestFor(message: CommandMessage): BridgePreviewRequest | null {
  let value: unknown = message;
  if (typeof message === 'string') {
    try {
      value = JSON.parse(message);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const command = value as Record<string, unknown>;
  if (typeof command.plugin !== 'string' || typeof command.action !== 'string') return null;

  if (command.type === 'cmd:plugin:action') {
    const params = command.params;
    return {
      kind: 'send',
      plugin: command.plugin,
      action: command.action,
      params: params && typeof params === 'object' && !Array.isArray(params) ? (params as Record<string, unknown>) : {},
    };
  }
  if (command.type === 'cmd:plugin:action:cancel') {
    return { kind: 'cancel', plugin: command.plugin, action: command.action };
  }
  return null;
}
