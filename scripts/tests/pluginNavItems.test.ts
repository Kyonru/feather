import assert from 'node:assert/strict';
import test from 'node:test';

/**
 * The sidebar must survive a third-party plugin's manifest.
 *
 * `tabName` and `icon` are written in someone else's Lua and arrive through a
 * config payload nothing validates. The old truthiness gate admitted any truthy
 * value, so `tabName = 1234` produced an item whose name was a number — and
 * sorting called `.localeCompare` on it while the plugin search called
 * `.toLowerCase()`. This list is the sidebar, so one odd manifest took
 * navigation down for the whole app.
 *
 * See V4.md §6.3 (6.7, C5).
 */

const { pluginNavItems } = await import('../../apps/inspector/src/components/app-sidebar/plugin-nav-items.ts');

test('a well-formed manifest produces a usable entry', () => {
  const items = pluginNavItems({ physics: { tabName: 'Physics Debug', icon: 'activity' } });
  assert.deepEqual(items, [
    { id: 'physics', name: 'Physics Debug', url: '/plugins/physics', icon: 'activity', disabled: false },
  ]);
});

test('a name that is not a string cannot break the list', () => {
  for (const tabName of [1234, true, { label: 'x' }, ['a']]) {
    const items = pluginNavItems({ odd: { tabName } });
    assert.equal(items.length, 1, `dropped the plugin for tabName=${JSON.stringify(tabName)}`);
    assert.equal(typeof items[0].name, 'string');
    // The operations that used to throw.
    assert.doesNotThrow(() => items[0].name.toLowerCase());
    assert.doesNotThrow(() => [...items].sort((a, b) => a.name.localeCompare(b.name)));
  }
});

test('one odd manifest does not hide the well-behaved plugins beside it', () => {
  // The failure that mattered was not the odd entry rendering badly, it was the
  // whole list going down with it.
  const items = pluginNavItems({
    'odd-manifest': { tabName: 1234 },
    'well-behaved': { tabName: 'Physics Debug' },
  });
  assert.equal(items.length, 2);
  assert.ok(items.some((item) => item.name === 'Physics Debug'));
});

test('entries without a tab name are skipped, as before', () => {
  // Unchanged behaviour: a plugin that declares no tab does not want one.
  assert.deepEqual(pluginNavItems({ headless: { icon: 'plug' } }), []);
  assert.deepEqual(pluginNavItems({ blank: { tabName: '' } }), []);
});

test('a malformed plugins payload is empty rather than fatal', () => {
  assert.deepEqual(pluginNavItems(undefined), []);
  assert.deepEqual(pluginNavItems({} as Record<string, unknown>), []);
  assert.deepEqual(pluginNavItems({ nope: null } as unknown as Record<string, unknown>), []);
  assert.deepEqual(pluginNavItems({ nope: 'a string' } as unknown as Record<string, unknown>), []);
});

test('an icon that is not a string is dropped rather than passed through', () => {
  // It reaches an icon component expecting a name; a number there is a second
  // crash waiting behind the first.
  const [item] = pluginNavItems({ odd: { tabName: 'Odd', icon: 99 } });
  assert.equal(item.icon, undefined);
});
