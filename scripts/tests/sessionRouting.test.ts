import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * One session's events must not change another's.
 * See apps/docs/architecture.md, "Runtime and session reliability."
 */

const { shouldActivateOnHello, endSessionState } = await import('../../apps/inspector/src/store/session.ts');

const live = (id: string, extra = {}) => ({ id, connected: true, connectedAt: 1, ...extra });

test('a second game connecting does not take the view from the game being debugged', () => {
  const sessions = { a: live('a'), b: live('b', { pendingConfig: true }) };
  assert.equal(shouldActivateOnHello('a', sessions, 'b'), false);
});

test('a hello takes the view when nothing usable is active', () => {
  assert.equal(shouldActivateOnHello(null, {}, 'b'), true, 'no active session');
  assert.equal(shouldActivateOnHello('a', { a: live('a') }, 'a'), true, 'the active session itself');
  assert.equal(shouldActivateOnHello('a', { a: live('a', { connected: false }) }, 'b'), true, 'active one disconnected');
  assert.equal(shouldActivateOnHello('a', { a: live('a', { pendingConfig: true }) }, 'b'), true, 'active one still connecting');
  assert.equal(shouldActivateOnHello('gone', {}, 'b'), true, 'active id unknown');
});

test('a background session ending leaves the active session alone', () => {
  const next = endSessionState({ sessionId: 'a', sessions: { a: live('a'), b: live('b') } }, 'b');
  assert.equal(next.sessionId, 'a');
  assert.equal(next.sessions.a.connected, true);
  assert.equal(next.sessions.b.connected, false);
});

test('the active session ending clears it and marks it disconnected', () => {
  const next = endSessionState({ sessionId: 'a', sessions: { a: live('a'), b: live('b') } }, 'a');
  assert.equal(next.sessionId, null);
  assert.equal(next.sessions.a.connected, false);
  assert.equal(next.sessions.b.connected, true);
});
