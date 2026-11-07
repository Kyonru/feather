import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { selectProject, discoverCandidates, resolveConfiguredDir } = require('../out/project/selection.js');

const dirs = new Set(['/ws/a', '/ws/b', '/ws/b/game', '/ws/c', '/outside/game']);
const isDirectory = (path) => dirs.has(path);
const base = { workspaceRoots: ['/ws/a', '/ws/b'], candidates: [], isDirectory };

test('a configured feather.projectDir wins, resolved against the workspace, not the process cwd', () => {
  const selection = selectProject({ ...base, configured: 'game', candidates: ['/ws/a'] });
  assert.deepEqual(selection, { kind: 'resolved', root: '/ws/b/game', name: 'game', source: 'setting' });
  assert.equal(resolveConfiguredDir('/abs/x', ['/ws/a']), '/abs/x');
});

test('a configured folder that does not exist is a visible error, not a fallback', () => {
  const selection = selectProject({ ...base, configured: '/ws/missing', candidates: ['/ws/a'] });
  assert.equal(selection.kind, 'invalid-setting');
  assert.equal(selection.path, '/ws/missing');
});

test('a configured folder outside the workspace needs explicit acceptance', () => {
  assert.equal(selectProject({ ...base, configured: '/outside/game' }).kind, 'outside-workspace');
  const accepted = selectProject({ ...base, configured: '/outside/game', acceptedOutside: ['/outside/game'] });
  assert.deepEqual(accepted, { kind: 'resolved', root: '/outside/game', name: 'game', source: 'setting' });
});

test('several candidate folders require a choice instead of picking the first', () => {
  const selection = selectProject({ ...base, candidates: ['/ws/a', '/ws/b'] });
  assert.deepEqual(selection, { kind: 'needs-selection', candidates: ['/ws/a', '/ws/b'] });
  // The same folders in the other order give the same answer.
  assert.equal(selectProject({ ...base, workspaceRoots: ['/ws/b', '/ws/a'], candidates: ['/ws/b', '/ws/a'] }).kind, 'needs-selection');
});

test('the remembered choice is used while it is still inside the workspace', () => {
  assert.deepEqual(selectProject({ ...base, candidates: ['/ws/a', '/ws/b'], remembered: '/ws/b' }), {
    kind: 'resolved',
    root: '/ws/b',
    name: 'b',
    source: 'remembered',
  });
  // A folder removed from the workspace is not silently kept.
  assert.equal(selectProject({ ...base, candidates: ['/ws/a', '/ws/b'], remembered: '/ws/c' }).kind, 'needs-selection');
});

test('one candidate, or one folder with none, resolves without asking', () => {
  assert.equal(selectProject({ ...base, candidates: ['/ws/b'] }).root, '/ws/b');
  assert.deepEqual(selectProject({ ...base, workspaceRoots: ['/ws/c'], candidates: [] }), {
    kind: 'resolved',
    root: '/ws/c',
    name: 'c',
    source: 'only-folder',
  });
  assert.deepEqual(selectProject({ ...base, candidates: [] }), { kind: 'needs-selection', candidates: ['/ws/a', '/ws/b'] });
  assert.deepEqual(selectProject({ ...base, workspaceRoots: [] }), { kind: 'no-workspace' });
});

test('discovery finds main.lua in workspace folders and their direct children only', () => {
  const mains = new Set(['/ws/a', '/ws/b/game', '/ws/b/game/vendor/love-android']);
  const children = { '/ws/a': ['/ws/a/lib'], '/ws/b': ['/ws/b/game', '/ws/b/docs'] };
  const found = discoverCandidates(['/ws/a', '/ws/b'], (dir) => children[dir] ?? [], (dir) => mains.has(dir));
  assert.deepEqual(found, ['/ws/a', '/ws/b/game']);
});
