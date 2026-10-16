import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * An incompatible wire protocol must stop commands, not only be reported.
 * See apps/docs/architecture.md, "Runtime and session reliability."
 */

const { evaluateProtocol } = await import('../../apps/inspector/src/constants/feather-protocol.ts');
const gate = await import('../../apps/inspector/src/lib/protocol-gate.ts');

test('a session speaking a protocol this build cannot is read-only, and says why', () => {
  gate.resetProtocolGate();
  gate.recordSessionProtocol('s1', evaluateProtocol(99));
  assert.equal(gate.isSessionReadOnly('s1'), true);
  assert.throws(
    () => gate.assertSessionAcceptsCommands('s1'),
    (error: unknown) =>
      error instanceof gate.ProtocolIncompatibleError &&
      /v99/.test(error.message) &&
      /Update the Feather desktop app/.test(error.message),
  );
});

test('compatible and legacy sessions accept commands', () => {
  gate.resetProtocolGate();
  gate.recordSessionProtocol('ok', evaluateProtocol(1));
  gate.recordSessionProtocol('legacy', evaluateProtocol(undefined));
  assert.doesNotThrow(() => gate.assertSessionAcceptsCommands('ok'));
  assert.doesNotThrow(() => gate.assertSessionAcceptsCommands('legacy'));
  assert.doesNotThrow(() => gate.assertSessionAcceptsCommands('never-seen'));
});

test('one session being incompatible does not affect another', () => {
  gate.resetProtocolGate();
  gate.recordSessionProtocol('old', evaluateProtocol(0));
  assert.equal(gate.isSessionReadOnly('old'), true);
  assert.equal(gate.isSessionReadOnly('other'), false);
});

test('a later compatible hello lifts the restriction', () => {
  gate.resetProtocolGate();
  gate.recordSessionProtocol('s', evaluateProtocol(99));
  gate.recordSessionProtocol('s', evaluateProtocol(1));
  assert.equal(gate.isSessionReadOnly('s'), false);
});
