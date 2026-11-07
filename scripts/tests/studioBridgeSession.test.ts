import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chooseSessionSelection,
  previewRequestFor,
} from '../../apps/studio/src/session/bridge-session.ts';

const sessions = [
  { id: 'old', name: 'Old run', connectedAt: 10 },
  { id: 'new', name: 'New run', connectedAt: 20 },
];

test('Studio keeps an explicit bridge scope and never guesses between games', () => {
  assert.equal(chooseSessionSelection({ sessions, scoped: 'new', remembered: 'old' }), 'new');
  assert.equal(chooseSessionSelection({ sessions, scoped: null, remembered: null }), null);
});

test('a remembered game is reused only while that exact run is connected', () => {
  assert.equal(chooseSessionSelection({ sessions, scoped: null, remembered: 'old' }), 'old');
  assert.equal(chooseSessionSelection({ sessions: [sessions[1]], scoped: null, remembered: 'old' }), 'new');
});

test('only creative plugin actions cross the Studio bridge', () => {
  assert.deepEqual(
    previewRequestFor({
      type: 'cmd:plugin:action',
      plugin: 'shader-graph',
      action: 'preview-shader',
      params: { pixelSource: 'vec4 effect(){}' },
    }),
    {
      kind: 'send',
      plugin: 'shader-graph',
      action: 'preview-shader',
      params: { pixelSource: 'vec4 effect(){}' },
    },
  );
  assert.equal(previewRequestFor({ type: 'cmd:eval', code: 'os.exit()' }), null);
  assert.equal(previewRequestFor('not json'), null);
});
