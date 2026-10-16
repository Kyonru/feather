import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * C2: a panel must be able to say whether what it is showing is from this run.
 *
 * The judgement is deliberately not "is it old". A value from 40 seconds ago is
 * fine when the game has been up an hour and wrong when it restarted 5 seconds
 * ago — so the comparison is against when the session connected, not the clock.
 *
 * See V4.md §6.2 (C2).
 */

const { isFromPreviousRun, describeAge } = await import('../../apps/inspector/src/hooks/use-freshness.ts');

test('data older than the attached session is from a previous run', () => {
  const connectedAt = 1_000_000;
  assert.equal(isFromPreviousRun(connectedAt - 1, connectedAt), true, 'one millisecond older still predates it');
  assert.equal(isFromPreviousRun(connectedAt - 600_000, connectedAt), true);
});

test('data that arrived after the session connected is current', () => {
  const connectedAt = 1_000_000;
  assert.equal(isFromPreviousRun(connectedAt, connectedAt), false, 'same instant is not stale');
  assert.equal(isFromPreviousRun(connectedAt + 1, connectedAt), false);
});

test('age alone never makes data stale', () => {
  // A long-running game with a quiet panel is not showing stale data, and
  // saying so would train people to ignore the warning.
  const connectedAt = 1_000_000;
  const hoursLater = connectedAt + 6 * 60 * 60 * 1000;
  assert.equal(isFromPreviousRun(hoursLater, connectedAt), false);
});

test('freshness is unknown rather than stale when there is no session or no data', () => {
  assert.equal(isFromPreviousRun(null, 1_000_000), false, 'never-loaded is not stale');
  assert.equal(isFromPreviousRun(1_000_000, null), false, 'no session means no claim');
  assert.equal(isFromPreviousRun(1_000_000, undefined), false);
});

test('ages read as something a person would say', () => {
  assert.equal(describeAge(0), 'just now');
  assert.equal(describeAge(2_999), 'just now', 'sub-3s does not churn a per-second number');
  assert.equal(describeAge(12_000), '12s ago');
  assert.equal(describeAge(4 * 60_000), '4m ago');
  assert.equal(describeAge(3 * 60 * 60_000), '3h ago');
});
