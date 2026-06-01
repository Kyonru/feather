/* eslint-disable no-undef */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TEXTURE_LAB_RECIPE,
  TEXTURE_LAB_GENERATORS,
  defaultTextureLabRecipeForGenerator,
  normalizeTextureLabRecipe,
  renderTextureLabPixels,
  TEXTURE_LAB_SHAPE_PRESETS,
  textureLabShapePreset,
  textureLabShapeElement,
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
    solidColor: 'also-bad',
    backgroundColor: 'bad-color',
    backgroundAlpha: 9,
  });
  assert.equal(recipe.generator, DEFAULT_TEXTURE_LAB_RECIPE.generator);
  assert.equal(recipe.size, DEFAULT_TEXTURE_LAB_RECIPE.size);
  assert.equal(recipe.seed, 1);
  assert.equal(recipe.colorRamp, DEFAULT_TEXTURE_LAB_RECIPE.colorRamp);
  assert.equal(recipe.alphaMode, DEFAULT_TEXTURE_LAB_RECIPE.alphaMode);
  assert.equal(recipe.solidColor, '#ffffff');
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

test('solid color ramp uses the selected color', () => {
  const result = renderTextureLabPixels({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'soft-circle',
    size: 32,
    colorRamp: 'solid',
    solidColor: '#336699',
  });
  const center = rgbaAt(result, 16, 16);
  assert.deepEqual(center.slice(0, 3), [51, 102, 153]);
  assert.ok(center[3] > 200);
});

test('texture lab filenames include generator size and seed', () => {
  const recipe = normalizeTextureLabRecipe({ generator: 'rain-slash', size: 128, seed: 99 });
  assert.equal(textureLabFilename(recipe), 'rain-slash-128-99.png');
});

