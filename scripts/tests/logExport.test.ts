import assert from 'node:assert/strict';
import test from 'node:test';

import { serializeFeatherLogs } from '../../apps/inspector/src/pages/log/export.ts';

test('filtered log export writes reloadable newline-delimited Feather logs', () => {
  const logs = [
    { id: 'one', type: 'output', str: 'visible', count: 1, time: 1, trace: '' },
    { id: 'two', type: 'error', str: 'also visible', count: 2, time: 2, trace: 'main.lua:2' },
  ];

  const exported = serializeFeatherLogs(logs);
  assert.equal(exported.endsWith('\n'), true);
  assert.deepEqual(
    exported.trimEnd().split('\n').map((line) => JSON.parse(line)),
    logs,
  );
});
