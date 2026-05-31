/* eslint-disable no-undef */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TEXTURE_LAB_RECIPE,
  normalizeTextureLabRecipe,
  renderTextureLabPixels,
  textureLabFilename,
} from '../../src/pages/texture-lab/generator.ts';

function checksum(pixels) {
  let hash = 2166136261;
  for (const byte of pixels) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

test('texture lab output is deterministic for a recipe', () => {
  const recipe = { ...DEFAULT_TEXTURE_LAB_RECIPE, generator: 'smoke-puff', seed: 42, size: 64 };
  const first = renderTextureLabPixels(recipe);
  const second = renderTextureLabPixels(recipe);
  assert.equal(first.width, 64);
  assert.equal(first.height, 64);
  assert.equal(first.pixels.length, 64 * 64 * 4);
  assert.equal(checksum(first.pixels), checksum(second.pixels));
});

test('texture lab normalizes unknown persisted values', () => {
  const recipe = normalizeTextureLabRecipe({
    generator: 'not-real',
    size: 999,
    seed: -10,
    colorRamp: 'unknown',
    alphaMode: 'nope',
  });
  assert.equal(recipe.generator, DEFAULT_TEXTURE_LAB_RECIPE.generator);
  assert.equal(recipe.size, DEFAULT_TEXTURE_LAB_RECIPE.size);
  assert.equal(recipe.seed, 1);
  assert.equal(recipe.colorRamp, DEFAULT_TEXTURE_LAB_RECIPE.colorRamp);
  assert.equal(recipe.alphaMode, DEFAULT_TEXTURE_LAB_RECIPE.alphaMode);
});

test('tileable noise repeats texture edges', () => {
  const result = renderTextureLabPixels({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'cloud-noise',
    size: 32,
    seed: 75,
    tileable: true,
  });
  const left = (y) => (y * result.width) * 4;
  const right = (y) => (y * result.width + result.width - 1) * 4;
  for (let y = 0; y < result.height; y += 1) {
    assert.equal(result.pixels[left(y)], result.pixels[right(y)]);
    assert.equal(result.pixels[left(y) + 1], result.pixels[right(y) + 1]);
    assert.equal(result.pixels[left(y) + 2], result.pixels[right(y) + 2]);
  }
});

test('alpha modes control transparency', () => {
  const transparent = renderTextureLabPixels({ ...DEFAULT_TEXTURE_LAB_RECIPE, generator: 'soft-circle', alphaMode: 'shape' });
  const opaque = renderTextureLabPixels({ ...DEFAULT_TEXTURE_LAB_RECIPE, generator: 'soft-circle', alphaMode: 'opaque' });
  const transparentAlpha = Array.from({ length: transparent.width * transparent.height }, (_, index) => transparent.pixels[index * 4 + 3]);
  const opaqueAlpha = Array.from({ length: opaque.width * opaque.height }, (_, index) => opaque.pixels[index * 4 + 3]);
  assert.ok(transparentAlpha.some((alpha) => alpha < 255));
  assert.ok(opaqueAlpha.every((alpha) => alpha === 255));
});

test('texture lab filenames include generator size and seed', () => {
  const recipe = normalizeTextureLabRecipe({ generator: 'comet-tail', size: 128, seed: 99 });
  assert.equal(textureLabFilename(recipe), 'comet-tail-128-99.png');
});
