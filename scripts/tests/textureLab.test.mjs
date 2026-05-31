/* eslint-disable no-undef */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TEXTURE_LAB_RECIPE,
  defaultTextureLabRecipeForGenerator,
  normalizeTextureLabRecipe,
  renderTextureLabPixels,
  textureLabSplinePreset,
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

function alphaAt(result, x, y) {
  return result.pixels[(y * result.width + x) * 4 + 3];
}

function rgbaAt(result, x, y) {
  const offset = (y * result.width + x) * 4;
  return Array.from(result.pixels.slice(offset, offset + 4));
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
    backgroundColor: 'bad-color',
    backgroundAlpha: 9,
  });
  assert.equal(recipe.generator, DEFAULT_TEXTURE_LAB_RECIPE.generator);
  assert.equal(recipe.size, DEFAULT_TEXTURE_LAB_RECIPE.size);
  assert.equal(recipe.seed, 1);
  assert.equal(recipe.colorRamp, DEFAULT_TEXTURE_LAB_RECIPE.colorRamp);
  assert.equal(recipe.alphaMode, DEFAULT_TEXTURE_LAB_RECIPE.alphaMode);
  assert.equal(recipe.backgroundColor, '#000000');
  assert.equal(recipe.backgroundAlpha, 1);
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

test('background color composites behind transparent texture pixels', () => {
  const transparent = renderTextureLabPixels({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'soft-circle',
    size: 32,
    backgroundColor: '#336699',
    backgroundAlpha: 0,
  });
  const backed = renderTextureLabPixels({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'soft-circle',
    size: 32,
    backgroundColor: '#336699',
    backgroundAlpha: 1,
  });
  assert.equal(alphaAt(transparent, 0, 0), 0);
  assert.deepEqual(rgbaAt(backed, 0, 0), [51, 102, 153, 255]);
});

test('texture lab filenames include generator size and seed', () => {
  const recipe = normalizeTextureLabRecipe({ generator: 'comet-tail', size: 128, seed: 99 });
  assert.equal(textureLabFilename(recipe), 'comet-tail-128-99.png');
});

test('texture lab can reset a generator to its default values', () => {
  const recipe = defaultTextureLabRecipeForGenerator('spline-lightning');
  assert.equal(recipe.generator, 'spline-lightning');
  assert.equal(recipe.seed, DEFAULT_TEXTURE_LAB_RECIPE.seed);
  assert.equal(recipe.tileable, false);
  assert.equal(recipe.alphaMode, 'shape');
  assert.equal(recipe.spline.jitter, 0.5);
  assert.equal(recipe.spline.points.length, 5);
});

test('texture lab reset applies generator-specific alpha defaults', () => {
  assert.equal(defaultTextureLabRecipeForGenerator('soft-circle').alphaMode, 'shape');
  assert.equal(defaultTextureLabRecipeForGenerator('cloud-noise').alphaMode, 'luminance');
  assert.equal(defaultTextureLabRecipeForGenerator('radial-mask').alphaMode, 'luminance');
  assert.equal(defaultTextureLabRecipeForGenerator('dissolve-noise').alphaMode, 'inverted');
  assert.equal(defaultTextureLabRecipeForGenerator('threshold-noise-mask').alphaMode, 'inverted');
  assert.equal(defaultTextureLabRecipeForGenerator('spline-mask').alphaMode, 'luminance');
});

test('spline texture output is deterministic and point edits change the raster', () => {
  const recipe = normalizeTextureLabRecipe({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'spline-trail',
    seed: 123,
    size: 64,
    spline: textureLabSplinePreset('comet'),
  });
  const first = renderTextureLabPixels(recipe);
  const second = renderTextureLabPixels(recipe);
  const edited = renderTextureLabPixels({
    ...recipe,
    spline: {
      ...recipe.spline,
      points: recipe.spline.points.map((point, index) => (index === 1 ? { ...point, y: 0.8 } : point)),
    },
  });
  assert.equal(checksum(first.pixels), checksum(second.pixels));
  assert.notEqual(checksum(first.pixels), checksum(edited.pixels));
});

test('spline recipes normalize invalid points and clamp controls', () => {
  const recipe = normalizeTextureLabRecipe({
    generator: 'spline-ribbon',
    spline: {
      points: [{ x: -10, y: 2 }, { x: 0.5, y: 0.5 }, { x: Number.NaN, y: 0.4 }],
      closed: 'yes',
      strokeWidth: 99,
      feather: -1,
      taperStart: 8,
      taperEnd: -2,
      tension: 4,
      jitter: 6,
      samples: 999,
      overlapMode: 'not-real',
    },
  });
  assert.equal(recipe.spline.points.length, 2);
  assert.deepEqual(recipe.spline.points[0], { x: 0, y: 1 });
  assert.equal(recipe.spline.closed, false);
  assert.equal(recipe.spline.strokeWidth, 0.8);
  assert.equal(recipe.spline.feather, 0);
  assert.equal(recipe.spline.taperStart, 1);
  assert.equal(recipe.spline.taperEnd, 0);
  assert.equal(recipe.spline.tension, 1);
  assert.equal(recipe.spline.jitter, 1);
  assert.equal(recipe.spline.samples, 192);
  assert.equal(recipe.spline.overlapMode, 'merge');
});

test('spline overlap resolution can merge or stack crossing strokes', () => {
  const spline = {
    points: [
      { x: 0.14, y: 0.16 },
      { x: 0.86, y: 0.84 },
      { x: 0.14, y: 0.84 },
      { x: 0.86, y: 0.16 },
    ],
    closed: false,
    tension: 1,
    strokeWidth: 0.18,
    feather: 0.18,
    taperStart: 0,
    taperEnd: 0,
    jitter: 0,
    samples: 96,
  };
  const base = {
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'spline-ribbon',
    size: 64,
    falloff: 1,
    colorRamp: 'rainbow',
    spline,
  };
  const bridge = renderTextureLabPixels({ ...base, spline: { ...spline, overlapMode: 'bridge' } });
  const merge = renderTextureLabPixels({ ...base, spline: { ...spline, overlapMode: 'merge' } });
  const additive = renderTextureLabPixels({ ...base, spline: { ...spline, overlapMode: 'additive' } });
  assert.notEqual(checksum(bridge.pixels), checksum(merge.pixels));
  assert.notEqual(checksum(merge.pixels), checksum(additive.pixels));
  assert.ok(alphaAt(additive, 32, 32) >= alphaAt(merge, 32, 32));
});

test('spline taper narrows a trail endpoint compared with the middle', () => {
  const result = renderTextureLabPixels({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'spline-trail',
    size: 64,
    falloff: 1,
    spline: {
      points: [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }],
      closed: false,
      tension: 0,
      strokeWidth: 0.28,
      feather: 0.2,
      taperStart: 1,
      taperEnd: 0,
      jitter: 0,
      samples: 48,
    },
  });
  assert.ok(alphaAt(result, 32, 36) > alphaAt(result, 7, 36));
});

test('spline lightning jitter is deterministic for a seed', () => {
  const recipe = normalizeTextureLabRecipe({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'spline-lightning',
    seed: 88,
    spline: textureLabSplinePreset('lightning'),
  });
  const first = renderTextureLabPixels(recipe);
  const second = renderTextureLabPixels(recipe);
  const changed = renderTextureLabPixels({ ...recipe, seed: 89 });
  assert.equal(checksum(first.pixels), checksum(second.pixels));
  assert.notEqual(checksum(first.pixels), checksum(changed.pixels));
});
