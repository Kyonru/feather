import assert from 'node:assert/strict';
import test from 'node:test';
import { strFromU8, unzipSync } from 'fflate';

import { particleProjectZipEntries } from '../../apps/studio/src/tools/particle-system-playground/artifacts.ts';
import type { ParticleSystemPlaygroundData } from '../../apps/studio/src/types/particle-system-playground.ts';

test('particle project Lua points at the texture path packaged in its ZIP', () => {
  const data = {
    type: 'particle-system-playground',
    composites: ['Smoke'],
    activeComposite: 'Smoke',
    activeSystem: 1,
    data: {
      x: 0,
      y: 0,
      previewEnabled: true,
      movement: { pattern: 'none' },
      systems: [{
        index: 1,
        title: 'Emitter',
        enabled: true,
        blendMode: 'alpha',
        x: 0,
        y: 0,
        emitAtStart: 0,
        texturePath: '',
        texturePreset: '',
        textureFilename: 'smoke.png',
        textureAssetBase64: 'AQID',
        shaderPath: '',
        shaderFilename: '',
        shaderSource: '',
        properties: { bufferSize: 128, emissionRate: 10 },
      }],
    },
  } as unknown as ParticleSystemPlaygroundData;

  const entries = unzipSync(particleProjectZipEntries(data));
  assert.deepEqual([...entries['textures/smoke.png']], [1, 2, 3]);
  const luaName = Object.keys(entries).find((name) => name.endsWith('.lua'));
  assert.ok(luaName);
  assert.match(strFromU8(entries[luaName!]), /\["texturePath"\] = "textures\/smoke\.png"/);
  assert.doesNotMatch(strFromU8(entries[luaName!]), /textureAssetBase64/);
});