test('hardcoded comet tail and slash generators are removed in favor of spline presets', () => {
  const generatorIds = TEXTURE_LAB_GENERATORS.map((generator) => generator.id);
  assert.ok(!generatorIds.includes('comet-tail'));
  assert.ok(!generatorIds.includes('slash'));
  assert.equal(normalizeTextureLabRecipe({ generator: 'comet-tail' }).generator, DEFAULT_TEXTURE_LAB_RECIPE.generator);
  assert.equal(normalizeTextureLabRecipe({ generator: 'slash' }).generator, DEFAULT_TEXTURE_LAB_RECIPE.generator);
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

test('shape composer normalizes layers, points, repeat controls, and selection', () => {
  const recipe = normalizeTextureLabRecipe({
    generator: 'shape-composer',
    shape: {
      selectedLayerId: 'missing',
      layers: Array.from({ length: 10 }, (_, index) => ({
        id: `layer-${index}`,
        kind: index === 0 ? 'not-real' : 'polygon',
        points: [{ x: -1, y: 3 }],
        repeat: { mode: 'scatter', count: 999, radius: 4, jitter: 2, rotationVariance: 9, scaleVariance: 9 },
      })),
    },
  });
  assert.equal(recipe.shape.layers.length, 8);
  assert.equal(recipe.shape.selectedLayerId, 'layer-0');
  assert.equal(recipe.shape.layers[0].kind, 'polygon');
  assert.ok(recipe.shape.layers[0].points.length >= 3);
  assert.equal(recipe.shape.layers[0].repeat.count, 64);
  assert.equal(recipe.shape.layers[0].repeat.radius, 1);
  assert.equal(recipe.shape.layers[0].repeat.jitter, 1);
});

test('shape composer renders deterministic layered polygons and respects enabled state', () => {
  const recipe = normalizeTextureLabRecipe({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'shape-composer',
    seed: 404,
    shape: textureLabShapePreset('hex-badge'),
  });
  const first = renderTextureLabPixels(recipe);
  const second = renderTextureLabPixels(recipe);
  const disabled = renderTextureLabPixels({
    ...recipe,
    shape: { ...recipe.shape, layers: recipe.shape.layers.map((layer) => ({ ...layer, enabled: false })) },
  });
  assert.equal(checksum(first.pixels), checksum(second.pixels));
  assert.notEqual(checksum(first.pixels), checksum(disabled.pixels));
  assert.ok(alphaAt(first, 32, 32) > alphaAt(disabled, 32, 32));
});

test('shape composer fill and stroke colors render distinctly', () => {
  const recipe = normalizeTextureLabRecipe({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'shape-composer',
    size: 64,
    shape: {
      selectedLayerId: 'rect',
      layers: [
        {
          id: 'rect',
          kind: 'rect',
          label: 'Rect',
          x: 0.5,
          y: 0.5,
          size: 0.7,
          rotation: 0,
          opacity: 1,
          fillColor: '#ff0000',
          strokeColor: '#0000ff',
          strokeWidth: 0.12,
          feather: 0.01,
          blendMode: 'normal',
          enabled: true,
          sides: 4,
          innerRadius: 0.5,
          cornerRoundness: 0,
          repeat: { mode: 'none', count: 1, spacing: 0.1, radius: 0.1, seedOffset: 0, rotationVariance: 0, scaleVariance: 0, jitter: 0 },
        },
      ],
    },
  });
  const result = renderTextureLabPixels(recipe);
  const center = rgbaAt(result, 32, 32);
  const edge = rgbaAt(result, 52, 32);
  assert.ok(center[0] > 220 && center[2] < 40);
  assert.ok(edge[2] > edge[0]);
});

test('shape composer stroke and feather affect edge alpha', () => {
  const base = normalizeTextureLabRecipe({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'shape-composer',
    size: 64,
    shape: textureLabShapePreset('triangle'),
  });
  const noStroke = renderTextureLabPixels({
    ...base,
    shape: { ...base.shape, layers: base.shape.layers.map((layer) => ({ ...layer, strokeWidth: 0, feather: 0 })) },
  });
  const softStroke = renderTextureLabPixels({
    ...base,
    shape: { ...base.shape, layers: base.shape.layers.map((layer) => ({ ...layer, strokeWidth: 0.16, feather: 0.18 })) },
  });
  assert.notEqual(checksum(noStroke.pixels), checksum(softStroke.pixels));
  assert.ok(alphaAt(softStroke, 12, 48) >= alphaAt(noStroke, 12, 48));
});

test('shape composer repeat modes are deterministic and seed-aware', () => {
  for (const mode of ['grid', 'radial', 'scatter']) {
    const recipe = normalizeTextureLabRecipe({
      ...DEFAULT_TEXTURE_LAB_RECIPE,
      generator: 'shape-composer',
      seed: 51,
      shape: {
        selectedLayerId: mode,
        layers: [
          {
            ...textureLabShapePreset('scatter-dots').layers[0],
            id: mode,
            repeat: {
              mode,
              count: 12,
              spacing: 0.2,
              radius: 0.38,
              seedOffset: 3,
              rotationVariance: 0.5,
              scaleVariance: 0.4,
              jitter: 0.08,
            },
          },
        ],
      },
    });
    const first = renderTextureLabPixels(recipe);
    const second = renderTextureLabPixels(recipe);
    const changedSeed = renderTextureLabPixels({ ...recipe, seed: 52 });
    assert.equal(checksum(first.pixels), checksum(second.pixels));
    assert.notEqual(checksum(first.pixels), checksum(changedSeed.pixels));
  }
});

test('shape composer presets are available', () => {
  const presetIds = TEXTURE_LAB_SHAPE_PRESETS.map((preset) => preset.id);
  assert.deepEqual(presetIds, [
    'triangle',
    'hex-badge',
    'starburst',
    'ring-sigil',
    'scatter-dots',
    'pixel-confetti',
    'soft-polygon-mask',
  ]);
});

test('shape composer spline layers render edited spline points', () => {
  const splineLayer = textureLabShapeElement('spline', { id: 'spline-layer' });
  const recipe = normalizeTextureLabRecipe({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'shape-composer',
    seed: 1337,
    size: 64,
    shape: {
      selectedLayerId: 'spline-layer',
      layers: [splineLayer],
    },
  });
  const edited = normalizeTextureLabRecipe({
    ...recipe,
    shape: {
      selectedLayerId: 'spline-layer',
      layers: [
        {
          ...splineLayer,
          spline: {
            ...splineLayer.spline,
            points: splineLayer.spline.points.map((point, index) =>
              index === 1 ? { x: Math.min(1, point.x + 0.08), y: Math.max(0, point.y - 0.06) } : point,
            ),
          },
        },
      ],
    },
  });
  assert.notEqual(checksum(renderTextureLabPixels(recipe).pixels), checksum(renderTextureLabPixels(edited).pixels));
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

test('comet and slash spline presets remain deterministic texture starting points', () => {
  const cometSpline = textureLabSplinePreset('comet');
  assert.equal(cometSpline.points.length, 4);
  assert.equal(cometSpline.overlapMode, 'merge');
  assert.ok(cometSpline.strokeWidth > 0.2);
  assert.equal(cometSpline.taperEnd, 0);

  const comet = normalizeTextureLabRecipe({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'spline-trail',
    seed: 712,
    spline: cometSpline,
  });
  const slash = normalizeTextureLabRecipe({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator: 'spline-trail',
    seed: 712,
    spline: textureLabSplinePreset('slash'),
  });
  assert.equal(checksum(renderTextureLabPixels(comet).pixels), checksum(renderTextureLabPixels(comet).pixels));
  assert.equal(checksum(renderTextureLabPixels(slash).pixels), checksum(renderTextureLabPixels(slash).pixels));
  assert.notEqual(checksum(renderTextureLabPixels(comet).pixels), checksum(renderTextureLabPixels(slash).pixels));
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
