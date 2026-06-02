/* eslint-disable no-undef */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TEXTURE_LAB_RECIPE,
  TEXTURE_LAB_GENERATORS,
  defaultTextureLabRecipeForGenerator,
  normalizeTextureLabRecipe,
  normalizeTextureLabSavedRecipes,
  normalizeTextureLabAtlasSettings,
  textureLabMaterializeAtlasFrames,
  textureLabAtlasFrameRecipe,
  renderTextureLabCustomAtlasPixels,
  renderTextureLabAtlasPixels,
  renderTextureLabPixels,
  TEXTURE_LAB_SHAPE_PRESETS,
  TEXTURE_LAB_SAVED_RECIPE_LIMIT,
  textureLabShapePreset,
  textureLabShapeElement,
  textureLabSplinePreset,
  textureLabFilename,
  TEXTURE_LAB_SHADER_MAP_GENERATOR_IDS,
  isTextureLabShaderMapGenerator,
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

test('texture lab supports tiny presets and custom rectangular dimensions', () => {
  for (const size of [4, 8, 16]) {
    const tiny = renderTextureLabPixels({ ...DEFAULT_TEXTURE_LAB_RECIPE, size, width: size, height: size });
    assert.equal(tiny.width, size);
    assert.equal(tiny.height, size);
    assert.equal(tiny.pixels.length, size * size * 4);
  }

  const custom = normalizeTextureLabRecipe({ generator: 'rain-slash', size: 48, width: 48, height: 12, seed: 21 });
  const result = renderTextureLabPixels(custom);
  assert.equal(result.width, 48);
  assert.equal(result.height, 12);
  assert.equal(result.pixels.length, 48 * 12 * 4);
  assert.equal(textureLabFilename(custom), 'rain-slash-48x12-21.png');
});

