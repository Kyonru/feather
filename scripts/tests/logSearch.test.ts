import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * Searching the logs must not be able to crash the panel.
 *
 * Reported: `TypeError: undefined is not an object (evaluating
 * 'log.str.toLowerCase')` while typing in the log search. The `Log` schema
 * declared `str: z.string()`, but nothing ever validated against it — logs were
 * cast, not parsed — so any runtime that omitted the field produced a `Log`
 * whose `str` was `undefined`, and the first keystroke in the search box took
 * the whole panel down.
 *
 * Searching is the worst place to be fragile: it is what someone reaches for
 * when the output already looks wrong.
 *
 * See skills/feather-desktop-app/references/design-rules.md §6.3 (6.1).
 */

const { schema } = await import('../../apps/inspector/src/hooks/use-logs.ts');
// The shipped function, not a copy of it: a mirrored helper would keep passing
// after the real one regressed, which is the failure mode this test exists to
// prevent.
const { searchableText } = await import('../../apps/inspector/src/pages/log/search.ts');

test('a log with no message does not break the search', () => {
  const log = { id: '1', count: 1, time: 0, type: 'output' } as { str?: unknown; type?: unknown };
  assert.doesNotThrow(() => searchableText(log));
  assert.equal(searchableText(log).includes('output'), true, 'the type is still searchable');
});

test('a log whose message is not a string does not break the search', () => {
  // Seen in practice when a runtime sends a structured payload rather than text.
  for (const str of [undefined, null, 42, { message: 'hi' }, ['a']]) {
    assert.doesNotThrow(() => searchableText({ str, type: 'error' }), `str=${JSON.stringify(str)}`);
  }
});

test('normal logs still match on message and on type', () => {
  const log = { str: 'Collision with WALL', type: 'error' };
  assert.equal(searchableText(log).includes('collision'), true);
  assert.equal(searchableText(log).includes('wall'), true);
  assert.equal(searchableText(log).includes('error'), true);
  assert.equal(searchableText(log).includes('missing'), false);
});

test('the schema fills in the fields it used to only promise', () => {
  // The type said `str: string` while nothing enforced it. Parsing now makes
  // that true rather than aspirational.
  const parsed = schema.safeParse({ id: '1', count: 1, time: 0, type: 'output' });
  assert.equal(parsed.success, true, 'a log without str/trace is still a valid log');
  assert.equal(parsed.success && parsed.data.str, '');
  assert.equal(parsed.success && parsed.data.trace, '');
});

test('a log missing its identity is still rejected', () => {
  // Tolerant about the message, not about everything: an entry with no id
  // cannot be deduplicated or merged, so it is not a log.
  assert.equal(schema.safeParse({ count: 1, time: 0, type: 'output' }).success, false);
});
