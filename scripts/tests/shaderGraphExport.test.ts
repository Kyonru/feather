import assert from 'node:assert/strict';
import test from 'node:test';

import { shaderBundleEntries } from '../../apps/studio/src/tools/shader-graph/export-bundle.ts';

test('shader export bundle contains both stages, binding metadata and referenced texture bytes', () => {
  const entries = shaderBundleEntries({
    shaderName: 'Test Water',
    playgroundTarget: { composite: 'Rain', systemIndex: 2 },
    generated: {
      pixel: 'pixel source',
      vertex: 'vertex source',
      hash: 'hash',
      textures: [{ nodeId: 'image-a', uniform: 'u_noise', label: 'Noise' }],
      parameters: [{ nodeId: 'time-a', label: 'Time', uniform: 'u_time', type: 'float', defaultValue: 1 }],
    },
    textureUploads: { 'image-a': { filename: 'noise.png', dataBase64: 'AQID' } },
  });

  assert.equal(new TextDecoder().decode(entries['pixel.glsl']), 'pixel source');
  assert.equal(new TextDecoder().decode(entries['vertex.glsl']), 'vertex source');
  const manifest = JSON.parse(new TextDecoder().decode(entries['manifest.json'])) as {
    textures: Array<{ nodeId: string; uniform: string; file: string }>;
    parameters: Array<{ uniform: string }>;
    playgroundTarget: { composite: string; systemIndex: number };
  };
  assert.deepEqual(manifest.textures, [{ nodeId: 'image-a', uniform: 'u_noise', label: 'Noise', file: 'textures/image-a_noise.png' }]);
  assert.equal(manifest.parameters[0].uniform, 'u_time');
  assert.deepEqual(manifest.playgroundTarget, { composite: 'Rain', systemIndex: 2 });
  assert.deepEqual([...entries['textures/image-a_noise.png']], [1, 2, 3]);
});