test('texture lab normalizes unknown persisted values', () => {
  const recipe = normalizeTextureLabRecipe({
    generator: 'not-real',
    size: 'not-a-size',
    width: 9999,
    height: -5,
    seed: -10,
    colorRamp: 'unknown',
    alphaMode: 'nope',
    solidColor: 'also-bad',
    backgroundColor: 'bad-color',
    backgroundAlpha: 9,
  });
  assert.equal(recipe.generator, DEFAULT_TEXTURE_LAB_RECIPE.generator);
  assert.equal(recipe.size, DEFAULT_TEXTURE_LAB_RECIPE.size);
  assert.equal(recipe.width, 1024);
  assert.equal(recipe.height, 1);
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

test('texture lab exposes shader map generators with opaque reset defaults', () => {
  const generatorById = new Map(TEXTURE_LAB_GENERATORS.map((generator) => [generator.id, generator]));
  assert.deepEqual(TEXTURE_LAB_SHADER_MAP_GENERATOR_IDS, [
    'normal-from-height',
    'flow-map',
    'radial-swirl-flow',
    'water-ripple-normal',
    'directional-distortion-map',
  ]);

  for (const generatorId of TEXTURE_LAB_SHADER_MAP_GENERATOR_IDS) {
    const metadata = generatorById.get(generatorId);
    const recipe = defaultTextureLabRecipeForGenerator(generatorId);
    assert.equal(metadata?.category, 'Shader maps');
    assert.equal(isTextureLabShaderMapGenerator(generatorId), true);
    assert.equal(recipe.alphaMode, 'opaque');
    assert.equal(recipe.colorRamp, 'white');
  }
  assert.equal(defaultTextureLabRecipeForGenerator('radial-swirl-flow').tileable, false);
});

test('texture lab shader normal maps encode opaque RGB normals', () => {
  const result = renderTextureLabPixels({
    ...defaultTextureLabRecipeForGenerator('normal-from-height'),
    size: 32,
    width: 32,
    height: 32,
    seed: 91,
  });
  const samples = [
    rgbaAt(result, 4, 4),
    rgbaAt(result, 12, 18),
    rgbaAt(result, 24, 10),
    rgbaAt(result, 28, 28),
  ];
  assert.ok(samples.every((sample) => sample[3] === 255));
  assert.ok(samples.every((sample) => sample[2] > 150));
  assert.ok(new Set(samples.map((sample) => `${sample[0]}:${sample[1]}`)).size > 1);
});

test('texture lab flow and distortion maps encode signed vectors in color channels', () => {
  for (const generator of ['flow-map', 'radial-swirl-flow', 'directional-distortion-map']) {
    const result = renderTextureLabPixels({
      ...defaultTextureLabRecipeForGenerator(generator),
      size: 32,
      width: 32,
      height: 32,
      seed: 45,
    });
    const samples = [
      rgbaAt(result, 5, 5),
      rgbaAt(result, 16, 16),
      rgbaAt(result, 26, 22),
    ];
    assert.ok(samples.every((sample) => sample[3] === 255));
    assert.ok(samples.some((sample) => Math.abs(sample[0] - 128) > 8 || Math.abs(sample[1] - 128) > 8));
    assert.ok(new Set(samples.map((sample) => `${sample[0]}:${sample[1]}:${sample[2]}`)).size > 1);
  }
});

test('tileable shader maps repeat texture edges', () => {
  for (const generator of ['normal-from-height', 'flow-map', 'water-ripple-normal', 'directional-distortion-map']) {
    const result = renderTextureLabPixels({
      ...defaultTextureLabRecipeForGenerator(generator),
      size: 32,
      width: 32,
      height: 32,
      seed: 53,
      tileable: true,
    });
    for (let y = 0; y < result.height; y += 1) {
      assert.deepEqual(rgbaAt(result, 0, y), rgbaAt(result, result.width - 1, y));
    }
    for (let x = 0; x < result.width; x += 1) {
      assert.deepEqual(rgbaAt(result, x, 0), rgbaAt(result, x, result.height - 1));
    }
  }
});

test('texture lab saved recipes normalize names, recipes, duplicates, and limits', () => {
  const saved = normalizeTextureLabSavedRecipes([
    {
      id: 'spark',
      name: '  Blue   Spark  ',
      createdAt: 10,
      updatedAt: 12,
      recipe: { generator: 'spark', size: 128, seed: 7 },
    },
    {
      id: 'duplicate',
      name: 'blue spark',
      recipe: { generator: 'cloud-noise' },
    },
    ...Array.from({ length: TEXTURE_LAB_SAVED_RECIPE_LIMIT + 4 }, (_, index) => ({
      id: `recipe-${index}`,
      name: `Recipe ${index}`,
      recipe: { generator: index % 2 === 0 ? 'rain-slash' : 'water-noise', seed: index + 1 },
    })),
  ]);
  assert.equal(saved.length, TEXTURE_LAB_SAVED_RECIPE_LIMIT);
  assert.equal(saved[0].name, 'Blue Spark');
  assert.equal(saved[0].recipe.generator, 'spark');
  assert.equal(saved[0].recipe.size, 128);
  assert.equal(saved[0].createdAt, 10);
  assert.equal(saved[0].updatedAt, 12);
  assert.equal(saved.filter((recipe) => recipe.name.toLowerCase() === 'blue spark').length, 1);
  assert.ok(saved.every((recipe) => recipe.recipe.seed >= 1));
});

test('texture lab atlas settings normalize layout and frame caps', () => {
  const variants = normalizeTextureLabAtlasSettings({
    enabled: true,
    playback: 'variants',
    columns: 8,
    rows: 8,
    frameCount: 99,
    fps: 120,
    seedStep: -2,
  });
  assert.equal(variants.enabled, true);
  assert.equal(variants.frameCount, 16);
  assert.equal(variants.fps, 60);
  assert.equal(variants.seedStep, 1);

  const lifetime = normalizeTextureLabAtlasSettings({
    enabled: true,
    playback: 'lifetime',
    columns: 8,
    rows: 8,
    frameCount: 99,
  });
  assert.equal(lifetime.frameCount, 64);

  const custom = normalizeTextureLabAtlasSettings({
    enabled: true,
    preset: 'custom-frames',
    onionSkin: false,
    customFrames: [
      { id: 'frame-a', name: ' first.png ', dataBase64: 'abc123', width: 4, height: 8 },
      { id: 'frame-a', name: '', dataBase64: '', width: 0, height: 0 },
      {
        id: 'frame-a',
        name: 'second.png',
        dataBase64: 'def456',
        width: 16,
        height: 16,
        recipe: { generator: 'spark', seed: 42, atlas: { enabled: true, preset: 'impact-ring' } },
      },
    ],
  });
  assert.equal(custom.preset, 'custom-frames');
  assert.equal(custom.onionSkin, false);
  assert.equal(custom.customFrames.length, 2);
  assert.equal(custom.customFrames[0].name, 'first.png');
  assert.notEqual(custom.customFrames[0].id, custom.customFrames[1].id);
  assert.equal(custom.customFrames[1].recipe.generator, 'spark');
  assert.equal(custom.customFrames[1].recipe.seed, 42);
  assert.equal(custom.customFrames[1].recipe.atlas, undefined);
});

test('texture lab custom atlas renders editable frame recipes independently', async () => {
  const atlas = await renderTextureLabCustomAtlasPixels({
    generator: 'soft-circle',
    size: 32,
    seed: 7,
    atlas: {
      enabled: true,
      mode: 'flipbook',
      preset: 'custom-frames',
      playback: 'lifetime',
      columns: 2,
      rows: 1,
      frameCount: 2,
      fps: 12,
      seedStep: 1,
      customFrames: [
        {
          id: 'frame-1',
          name: 'Frame 1',
          dataBase64: 'placeholder-a',
          width: 32,
          height: 32,
          recipe: { generator: 'soft-circle', seed: 7, softness: 0.8, atlas: { enabled: true, preset: 'impact-ring' } },
        },
        {
          id: 'frame-2',
          name: 'Frame 2',
          dataBase64: 'placeholder-b',
          width: 32,
          height: 32,
          recipe: { generator: 'ring', seed: 7, softness: 0.1 },
        },
      ],
    },
  });
  assert.equal(atlas.frames.length, 2);
  assert.equal(atlas.recipe.atlas.preset, 'custom-frames');
  assert.equal(atlas.recipe.atlas.customFrames[0].recipe.atlas, undefined);
  assert.equal(atlas.frames[0].recipe.generator, 'soft-circle');
  assert.equal(atlas.frames[1].recipe.generator, 'ring');
  assert.notEqual(checksum(atlas.frames[0].pixels), checksum(atlas.frames[1].pixels));
});

test('texture lab materializes atlas workspace frames as editable recipes', () => {
  const recipe = normalizeTextureLabRecipe({ generator: 'spark', size: 32, seed: 11, softness: 0.44 });
  const frames = textureLabMaterializeAtlasFrames(
    recipe,
    { enabled: true, preset: 'custom-frames', columns: 2, rows: 2, frameCount: 4 },
    'custom-frames',
  );
  assert.equal(frames.length, 4);
  assert.ok(frames.every((frame) => frame.recipe));
  assert.ok(frames.every((frame) => frame.recipe.generator === 'spark'));
  assert.ok(frames.every((frame) => frame.recipe.atlas === undefined));
  assert.equal(frames[0].recipe.softness, 0.44);
  assert.equal(frames[1].dataBase64.length > 0, true);
});

test('texture lab seeded atlas fill creates deterministic editable frame recipes', () => {
  const recipe = normalizeTextureLabRecipe({ generator: 'soft-circle', size: 32, seed: 17 });
  const atlas = normalizeTextureLabAtlasSettings({
    enabled: true,
    preset: 'smoke-variants',
    columns: 2,
    rows: 2,
    frameCount: 4,
    seedStep: 5,
  });
  const first = textureLabMaterializeAtlasFrames(recipe, atlas, 'smoke-variants');
  const second = textureLabMaterializeAtlasFrames(recipe, atlas, 'smoke-variants');
  assert.equal(first.length, 4);
  assert.ok(first.every((frame) => frame.recipe.generator === 'smoke-puff'));
  assert.deepEqual(first.map((frame) => frame.recipe.seed), [17, 22, 27, 32]);
  assert.deepEqual(
    first.map((frame) => frame.recipe),
    second.map((frame) => frame.recipe),
  );

  const frameRecipe = textureLabAtlasFrameRecipe(recipe, atlas, 2);
  assert.equal(frameRecipe.seed, 27);
  assert.equal(frameRecipe.atlas, undefined);
});

test('texture lab atlas output is deterministic and carries metadata', () => {
  const recipe = normalizeTextureLabRecipe({
    generator: 'spark',
    size: 32,
    seed: 21,
    atlas: {
      enabled: true,
      mode: 'variations',
      preset: 'seeded-spark',
      playback: 'variants',
      columns: 4,
      rows: 2,
      frameCount: 8,
      fps: 12,
      seedStep: 9,
    },
  });
  const first = renderTextureLabAtlasPixels(recipe);
  const second = renderTextureLabAtlasPixels(recipe);
  assert.equal(first.width, 128);
  assert.equal(first.height, 64);
  assert.equal(first.frames.length, 8);
  assert.equal(first.atlas.frameWidth, 32);
  assert.equal(first.atlas.playback, 'variants');
  assert.equal(checksum(first.pixels), checksum(second.pixels));
  assert.notEqual(checksum(first.frames[0].pixels), checksum(first.frames[1].pixels));
});

test('texture lab flipbook presets change over progress', () => {
  const dissolve = renderTextureLabAtlasPixels({
    generator: 'threshold-noise-mask',
    size: 32,
    seed: 33,
    atlas: {
      enabled: true,
      mode: 'flipbook',
      preset: 'dissolve-loop',
      playback: 'lifetime',
      columns: 4,
      rows: 2,
      frameCount: 8,
      fps: 16,
      seedStep: 1,
    },
  });
  const impact = renderTextureLabAtlasPixels({
    generator: 'ring',
    size: 32,
    seed: 33,
    atlas: {
      enabled: true,
      mode: 'flipbook',
      preset: 'impact-ring',
      playback: 'lifetime',
      columns: 4,
      rows: 2,
      frameCount: 8,
      fps: 16,
      seedStep: 1,
    },
  });
  assert.notEqual(checksum(dissolve.frames[0].pixels), checksum(dissolve.frames[4].pixels));
  assert.notEqual(checksum(impact.frames[0].pixels), checksum(impact.frames[7].pixels));
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
