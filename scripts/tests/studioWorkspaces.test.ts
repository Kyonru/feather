import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FIRST_WORKSPACE_ID,
  LEGACY_PARTICLE_KEY,
  adoptLegacyWorkspace,
  nextWorkspaceName,
  normalizeWorkspaceRegistry,
  toolKey,
  workspaceKeys,
} from '../../apps/studio/src/store/workspace-registry.ts';

test('the first Studio workspace adopts every pre-workspace tool key', () => {
  const workspace = adoptLegacyWorkspace(
    {
      shaderGraphId: 'old-graph',
      textureLabId: 'old-textures',
      particleIds: [LEGACY_PARTICLE_KEY],
    },
    123,
  );

  assert.equal(workspace.id, FIRST_WORKSPACE_ID);
  assert.equal(workspace.createdAt, 123);
  assert.deepEqual(workspaceKeys(workspace), {
    shaderGraph: 'old-graph',
    textureLab: 'old-textures',
    particles: LEGACY_PARTICLE_KEY,
  });
});

test('workspace registry coercion drops malformed and duplicate external data', () => {
  const fallback = () => ({ id: 'fallback', name: 'Fallback', createdAt: 1 });
  const registry = normalizeWorkspaceRegistry(
    {
      activeId: 'missing',
      workspaces: [
        { id: '../escape', name: 'unsafe' },
        { id: 'valid', name: '   My    Effect   ', createdAt: '42', toolKeys: { particles: 'particles:one' } },
        { id: 'valid', name: 'duplicate' },
        null,
      ],
    },
    fallback,
  );

  assert.deepEqual(registry, {
    activeId: 'valid',
    workspaces: [
      {
        id: 'valid',
        name: 'My Effect',
        createdAt: 42,
        toolKeys: { particles: 'particles:one' },
      },
    ],
  });
});

test('an unusable persisted registry always yields one usable workspace', () => {
  const registry = normalizeWorkspaceRegistry({ activeId: 7, workspaces: [{ id: '' }] }, () => ({
    id: 'adopted',
    name: 'Recovered work',
    createdAt: 9,
  }));

  assert.equal(registry.activeId, 'adopted');
  assert.equal(registry.workspaces.length, 1);
  assert.equal(toolKey(registry.workspaces[0], 'shaderGraph'), 'adopted');
});

test('new workspace names skip names that already exist', () => {
  assert.equal(
    nextWorkspaceName([
      { id: 'a', name: 'Workspace 2', createdAt: 1 },
      { id: 'b', name: 'workspace 3', createdAt: 2 },
    ]),
    'Workspace 4',
  );
});
