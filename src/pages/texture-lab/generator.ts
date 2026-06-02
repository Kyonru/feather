import {
  TEXTURE_LAB_ALPHA_MODES,
  TEXTURE_LAB_ATLAS_MODES,
  TEXTURE_LAB_ATLAS_PLAYBACK_MODES,
  TEXTURE_LAB_ATLAS_PRESETS,
  TEXTURE_LAB_COLOR_RAMPS,
  TEXTURE_LAB_GENERATOR_IDS,
  TEXTURE_LAB_SHAPE_BLEND_MODES,
  TEXTURE_LAB_SHAPE_ELEMENT_KINDS,
  TEXTURE_LAB_SHAPE_REPEAT_MODES,
  TEXTURE_LAB_SPLINE_OVERLAP_MODES,
  type GeneratedTextureResult,
  type TextureLabAlphaMode,
  type TextureLabAtlasBundle,
  type TextureLabAtlasCustomFrame,
  type TextureLabAtlasFramePixels,
  type TextureLabAtlasMetadata,
  type TextureLabAtlasMode,
  type TextureLabAtlasPixels,
  type TextureLabAtlasPlaybackMode,
  type TextureLabAtlasPreset,
  type TextureLabAtlasSettings,
  type TextureLabColorRamp,
  type TextureLabGeneratedPixels,
  type TextureLabGeneratorId,
  type TextureLabImageMaskRecipe,
  type TextureLabRecipe,
  type TextureLabSavedRecipe,
  type TextureLabShapeBlendMode,
  type TextureLabShapeElement,
  type TextureLabShapeElementKind,
  type TextureLabShapeRecipe,
  type TextureLabShapeRepeat,
  type TextureLabShapeRepeatMode,
  type TextureLabSplinePoint,
  type TextureLabSplineRecipe,
} from '@/types/texture-lab';

export type TextureLabGeneratorCategory =
  | 'Particle sprites'
  | 'Masks'
  | 'SDF / glow'
  | 'Noise / maps'
  | 'Shader maps'
  | 'Pixel patterns'
  | 'Shapes / polygons'
  | 'Spline paths';

export type TextureLabGeneratorMeta = {
  id: TextureLabGeneratorId;
  label: string;
  category: TextureLabGeneratorCategory;
  description: string;
};

export type TextureLabSplinePresetId = 'slash' | 'comet' | 'ribbon-s' | 'lightning' | 'ellipse-border';

export type TextureLabSplinePreset = {
  id: TextureLabSplinePresetId;
  label: string;
  spline: TextureLabSplineRecipe;
};

export type TextureLabShapePresetId =
  | 'triangle'
  | 'hex-badge'
  | 'starburst'
  | 'ring-sigil'
  | 'scatter-dots'
  | 'pixel-confetti'
  | 'soft-polygon-mask';

export type TextureLabShapePreset = {
  id: TextureLabShapePresetId;
  label: string;
  shape: TextureLabShapeRecipe;
};

export const TEXTURE_LAB_GENERATORS: TextureLabGeneratorMeta[] = [
  {
    id: 'soft-circle',
    label: 'Soft Circle',
    category: 'Particle sprites',
    description: 'A soft radial sprite for glows, embers, and dust.',
  },
  {
    id: 'spark',
    label: 'Spark',
    category: 'Particle sprites',
    description: 'A compact cross-shaped spark with a hot center.',
  },
  {
    id: 'streak',
    label: 'Streak',
    category: 'Particle sprites',
    description: 'A tapered horizontal streak for speed lines.',
  },
  {
    id: 'ring',
    label: 'Ring',
    category: 'Particle sprites',
    description: 'A soft hollow ring for shockwaves and ripples.',
  },
  {
    id: 'smoke-puff',
    label: 'Smoke Puff',
    category: 'Particle sprites',
    description: 'A noisy soft puff with uneven edges.',
  },
  { id: 'star', label: 'Star', category: 'Particle sprites', description: 'A pointed sparkle sprite.' },
  {
    id: 'trail-blob',
    label: 'Trail Blob',
    category: 'Particle sprites',
    description: 'A soft blob stretched for magical trails.',
  },
  {
    id: 'rain-slash',
    label: 'Rain Slash',
    category: 'Particle sprites',
    description: 'A thin diagonal streak for rain and speed.',
  },
  { id: 'circle-mask', label: 'Circle Mask', category: 'Masks', description: 'A hard or soft circular alpha mask.' },
  { id: 'ellipse-mask', label: 'Ellipse Mask', category: 'Masks', description: 'A horizontal ellipse alpha mask.' },
  {
    id: 'rounded-rect-mask',
    label: 'Rounded Rect',
    category: 'Masks',
    description: 'A rounded rectangle utility mask.',
  },
  { id: 'radial-mask', label: 'Radial Mask', category: 'Masks', description: 'A grayscale radial falloff map.' },
  {
    id: 'threshold-noise-mask',
    label: 'Noise Mask',
    category: 'Masks',
    description: 'A thresholded procedural noise mask.',
  },
  {
    id: 'image-alpha-mask',
    label: 'Image Alpha Mask',
    category: 'Masks',
    description: 'Extracts source image transparency into an editable alpha mask.',
  },
  {
    id: 'image-luminance-mask',
    label: 'Image Luminance Mask',
    category: 'Masks',
    description: 'Converts imported image brightness into a grayscale shader mask.',
  },
  {
    id: 'image-threshold-mask',
    label: 'Image Threshold Mask',
    category: 'Masks',
    description: 'Thresholds imported image brightness into a hard or softened mask.',
  },
  {
    id: 'image-color-key-mask',
    label: 'Image Color Key Mask',
    category: 'Masks',
    description: 'Keys an imported color with tolerance and softness controls.',
  },
  {
    id: 'image-edge-mask',
    label: 'Image Edge Mask',
    category: 'Masks',
    description: 'Finds image outlines and contrast edges for shader masks.',
  },
  {
    id: 'sdf-circle',
    label: 'SDF Circle',
    category: 'SDF / glow',
    description: 'A signed-distance-style circle field for crisp scalable masks.',
  },
  {
    id: 'sdf-ring',
    label: 'SDF Ring',
    category: 'SDF / glow',
    description: 'A grayscale ring distance field for ripples, UI rings, and shader thresholds.',
  },
  {
    id: 'sdf-soft-outline',
    label: 'Soft Outline',
    category: 'SDF / glow',
    description: 'A soft circular outline sprite/mask with controllable thickness.',
  },
  {
    id: 'sdf-inner-glow',
    label: 'Inner Glow',
    category: 'SDF / glow',
    description: 'An inward glow mask for rims, shields, and UI accents.',
  },
  {
    id: 'sdf-outer-glow',
    label: 'Outer Glow',
    category: 'SDF / glow',
    description: 'An outward glow mask for halos, selection rings, and VFX sprites.',
  },
  {
    id: 'sdf-spline-stroke',
    label: 'Spline SDF Stroke',
    category: 'SDF / glow',
    description: 'An editable spline stroke rendered as a distance-style field.',
  },
  {
    id: 'cloud-noise',
    label: 'Cloud Noise',
    category: 'Noise / maps',
    description: 'Soft value noise for smoke and water.',
  },
  {
    id: 'cellular-spots',
    label: 'Cellular Spots',
    category: 'Noise / maps',
    description: 'Cell-like spots for foam, stars, or dissolve.',
  },
  {
    id: 'dissolve-noise',
    label: 'Dissolve Noise',
    category: 'Noise / maps',
    description: 'High-contrast texture for shader dissolves.',
  },
  {
    id: 'water-noise',
    label: 'Water Noise',
    category: 'Noise / maps',
    description: 'Layered directional noise for shimmer.',
  },
  {
    id: 'height-map',
    label: 'Height Map',
    category: 'Noise / maps',
    description: 'Smooth grayscale map for shader experiments.',
  },
  {
    id: 'directional-gradient',
    label: 'Directional Gradient',
    category: 'Noise / maps',
    description: 'A simple left-to-right utility map.',
  },
  {
    id: 'normal-from-height',
    label: 'Normal From Height',
    category: 'Shader maps',
    description: 'Converts seeded height-style noise into an RGB tangent-space normal map.',
  },
  {
    id: 'flow-map',
    label: 'Flow Map',
    category: 'Shader maps',
    description: 'Encodes procedural directional flow vectors in red and green.',
  },
  {
    id: 'radial-swirl-flow',
    label: 'Radial Swirl Flow',
    category: 'Shader maps',
    description: 'A centered swirl vector map for whirlpools, portals, and circular shimmer.',
  },
  {
    id: 'water-ripple-normal',
    label: 'Water Ripple Normal',
    category: 'Shader maps',
    description: 'A wave-driven normal map for water, glass, and shimmer effects.',
  },
  {
    id: 'directional-distortion-map',
    label: 'Directional Distortion',
    category: 'Shader maps',
    description: 'A biased vector distortion map for heat haze, wind, and mask-driven offsets.',
  },
  { id: 'checker', label: 'Checker', category: 'Pixel patterns', description: 'A tileable checker texture.' },
  { id: 'dither', label: 'Dither', category: 'Pixel patterns', description: 'A deterministic ordered dither pattern.' },
  {
    id: 'scanline',
    label: 'Scanline',
    category: 'Pixel patterns',
    description: 'Horizontal scanlines for pixel effects.',
  },
  { id: 'palette-ramp', label: 'Palette Ramp', category: 'Pixel patterns', description: 'A horizontal color ramp.' },
  {
    id: 'shape-composer',
    label: 'Shapes & Polygons',
    category: 'Shapes / polygons',
    description: 'Layered editable polygons, shapes, strokes, and seeded repeats.',
  },
  {
    id: 'spline-trail',
    label: 'Spline Trail',
    category: 'Spline paths',
    description: 'An editable tapered path for trails, wisps, and comet-like sprites.',
  },
  {
    id: 'spline-ribbon',
    label: 'Spline Ribbon',
    category: 'Spline paths',
    description: 'A wider editable ribbon path with soft feathered edges.',
  },
  {
    id: 'spline-mask',
    label: 'Spline Mask',
    category: 'Spline paths',
    description: 'An editable stroke or closed-loop mask.',
  },
  {
    id: 'spline-lightning',
    label: 'Spline Lightning',
    category: 'Spline paths',
    description: 'A seed-jittered editable path for bolts and energized streaks.',
  },
];

export const DEFAULT_TEXTURE_LAB_RECIPE: TextureLabRecipe = {
  generator: 'soft-circle',
  size: 64,
  width: 64,
  height: 64,
  seed: 1337,
  softness: 0.55,
  falloff: 1.4,
  contrast: 1,
  threshold: 0.5,
  scale: 6,
  distortion: 0,
  tileable: true,
  pixelated: false,
  alphaMode: 'shape',
  colorRamp: 'white',
  solidColor: '#ffffff',
  backgroundColor: '#000000',
  backgroundAlpha: 0,
};

const TEXTURE_LAB_GENERATOR_RECIPE_DEFAULTS: Partial<Record<TextureLabGeneratorId, Partial<TextureLabRecipe>>> = {
  'circle-mask': { alphaMode: 'luminance' },
  'ellipse-mask': { alphaMode: 'luminance' },
  'rounded-rect-mask': { alphaMode: 'luminance' },
  'radial-mask': { alphaMode: 'luminance' },
  'threshold-noise-mask': { alphaMode: 'inverted' },
  'image-alpha-mask': { alphaMode: 'shape', threshold: 0.5, softness: 0.12, colorRamp: 'white' },
  'image-luminance-mask': { alphaMode: 'opaque', contrast: 1.1, colorRamp: 'grayscale' },
  'image-threshold-mask': { alphaMode: 'opaque', threshold: 0.5, softness: 0.08, colorRamp: 'grayscale' },
  'image-color-key-mask': { alphaMode: 'opaque', threshold: 0.16, softness: 0.12, colorRamp: 'grayscale' },
  'image-edge-mask': { alphaMode: 'opaque', threshold: 0.18, softness: 0.08, contrast: 1.5, colorRamp: 'grayscale' },
  'sdf-circle': { alphaMode: 'opaque', threshold: 0.58, softness: 0.18, contrast: 1.1, colorRamp: 'grayscale', tileable: false },
  'sdf-ring': { alphaMode: 'opaque', threshold: 0.58, softness: 0.16, contrast: 1.1, colorRamp: 'grayscale', tileable: false },
  'sdf-soft-outline': { alphaMode: 'shape', threshold: 0.55, softness: 0.22, falloff: 1.2, colorRamp: 'white', tileable: false },
  'sdf-inner-glow': { alphaMode: 'shape', threshold: 0.62, softness: 0.32, falloff: 1.8, colorRamp: 'white', tileable: false },
  'sdf-outer-glow': { alphaMode: 'shape', threshold: 0.5, softness: 0.34, falloff: 1.6, colorRamp: 'white', tileable: false },
  'sdf-spline-stroke': { alphaMode: 'opaque', softness: 0.2, falloff: 1.2, colorRamp: 'grayscale', tileable: false },
  'cloud-noise': { alphaMode: 'luminance' },
  'cellular-spots': { alphaMode: 'luminance' },
  'dissolve-noise': { alphaMode: 'inverted' },
  'water-noise': { alphaMode: 'luminance' },
  'height-map': { alphaMode: 'luminance' },
  'directional-gradient': { alphaMode: 'luminance' },
  'normal-from-height': { alphaMode: 'opaque', scale: 7, contrast: 1.25, distortion: 0.4, colorRamp: 'white' },
  'flow-map': { alphaMode: 'opaque', scale: 5, contrast: 1.15, distortion: 0.55, colorRamp: 'white' },
  'radial-swirl-flow': {
    alphaMode: 'opaque',
    scale: 4,
    falloff: 1.8,
    contrast: 1.1,
    distortion: 0.7,
    tileable: false,
    colorRamp: 'white',
  },
  'water-ripple-normal': { alphaMode: 'opaque', scale: 9, contrast: 1.2, distortion: 0.45, colorRamp: 'white' },
  'directional-distortion-map': {
    alphaMode: 'opaque',
    scale: 6,
    contrast: 1.25,
    distortion: 0.65,
    colorRamp: 'white',
  },
  dither: { alphaMode: 'luminance' },
  scanline: { alphaMode: 'luminance' },
  'spline-mask': { alphaMode: 'luminance' },
  'palette-ramp': {
    alphaMode: 'luminance',
  },
  checker: {
    alphaMode: 'luminance',
    scale: 5,
  },
};

export const TEXTURE_LAB_SPLINE_GENERATOR_IDS = [
  'spline-trail',
  'spline-ribbon',
  'spline-mask',
  'spline-lightning',
  'sdf-spline-stroke',
] as const satisfies readonly TextureLabGeneratorId[];

export const TEXTURE_LAB_SDF_GENERATOR_IDS = [
  'sdf-circle',
  'sdf-ring',
  'sdf-soft-outline',
  'sdf-inner-glow',
  'sdf-outer-glow',
  'sdf-spline-stroke',
] as const satisfies readonly TextureLabGeneratorId[];

export const TEXTURE_LAB_SHADER_MAP_GENERATOR_IDS = [
  'normal-from-height',
  'flow-map',
  'radial-swirl-flow',
  'water-ripple-normal',
  'directional-distortion-map',
] as const satisfies readonly TextureLabGeneratorId[];

export const TEXTURE_LAB_IMAGE_MASK_GENERATOR_IDS = [
  'image-alpha-mask',
  'image-luminance-mask',
  'image-threshold-mask',
  'image-color-key-mask',
  'image-edge-mask',
] as const satisfies readonly TextureLabGeneratorId[];

const DEFAULT_TRAIL_SPLINE: TextureLabSplineRecipe = {
  points: [
    { x: 0.12, y: 0.68 },
    { x: 0.34, y: 0.46 },
    { x: 0.62, y: 0.38 },
    { x: 0.88, y: 0.25 },
  ],
  closed: false,
  tension: 0.35,
  strokeWidth: 0.18,
  feather: 0.5,
  taperStart: 0.78,
  taperEnd: 0.12,
  jitter: 0,
  samples: 96,
  overlapMode: 'merge',
};

export const TEXTURE_LAB_SPLINE_PRESETS: TextureLabSplinePreset[] = [
  {
    id: 'slash',
    label: 'Slash',
    spline: {
      points: [
        { x: 0.16, y: 0.78 },
        { x: 0.38, y: 0.48 },
        { x: 0.68, y: 0.28 },
        { x: 0.9, y: 0.16 },
      ],
      closed: false,
      tension: 0.28,
      strokeWidth: 0.14,
      feather: 0.38,
      taperStart: 0.72,
      taperEnd: 0.22,
      jitter: 0,
      samples: 88,
      overlapMode: 'merge',
    },
  },
  {
    id: 'comet',
    label: 'Comet Tail',
    spline: {
      points: [
        { x: 0.1, y: 0.62 },
        { x: 0.32, y: 0.52 },
        { x: 0.62, y: 0.42 },
        { x: 0.92, y: 0.34 },
      ],
      closed: false,
      tension: 0.24,
      strokeWidth: 0.26,
      feather: 0.56,
      taperStart: 0.9,
      taperEnd: 0,
      jitter: 0,
      samples: 128,
      overlapMode: 'merge',
    },
  },
  {
    id: 'ribbon-s',
    label: 'Ribbon S',
    spline: {
      points: [
        { x: 0.12, y: 0.34 },
        { x: 0.32, y: 0.16 },
        { x: 0.6, y: 0.76 },
        { x: 0.86, y: 0.52 },
      ],
      closed: false,
      tension: 0.18,
      strokeWidth: 0.2,
      feather: 0.42,
      taperStart: 0.32,
      taperEnd: 0.32,
      jitter: 0,
      samples: 112,
      overlapMode: 'merge',
    },
  },
  {
    id: 'lightning',
    label: 'Lightning',
    spline: {
      points: [
        { x: 0.08, y: 0.52 },
        { x: 0.3, y: 0.34 },
        { x: 0.52, y: 0.62 },
        { x: 0.75, y: 0.28 },
        { x: 0.94, y: 0.42 },
      ],
      closed: false,
      tension: 0,
      strokeWidth: 0.08,
      feather: 0.22,
      taperStart: 0.18,
      taperEnd: 0.18,
      jitter: 0.5,
      samples: 128,
      overlapMode: 'bridge',
    },
  },
  {
    id: 'ellipse-border',
    label: 'Ellipse Border',
    spline: {
      points: [
        { x: 0.5, y: 0.18 },
        { x: 0.82, y: 0.5 },
        { x: 0.5, y: 0.82 },
        { x: 0.18, y: 0.5 },
      ],
      closed: true,
      tension: 0.1,
      strokeWidth: 0.12,
      feather: 0.38,
      taperStart: 0,
      taperEnd: 0,
      jitter: 0,
      samples: 128,
      overlapMode: 'merge',
    },
  },
];

const GENERATOR_SET = new Set<string>(TEXTURE_LAB_GENERATOR_IDS);
const RAMP_SET = new Set<string>(TEXTURE_LAB_COLOR_RAMPS);
const ALPHA_SET = new Set<string>(TEXTURE_LAB_ALPHA_MODES);
const SPLINE_GENERATOR_SET = new Set<string>(TEXTURE_LAB_SPLINE_GENERATOR_IDS);
const SDF_GENERATOR_SET = new Set<string>(TEXTURE_LAB_SDF_GENERATOR_IDS);
const SHADER_MAP_GENERATOR_SET = new Set<string>(TEXTURE_LAB_SHADER_MAP_GENERATOR_IDS);
const IMAGE_MASK_GENERATOR_SET = new Set<string>(TEXTURE_LAB_IMAGE_MASK_GENERATOR_IDS);
const SPLINE_OVERLAP_SET = new Set<string>(TEXTURE_LAB_SPLINE_OVERLAP_MODES);
const SHAPE_KIND_SET = new Set<string>(TEXTURE_LAB_SHAPE_ELEMENT_KINDS);
const SHAPE_REPEAT_SET = new Set<string>(TEXTURE_LAB_SHAPE_REPEAT_MODES);
const SHAPE_BLEND_SET = new Set<string>(TEXTURE_LAB_SHAPE_BLEND_MODES);
const ATLAS_MODE_SET = new Set<string>(TEXTURE_LAB_ATLAS_MODES);
const ATLAS_PRESET_SET = new Set<string>(TEXTURE_LAB_ATLAS_PRESETS);
const ATLAS_PLAYBACK_SET = new Set<string>(TEXTURE_LAB_ATLAS_PLAYBACK_MODES);
const SHAPE_LAYER_LIMIT = 8;
const SHAPE_POINT_LIMIT = 24;
export const TEXTURE_LAB_MIN_DIMENSION = 1;
export const TEXTURE_LAB_MAX_DIMENSION = 1024;
export const TEXTURE_LAB_SAVED_RECIPE_LIMIT = 32;
export const TEXTURE_LAB_ATLAS_VARIANT_FRAME_LIMIT = 16;
export const TEXTURE_LAB_ATLAS_LIFETIME_FRAME_LIMIT = 64;

export const DEFAULT_TEXTURE_LAB_ATLAS_SETTINGS: TextureLabAtlasSettings = {
  enabled: false,
  mode: 'variations',
  preset: 'seeded-spark',
  columns: 4,
  rows: 4,
  frameCount: 16,
  fps: 12,
  seedStep: 17,
  playback: 'lifetime',
  onionSkin: true,
};

export const TEXTURE_LAB_ATLAS_PRESET_LABELS: Record<TextureLabAtlasPreset, string> = {
  'seeded-spark': 'Seeded Spark',
  'smoke-variants': 'Smoke Variants',
  'rain-variants': 'Rain Variants',
  'dissolve-loop': 'Dissolve Loop',
  'impact-ring': 'Impact Ring',
  'custom-frames': 'Custom Frames',
};

export const TEXTURE_LAB_ATLAS_FILL_PRESETS = TEXTURE_LAB_ATLAS_PRESETS.filter(
  (preset): preset is Exclude<TextureLabAtlasPreset, 'custom-frames'> => preset !== 'custom-frames',
);

const TEXTURE_LAB_RECIPE_FRAME_PLACEHOLDER =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lhvDkQAAAABJRU5ErkJggg==';
const TEXTURE_LAB_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp']);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeDimension(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.round(clamp(numeric, TEXTURE_LAB_MIN_DIMENSION, TEXTURE_LAB_MAX_DIMENSION));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function normalizeHexColor(value: unknown, fallback = '#000000'): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  const short = /^#?([0-9a-f]{3})$/i.exec(trimmed);
  if (short) {
    return `#${short[1]
      .split('')
      .map((part) => `${part}${part}`)
      .join('')}`.toLowerCase();
  }
  const full = /^#?([0-9a-f]{6})$/i.exec(trimmed);
  if (full) return `#${full[1].toLowerCase()}`;
  return fallback;
}

function normalizeImageMaskRecipe(input: unknown, generator: TextureLabGeneratorId): TextureLabImageMaskRecipe | undefined {
  if (!isTextureLabImageMaskGenerator(generator)) return undefined;
  const source = input && typeof input === 'object' ? (input as Partial<TextureLabImageMaskRecipe>) : {};
  const dataBase64 = typeof source.dataBase64 === 'string' ? source.dataBase64.trim() : '';
  if (!dataBase64) return undefined;
  const mimeType =
    typeof source.mimeType === 'string' && TEXTURE_LAB_IMAGE_MIME_TYPES.has(source.mimeType)
      ? source.mimeType
      : 'image/png';
  return {
    dataBase64,
    mimeType,
    name:
      typeof source.name === 'string' && source.name.trim()
        ? source.name.trim().replace(/\s+/g, ' ').slice(0, 96)
        : 'source-image.png',
    width: Math.round(clamp(Number(source.width ?? 1), 1, 4096)),
    height: Math.round(clamp(Number(source.height ?? 1), 1, 4096)),
    colorKey: normalizeHexColor(source.colorKey, '#000000'),
  };
}

function hexToRgb(value: string): [number, number, number] {
  const hex = normalizeHexColor(value).slice(1);
  return [
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

function cloneSplineRecipe(spline: TextureLabSplineRecipe): TextureLabSplineRecipe {
  return {
    ...spline,
    points: spline.points.map((point) => ({ ...point })),
  };
}

export function isTextureLabSplineGenerator(generator: TextureLabGeneratorId): boolean {
  return SPLINE_GENERATOR_SET.has(generator);
}

export function isTextureLabSdfGenerator(generator: TextureLabGeneratorId): boolean {
  return SDF_GENERATOR_SET.has(generator);
}

export function isTextureLabShaderMapGenerator(generator: TextureLabGeneratorId): boolean {
  return SHADER_MAP_GENERATOR_SET.has(generator);
}

export function isTextureLabImageMaskGenerator(generator: TextureLabGeneratorId): boolean {
  return IMAGE_MASK_GENERATOR_SET.has(generator);
}

export function defaultTextureLabRecipeForGenerator(generator: TextureLabGeneratorId): TextureLabRecipe {
  const generatorDefaults = TEXTURE_LAB_GENERATOR_RECIPE_DEFAULTS[generator];
  const defaultTileable =
    typeof generatorDefaults?.tileable === 'boolean'
      ? generatorDefaults.tileable
      : !(isTextureLabSplineGenerator(generator) || generator === 'shape-composer');
  return normalizeRecipe({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    ...generatorDefaults,
    generator,
    tileable: defaultTileable,
    spline: isTextureLabSplineGenerator(generator) ? defaultSplineForGenerator(generator) : undefined,
    shape: generator === 'shape-composer' ? defaultShapeRecipe() : undefined,
  });
}

function defaultSplineForGenerator(generator: TextureLabGeneratorId): TextureLabSplineRecipe {
  if (generator === 'spline-ribbon') {
    return cloneSplineRecipe(
      TEXTURE_LAB_SPLINE_PRESETS.find((preset) => preset.id === 'ribbon-s')?.spline ?? DEFAULT_TRAIL_SPLINE,
    );
  }
  if (generator === 'spline-mask') {
    return cloneSplineRecipe(
      TEXTURE_LAB_SPLINE_PRESETS.find((preset) => preset.id === 'ellipse-border')?.spline ?? DEFAULT_TRAIL_SPLINE,
    );
  }
  if (generator === 'spline-lightning') {
    return cloneSplineRecipe(
      TEXTURE_LAB_SPLINE_PRESETS.find((preset) => preset.id === 'lightning')?.spline ?? DEFAULT_TRAIL_SPLINE,
    );
  }
  if (generator === 'sdf-spline-stroke') {
    return cloneSplineRecipe(
      TEXTURE_LAB_SPLINE_PRESETS.find((preset) => preset.id === 'ellipse-border')?.spline ?? DEFAULT_TRAIL_SPLINE,
    );
  }
  return cloneSplineRecipe(DEFAULT_TRAIL_SPLINE);
}

export function textureLabSplinePreset(presetId: TextureLabSplinePresetId): TextureLabSplineRecipe {
  const preset = TEXTURE_LAB_SPLINE_PRESETS.find((item) => item.id === presetId);
  return cloneSplineRecipe(preset?.spline ?? DEFAULT_TRAIL_SPLINE);
}

const DEFAULT_SHAPE_REPEAT: TextureLabShapeRepeat = {
  mode: 'none',
  count: 1,
  spacing: 0.18,
  radius: 0.28,
  seedOffset: 0,
  rotationVariance: 0,
  scaleVariance: 0,
  jitter: 0,
};

function cloneShapeRepeat(repeat: TextureLabShapeRepeat): TextureLabShapeRepeat {
  return { ...repeat };
}

function regularShapePoints(sides: number, innerRadius = 1, star = false): TextureLabSplinePoint[] {
  const safeSides = Math.round(clamp(sides, 3, 12));
  const pointCount = star ? safeSides * 2 : safeSides;
  const points: TextureLabSplinePoint[] = [];
  for (let index = 0; index < pointCount; index += 1) {
    const radius = star && index % 2 === 1 ? innerRadius : 1;
    const angle = -Math.PI / 2 + (index / pointCount) * Math.PI * 2;
    points.push({
      x: 0.5 + Math.cos(angle) * 0.44 * radius,
      y: 0.5 + Math.sin(angle) * 0.44 * radius,
    });
  }
  return points;
}

export function textureLabShapeElement(
  kind: TextureLabShapeElementKind,
  overrides: Partial<TextureLabShapeElement> = {},
): TextureLabShapeElement {
  const safeKind = SHAPE_KIND_SET.has(kind) ? kind : 'polygon';
  const sides = Math.round(clamp(Number(overrides.sides ?? (safeKind === 'star' ? 5 : 6)), 3, 12));
  const innerRadius = clamp(Number(overrides.innerRadius ?? 0.48), 0.08, 0.95);
  const base: TextureLabShapeElement = {
    id: overrides.id ?? `${safeKind}-1`,
    kind: safeKind,
    label: overrides.label ?? formatShapeKindLabel(safeKind),
    enabled: overrides.enabled !== false,
    x: clamp01(Number(overrides.x ?? 0.5)),
    y: clamp01(Number(overrides.y ?? 0.5)),
    size: clamp(Number(overrides.size ?? 0.58), 0.03, 1.5),
    rotation: Number.isFinite(Number(overrides.rotation)) ? Number(overrides.rotation) : 0,
    opacity: clamp01(Number(overrides.opacity ?? 1)),
    fillColor: normalizeHexColor(overrides.fillColor, '#ffffff'),
    strokeColor: normalizeHexColor(overrides.strokeColor, '#2563eb'),
    strokeWidth: clamp(Number(overrides.strokeWidth ?? 0.035), 0, 0.45),
    feather: clamp(Number(overrides.feather ?? 0.025), 0, 0.45),
    blendMode:
      typeof overrides.blendMode === 'string' && SHAPE_BLEND_SET.has(overrides.blendMode)
        ? overrides.blendMode
        : 'normal',
    sides,
    innerRadius,
    cornerRoundness: clamp(Number(overrides.cornerRoundness ?? 0), 0, 1),
    repeat: normalizeShapeRepeat(overrides.repeat),
  };

  if (safeKind === 'polygon' || safeKind === 'star') {
    base.points =
      overrides.points && overrides.points.length >= 3
        ? overrides.points.map((point) => ({ x: clamp01(point.x), y: clamp01(point.y) })).slice(0, SHAPE_POINT_LIMIT)
        : regularShapePoints(sides, innerRadius, safeKind === 'star');
  }
  if (safeKind === 'spline') {
    base.spline = overrides.spline ? cloneSplineRecipe(overrides.spline) : textureLabSplinePreset('slash');
    base.fillColor = normalizeHexColor(overrides.fillColor, '#f8fafc');
    base.strokeColor = normalizeHexColor(overrides.strokeColor, '#7c3aed');
    base.strokeWidth = clamp(Number(overrides.strokeWidth ?? 0.08), 0, 0.45);
  }
  if (safeKind === 'dot') {
    base.size = clamp(Number(overrides.size ?? 0.14), 0.03, 1.5);
    base.strokeWidth = clamp(Number(overrides.strokeWidth ?? 0), 0, 0.45);
  }
  if (safeKind === 'ring') {
    base.fillColor = normalizeHexColor(overrides.fillColor, '#ffffff');
    base.strokeWidth = clamp(Number(overrides.strokeWidth ?? 0.16), 0, 0.45);
  }
  return base;
}

function formatShapeKindLabel(kind: TextureLabShapeElementKind): string {
  return kind
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ');
}

function cloneShapeElement(layer: TextureLabShapeElement): TextureLabShapeElement {
  return {
    ...layer,
    points: layer.points?.map((point) => ({ ...point })),
    spline: layer.spline ? cloneSplineRecipe(layer.spline) : undefined,
    repeat: cloneShapeRepeat(layer.repeat),
  };
}

function shapeRecipe(layers: TextureLabShapeElement[], selectedLayerId?: string): TextureLabShapeRecipe {
  const normalizedLayers = layers.slice(0, SHAPE_LAYER_LIMIT).map(cloneShapeElement);
  return {
    selectedLayerId: selectedLayerId ?? normalizedLayers[0]?.id,
    layers: normalizedLayers,
  };
}

function defaultShapeRecipe(): TextureLabShapeRecipe {
  return shapeRecipe([
    textureLabShapeElement('polygon', {
      id: 'hex-layer',
      label: 'Hex Badge',
      sides: 6,
      fillColor: '#ffffff',
      strokeColor: '#2563eb',
      strokeWidth: 0.045,
      feather: 0.025,
      points: regularShapePoints(6),
    }),
  ]);
}

export const TEXTURE_LAB_SHAPE_PRESETS: TextureLabShapePreset[] = [
  {
    id: 'triangle',
    label: 'Triangle',
    shape: shapeRecipe([
      textureLabShapeElement('polygon', {
        id: 'triangle-layer',
        label: 'Triangle',
        sides: 3,
        fillColor: '#ffffff',
        strokeColor: '#111827',
        strokeWidth: 0.035,
        points: regularShapePoints(3),
      }),
    ]),
  },
  {
    id: 'hex-badge',
    label: 'Hex Badge',
    shape: defaultShapeRecipe(),
  },
  {
    id: 'starburst',
    label: 'Starburst',
    shape: shapeRecipe([
      textureLabShapeElement('star', {
        id: 'starburst-layer',
        label: 'Starburst',
        sides: 8,
        innerRadius: 0.38,
        fillColor: '#facc15',
        strokeColor: '#fb923c',
        strokeWidth: 0.025,
        points: regularShapePoints(8, 0.38, true),
      }),
    ]),
  },
  {
    id: 'ring-sigil',
    label: 'Ring Sigil',
    shape: shapeRecipe([
      textureLabShapeElement('ring', {
        id: 'sigil-ring',
        label: 'Outer Ring',
        size: 0.72,
        fillColor: '#38bdf8',
        strokeColor: '#e0f2fe',
        strokeWidth: 0.13,
        opacity: 0.9,
      }),
      textureLabShapeElement('spline', {
        id: 'sigil-stroke',
        label: 'Inner Stroke',
        size: 0.52,
        strokeColor: '#a78bfa',
        strokeWidth: 0.055,
        spline: textureLabSplinePreset('ellipse-border'),
      }),
    ]),
  },
  {
    id: 'scatter-dots',
    label: 'Scatter Dots',
    shape: shapeRecipe([
      textureLabShapeElement('dot', {
        id: 'scatter-dots-layer',
        label: 'Scatter Dots',
        fillColor: '#ffffff',
        opacity: 0.88,
        repeat: {
          ...DEFAULT_SHAPE_REPEAT,
          mode: 'scatter',
          count: 24,
          radius: 0.42,
          jitter: 0.12,
          scaleVariance: 0.55,
        },
      }),
    ]),
  },
  {
    id: 'pixel-confetti',
    label: 'Pixel Confetti',
    shape: shapeRecipe([
      textureLabShapeElement('rect', {
        id: 'confetti-layer',
        label: 'Confetti',
        size: 0.08,
        fillColor: '#f472b6',
        strokeColor: '#fef3c7',
        strokeWidth: 0,
        repeat: {
          ...DEFAULT_SHAPE_REPEAT,
          mode: 'scatter',
          count: 28,
          radius: 0.45,
          jitter: 0.2,
          scaleVariance: 0.35,
          rotationVariance: 1,
        },
      }),
    ]),
  },
  {
    id: 'soft-polygon-mask',
    label: 'Soft Polygon Mask',
    shape: shapeRecipe([
      textureLabShapeElement('polygon', {
        id: 'soft-mask-layer',
        label: 'Soft Mask',
        fillColor: '#ffffff',
        strokeColor: '#ffffff',
        strokeWidth: 0,
        feather: 0.12,
        sides: 7,
        points: regularShapePoints(7),
      }),
    ]),
  },
];

export function textureLabShapePreset(presetId: TextureLabShapePresetId): TextureLabShapeRecipe {
  const preset = TEXTURE_LAB_SHAPE_PRESETS.find((item) => item.id === presetId);
  return shapeRecipe((preset?.shape ?? defaultShapeRecipe()).layers, preset?.shape.selectedLayerId);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function hashInt(value: number): number {
  let x = value | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

function random01(seed: number, x: number, y = 0): number {
  return hashInt(seed + Math.imul(x + 101, 374761393) + Math.imul(y + 251, 668265263)) / 0xffffffff;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function valueNoise(u: number, v: number, scale: number, seed: number, tileable: boolean): number {
  const cells = Math.max(2, Math.round(scale));
  const x = u * cells;
  const y = v * cells;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(0, 1, fract(x));
  const ty = smoothstep(0, 1, fract(y));
  const sample = (ix: number, iy: number) => {
    const sx = tileable ? ((ix % cells) + cells) % cells : ix;
    const sy = tileable ? ((iy % cells) + cells) % cells : iy;
    return random01(seed, sx, sy);
  };
  const a = lerp(sample(x0, y0), sample(x0 + 1, y0), tx);
  const b = lerp(sample(x0, y0 + 1), sample(x0 + 1, y0 + 1), tx);
  return lerp(a, b, ty);
}

function fbm(u: number, v: number, scale: number, seed: number, tileable: boolean): number {
  let value = 0;
  let amp = 0.55;
  let total = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    value += valueNoise(u, v, scale * 2 ** octave, seed + octave * 97, tileable) * amp;
    total += amp;
    amp *= 0.5;
  }
  return value / total;
}

function cellular(u: number, v: number, scale: number, seed: number, tileable: boolean): number {
  const cells = Math.max(2, Math.round(scale));
  const x = u * cells;
  const y = v * cells;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  let nearest = 999;
  for (let oy = -1; oy <= 1; oy += 1) {
    for (let ox = -1; ox <= 1; ox += 1) {
      const gx = cx + ox;
      const gy = cy + oy;
      const sx = tileable ? ((gx % cells) + cells) % cells : gx;
      const sy = tileable ? ((gy % cells) + cells) % cells : gy;
      const px = gx + random01(seed, sx, sy);
      const py = gy + random01(seed + 17, sx, sy);
      nearest = Math.min(nearest, Math.hypot(x - px, y - py));
    }
  }
  return clamp01(1 - nearest);
}

function normalizeSplinePoint(point: unknown): TextureLabSplinePoint | null {
  if (!point || typeof point !== 'object') return null;
  const candidate = point as Partial<TextureLabSplinePoint>;
  const x = Number(candidate.x);
  const y = Number(candidate.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x: clamp01(x), y: clamp01(y) };
}

function normalizeSplineRecipe(input: unknown, generator: TextureLabGeneratorId): TextureLabSplineRecipe | undefined {
  if (!isTextureLabSplineGenerator(generator)) return undefined;
  const fallback = defaultSplineForGenerator(generator);
  const source = input && typeof input === 'object' ? (input as Partial<TextureLabSplineRecipe>) : {};
  const points = Array.isArray(source.points)
    ? source.points
        .map(normalizeSplinePoint)
        .filter((point): point is TextureLabSplinePoint => point !== null)
        .slice(0, 16)
    : [];
  const normalizedPoints = points.length >= 2 ? points : fallback.points;

  return {
    points: normalizedPoints.map((point) => ({ ...point })),
    closed: typeof source.closed === 'boolean' ? source.closed : fallback.closed,
    tension: clamp(Number(source.tension ?? fallback.tension), 0, 1),
    strokeWidth: clamp(Number(source.strokeWidth ?? fallback.strokeWidth), 0.01, 0.8),
    feather: clamp(Number(source.feather ?? fallback.feather), 0, 1),
    taperStart: clamp(Number(source.taperStart ?? fallback.taperStart), 0, 1),
    taperEnd: clamp(Number(source.taperEnd ?? fallback.taperEnd), 0, 1),
    jitter: clamp(Number(source.jitter ?? fallback.jitter), 0, 1),
    samples: Math.round(clamp(Number(source.samples ?? fallback.samples), 16, 192)),
    overlapMode:
      typeof source.overlapMode === 'string' && SPLINE_OVERLAP_SET.has(source.overlapMode)
        ? source.overlapMode
        : fallback.overlapMode,
  };
}

function normalizeShapeRepeat(input: unknown): TextureLabShapeRepeat {
  const source = input && typeof input === 'object' ? (input as Partial<TextureLabShapeRepeat>) : {};
  const mode =
    typeof source.mode === 'string' && SHAPE_REPEAT_SET.has(source.mode)
      ? (source.mode as TextureLabShapeRepeatMode)
      : DEFAULT_SHAPE_REPEAT.mode;
  return {
    mode,
    count: Math.round(clamp(Number(source.count ?? DEFAULT_SHAPE_REPEAT.count), 1, 64)),
    spacing: clamp(Number(source.spacing ?? DEFAULT_SHAPE_REPEAT.spacing), 0, 1),
    radius: clamp(Number(source.radius ?? DEFAULT_SHAPE_REPEAT.radius), 0, 1),
    seedOffset: Math.round(clamp(Number(source.seedOffset ?? DEFAULT_SHAPE_REPEAT.seedOffset), 0, 9999)),
    rotationVariance: clamp(Number(source.rotationVariance ?? DEFAULT_SHAPE_REPEAT.rotationVariance), 0, 1),
    scaleVariance: clamp(Number(source.scaleVariance ?? DEFAULT_SHAPE_REPEAT.scaleVariance), 0, 1),
    jitter: clamp(Number(source.jitter ?? DEFAULT_SHAPE_REPEAT.jitter), 0, 1),
  };
}

function normalizeShapeLayer(input: unknown, index: number): TextureLabShapeElement {
  const source = input && typeof input === 'object' ? (input as Partial<TextureLabShapeElement>) : {};
  const kind =
    typeof source.kind === 'string' && SHAPE_KIND_SET.has(source.kind)
      ? (source.kind as TextureLabShapeElementKind)
      : 'polygon';
  const points = Array.isArray(source.points)
    ? source.points
        .map(normalizeSplinePoint)
        .filter((point): point is TextureLabSplinePoint => point !== null)
        .slice(0, SHAPE_POINT_LIMIT)
    : undefined;
  const spline =
    kind === 'spline'
      ? (normalizeSplineRecipe(source.spline, 'spline-trail') ?? textureLabSplinePreset('slash'))
      : undefined;
  return textureLabShapeElement(kind, {
    ...source,
    id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : `${kind}-${index + 1}`,
    label: typeof source.label === 'string' && source.label.trim() ? source.label.trim().slice(0, 32) : undefined,
    points: points && points.length >= 3 ? points : undefined,
    spline,
    repeat: normalizeShapeRepeat(source.repeat),
  });
}

function normalizeShapeRecipe(input: unknown, generator: TextureLabGeneratorId): TextureLabShapeRecipe | undefined {
  if (generator !== 'shape-composer') return undefined;
  const source = input && typeof input === 'object' ? (input as Partial<TextureLabShapeRecipe>) : {};
  const layers = Array.isArray(source.layers)
    ? source.layers.slice(0, SHAPE_LAYER_LIMIT).map((layer, index) => normalizeShapeLayer(layer, index))
    : [];
  const normalizedLayers = layers.length > 0 ? layers : defaultShapeRecipe().layers.map(cloneShapeElement);
  const selectedLayerId =
    typeof source.selectedLayerId === 'string' && normalizedLayers.some((layer) => layer.id === source.selectedLayerId)
      ? source.selectedLayerId
      : normalizedLayers[0]?.id;
  return { selectedLayerId, layers: normalizedLayers };
}

export function textureLabRecipeWithoutAtlas(
  input?: Partial<TextureLabRecipe> | null,
): Omit<TextureLabRecipe, 'atlas'> {
  const normalized = normalizeRecipe({ ...input, atlas: undefined });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { atlas: _atlas, ...recipe } = normalized;
  return recipe;
}

function normalizeTextureLabAtlasCustomFrames(input: unknown): TextureLabAtlasCustomFrame[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const frames: TextureLabAtlasCustomFrame[] = [];
  const ids = new Set<string>();

  for (const [index, item] of input.entries()) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Partial<TextureLabAtlasCustomFrame>;
    const recipe = source.recipe ? textureLabRecipeWithoutAtlas(source.recipe) : undefined;
    const dataBase64 = typeof source.dataBase64 === 'string' ? source.dataBase64 : '';
    if (!recipe && dataBase64.length === 0) continue;
    const baseId = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : `custom-frame-${index + 1}`;
    let id = baseId;
    let suffix = 2;
    while (ids.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    ids.add(id);
    frames.push({
      id,
      name:
        typeof source.name === 'string' && source.name.trim()
          ? source.name.trim().replace(/\s+/g, ' ').slice(0, 96)
          : `Frame ${index + 1}.png`,
      dataBase64: dataBase64.length > 0 ? dataBase64 : TEXTURE_LAB_RECIPE_FRAME_PLACEHOLDER,
      width: Math.round(clamp(Number(source.width ?? recipe?.width ?? recipe?.size ?? 0), 1, 4096)),
      height: Math.round(clamp(Number(source.height ?? recipe?.height ?? recipe?.size ?? 0), 1, 4096)),
      recipe,
    });
    if (frames.length >= TEXTURE_LAB_ATLAS_LIFETIME_FRAME_LIMIT) break;
  }

  return frames.length > 0 ? frames : undefined;
}

export function normalizeTextureLabAtlasSettings(input: unknown): TextureLabAtlasSettings {
  const source = input && typeof input === 'object' ? (input as Partial<TextureLabAtlasSettings>) : {};
  const playback =
    typeof source.playback === 'string' && ATLAS_PLAYBACK_SET.has(source.playback)
      ? (source.playback as TextureLabAtlasPlaybackMode)
      : DEFAULT_TEXTURE_LAB_ATLAS_SETTINGS.playback;
  const frameLimit =
    playback === 'variants' ? TEXTURE_LAB_ATLAS_VARIANT_FRAME_LIMIT : TEXTURE_LAB_ATLAS_LIFETIME_FRAME_LIMIT;
  const columns = Math.round(clamp(Number(source.columns ?? DEFAULT_TEXTURE_LAB_ATLAS_SETTINGS.columns), 1, 8));
  const rows = Math.round(clamp(Number(source.rows ?? DEFAULT_TEXTURE_LAB_ATLAS_SETTINGS.rows), 1, 8));
  const capacity = Math.max(1, Math.min(frameLimit, columns * rows));
  return {
    enabled: source.enabled === true,
    mode:
      typeof source.mode === 'string' && ATLAS_MODE_SET.has(source.mode)
        ? (source.mode as TextureLabAtlasMode)
        : DEFAULT_TEXTURE_LAB_ATLAS_SETTINGS.mode,
    preset:
      typeof source.preset === 'string' && ATLAS_PRESET_SET.has(source.preset)
        ? (source.preset as TextureLabAtlasPreset)
        : DEFAULT_TEXTURE_LAB_ATLAS_SETTINGS.preset,
    columns,
    rows,
    frameCount: Math.round(
      clamp(Number(source.frameCount ?? DEFAULT_TEXTURE_LAB_ATLAS_SETTINGS.frameCount), 1, capacity),
    ),
    fps: Math.round(clamp(Number(source.fps ?? DEFAULT_TEXTURE_LAB_ATLAS_SETTINGS.fps), 1, 60)),
    seedStep: Math.round(clamp(Number(source.seedStep ?? DEFAULT_TEXTURE_LAB_ATLAS_SETTINGS.seedStep), 1, 9999)),
    playback,
    onionSkin: source.onionSkin !== false,
    customFrames: normalizeTextureLabAtlasCustomFrames(source.customFrames),
  };
}

function normalizeRecipe(input?: Partial<TextureLabRecipe> | null): TextureLabRecipe {
  const source = input ?? {};
  const size = normalizeDimension(source.size, DEFAULT_TEXTURE_LAB_RECIPE.size);
  const sourceHasWidth = Object.prototype.hasOwnProperty.call(source, 'width');
  const sourceHasHeight = Object.prototype.hasOwnProperty.call(source, 'height');
  const hasInheritedDefaultDimensions =
    size !== DEFAULT_TEXTURE_LAB_RECIPE.size &&
    sourceHasWidth &&
    sourceHasHeight &&
    Number(source.width) === DEFAULT_TEXTURE_LAB_RECIPE.width &&
    Number(source.height) === DEFAULT_TEXTURE_LAB_RECIPE.height;
  const width = normalizeDimension(sourceHasWidth && !hasInheritedDefaultDimensions ? source.width : size, size);
  const height = normalizeDimension(sourceHasHeight && !hasInheritedDefaultDimensions ? source.height : size, size);
  const generator =
    typeof source.generator === 'string' && GENERATOR_SET.has(source.generator)
      ? (source.generator as TextureLabGeneratorId)
      : DEFAULT_TEXTURE_LAB_RECIPE.generator;
  const colorRamp =
    typeof source.colorRamp === 'string' && RAMP_SET.has(source.colorRamp)
      ? (source.colorRamp as TextureLabColorRamp)
      : DEFAULT_TEXTURE_LAB_RECIPE.colorRamp;
  const alphaMode =
    typeof source.alphaMode === 'string' && ALPHA_SET.has(source.alphaMode)
      ? (source.alphaMode as TextureLabAlphaMode)
      : DEFAULT_TEXTURE_LAB_RECIPE.alphaMode;

  return {
    generator,
    size,
    width,
    height,
    seed: Math.max(1, Math.floor(Number(source.seed) || DEFAULT_TEXTURE_LAB_RECIPE.seed)),
    softness: clamp(Number(source.softness ?? DEFAULT_TEXTURE_LAB_RECIPE.softness), 0, 1),
    falloff: clamp(Number(source.falloff ?? DEFAULT_TEXTURE_LAB_RECIPE.falloff), 0.1, 6),
    contrast: clamp(Number(source.contrast ?? DEFAULT_TEXTURE_LAB_RECIPE.contrast), 0.1, 4),
    threshold: clamp(Number(source.threshold ?? DEFAULT_TEXTURE_LAB_RECIPE.threshold), 0, 1),
    scale: clamp(Number(source.scale ?? DEFAULT_TEXTURE_LAB_RECIPE.scale), 1, 32),
    distortion: clamp(Number(source.distortion ?? DEFAULT_TEXTURE_LAB_RECIPE.distortion), 0, 1),
    tileable: source.tileable !== false,
    pixelated: source.pixelated === true,
    alphaMode,
    colorRamp,
    solidColor: normalizeHexColor(source.solidColor, DEFAULT_TEXTURE_LAB_RECIPE.solidColor),
    backgroundColor: normalizeHexColor(source.backgroundColor, DEFAULT_TEXTURE_LAB_RECIPE.backgroundColor),
    backgroundAlpha: clamp(Number(source.backgroundAlpha ?? DEFAULT_TEXTURE_LAB_RECIPE.backgroundAlpha), 0, 1),
    imageMask: normalizeImageMaskRecipe(source.imageMask, generator),
    spline: normalizeSplineRecipe(source.spline, generator),
    shape: normalizeShapeRecipe(source.shape, generator),
    atlas: source.atlas ? normalizeTextureLabAtlasSettings(source.atlas) : undefined,
  };
}

function rampStops(ramp: TextureLabColorRamp): Array<[number, number, number, number]> {
  switch (ramp) {
    case 'fire':
      return [
        [0.16, 0.02, 0.01, 1],
        [1, 0.22, 0.02, 1],
        [1, 0.9, 0.28, 1],
        [1, 1, 1, 1],
      ];
    case 'smoke':
      return [
        [0.06, 0.06, 0.07, 1],
        [0.28, 0.28, 0.3, 1],
        [0.68, 0.66, 0.62, 1],
      ];
    case 'ice':
      return [
        [0.2, 0.55, 1, 1],
        [0.74, 0.94, 1, 1],
        [1, 1, 1, 1],
      ];
    case 'magic':
      return [
        [0.32, 0.1, 0.72, 1],
        [0.95, 0.24, 1, 1],
        [0.25, 0.9, 1, 1],
      ];
    case 'water':
      return [
        [0.02, 0.16, 0.34, 1],
        [0.06, 0.52, 0.86, 1],
        [0.74, 1, 1, 1],
      ];
    case 'gold':
      return [
        [0.4, 0.18, 0.02, 1],
        [1, 0.62, 0.08, 1],
        [1, 0.95, 0.45, 1],
      ];
    case 'rainbow':
      return [
        [1, 0.05, 0.1, 1],
        [1, 0.82, 0.05, 1],
        [0.1, 0.82, 0.24, 1],
        [0.05, 0.38, 1, 1],
        [0.8, 0.18, 1, 1],
      ];
    case 'grayscale':
      return [
        [0, 0, 0, 1],
        [1, 1, 1, 1],
      ];
    case 'white':
    default:
      return [
        [1, 1, 1, 1],
        [1, 1, 1, 1],
      ];
  }
}

function sampleRamp(ramp: TextureLabColorRamp, value: number, solidColor: string): [number, number, number, number] {
  if (ramp === 'solid') {
    const [red, green, blue] = hexToRgb(solidColor);
    return [red, green, blue, 1];
  }
  const stops = rampStops(ramp);
  const t = clamp01(value) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(t));
  const local = t - index;
  const a = stops[index];
  const b = stops[index + 1];
  return [lerp(a[0], b[0], local), lerp(a[1], b[1], local), lerp(a[2], b[2], local), lerp(a[3], b[3], local)];
}

function contrast(value: number, amount: number): number {
  return clamp01((value - 0.5) * amount + 0.5);
}

function shapeFalloff(distance: number, radius: number, softness: number, falloff: number): number {
  const edge = Math.max(0.002, softness * 0.55);
  return Math.pow(1 - smoothstep(radius - edge, radius + edge, distance), falloff);
}

function sdfRadius(recipe: TextureLabRecipe): number {
  return clamp(0.18 + recipe.threshold * 0.78, 0.18, 0.92);
}

function sdfSpread(recipe: TextureLabRecipe, scale = 0.5): number {
  return Math.max(0.002, recipe.softness * scale + 0.015);
}

function sdfCircleField(distance: number, radius: number, spread: number): number {
  return clamp01(0.5 - (distance - radius) / spread);
}

function roundedRectMask(x: number, y: number, radius: number): number {
  const bx = 0.68;
  const by = 0.5;
  const qx = Math.abs(x) - bx + radius;
  const qy = Math.abs(y) - by + radius;
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - radius;
}

type SampledSplinePoint = TextureLabSplinePoint & {
  progress: number;
  width: number;
};

type SampledSplinePath = {
  points: SampledSplinePoint[];
  closed: boolean;
};

type SplineSegmentHit = {
  distance: number;
  progress: number;
  width: number;
};

function splineWidthAt(spline: TextureLabSplineRecipe, progress: number): number {
  const start = lerp(1, 0.05, spline.taperStart * (1 - progress));
  const end = lerp(1, 0.05, spline.taperEnd * progress);
  return spline.strokeWidth * Math.max(0.03, start * end);
}

function catmullRom(
  p0: TextureLabSplinePoint,
  p1: TextureLabSplinePoint,
  p2: TextureLabSplinePoint,
  p3: TextureLabSplinePoint,
  t: number,
  tension: number,
): TextureLabSplinePoint {
  const t2 = t * t;
  const t3 = t2 * t;
  const tangent = (1 - tension) * 0.5;
  const m1x = (p2.x - p0.x) * tangent;
  const m1y = (p2.y - p0.y) * tangent;
  const m2x = (p3.x - p1.x) * tangent;
  const m2y = (p3.y - p1.y) * tangent;
  return {
    x: (2 * t3 - 3 * t2 + 1) * p1.x + (t3 - 2 * t2 + t) * m1x + (-2 * t3 + 3 * t2) * p2.x + (t3 - t2) * m2x,
    y: (2 * t3 - 3 * t2 + 1) * p1.y + (t3 - 2 * t2 + t) * m1y + (-2 * t3 + 3 * t2) * p2.y + (t3 - t2) * m2y,
  };
}

function splinePointAt(points: TextureLabSplinePoint[], index: number, closed: boolean): TextureLabSplinePoint {
  if (closed) {
    return points[((index % points.length) + points.length) % points.length];
  }
  return points[Math.min(points.length - 1, Math.max(0, index))];
}

function buildSampledSplinePath(recipe: TextureLabRecipe): SampledSplinePath | null {
  const spline = recipe.spline;
  if (!spline || !isTextureLabSplineGenerator(recipe.generator)) return null;
  const points = spline.points;
  const segmentCount = spline.closed ? points.length : points.length - 1;
  const stepsPerSegment = Math.max(4, Math.ceil(spline.samples / Math.max(1, segmentCount)));
  const sampled: SampledSplinePoint[] = [];

  for (let segment = 0; segment < segmentCount; segment += 1) {
    for (let step = 0; step < stepsPerSegment; step += 1) {
      if (segment > 0 && step === 0) continue;
      const local = step / stepsPerSegment;
      const raw = catmullRom(
        splinePointAt(points, segment - 1, spline.closed),
        splinePointAt(points, segment, spline.closed),
        splinePointAt(points, segment + 1, spline.closed),
        splinePointAt(points, segment + 2, spline.closed),
        local,
        spline.tension,
      );
      const progress = (segment + local) / Math.max(1, segmentCount);
      sampled.push({
        x: clamp01(raw.x),
        y: clamp01(raw.y),
        progress,
        width: splineWidthAt(spline, progress),
      });
    }
  }

  const finalProgress = spline.closed ? 1 : 1;
  const lastSource = spline.closed ? points[0] : points[points.length - 1];
  sampled.push({
    x: lastSource.x,
    y: lastSource.y,
    progress: finalProgress,
    width: splineWidthAt(spline, finalProgress),
  });

  if (recipe.generator === 'spline-lightning' && spline.jitter > 0) {
    for (let index = 1; index < sampled.length - 1; index += 1) {
      const prev = sampled[index - 1];
      const next = sampled[index + 1];
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const length = Math.hypot(dx, dy) || 1;
      const normalX = -dy / length;
      const normalY = dx / length;
      const amount = (random01(recipe.seed + 401, index, 0) - 0.5) * spline.jitter * 0.09;
      sampled[index] = {
        ...sampled[index],
        x: clamp01(sampled[index].x + normalX * amount),
        y: clamp01(sampled[index].y + normalY * amount),
      };
    }
  }

  return { points: sampled, closed: spline.closed };
}

function splineSegmentValue(
  recipe: TextureLabRecipe,
  distance: number,
  progress: number,
  width: number,
): { colorT: number; alpha: number } {
  const radius = width * 0.5;
  const feather = Math.max(0.001, (recipe.spline?.feather ?? 0) * 0.12);
  let alpha = 1 - smoothstep(radius, radius + feather, distance);
  alpha = Math.pow(clamp01(alpha), recipe.falloff);

  if (recipe.generator === 'sdf-spline-stroke') {
    const spread = Math.max(0.002, recipe.softness * 0.28 + feather);
    const field = clamp01(0.5 - (distance - radius) / spread);
    return { colorT: contrast(field, recipe.contrast), alpha: 1 };
  }
  if (recipe.generator === 'spline-ribbon') {
    const pulse = 0.65 + Math.sin(progress * Math.PI * 2) * 0.15;
    return { colorT: pulse, alpha };
  }
  if (recipe.generator === 'spline-mask') {
    return { colorT: alpha, alpha };
  }
  if (recipe.generator === 'spline-lightning') {
    const core = 1 - smoothstep(radius * 0.35, Math.max(radius * 0.35 + 0.001, radius), distance);
    return { colorT: Math.max(core, 0.7), alpha: Math.max(alpha * 0.7, core) };
  }
  return { colorT: 1 - progress * 0.8, alpha };
}

function splineGeneratorValue(
  recipe: TextureLabRecipe,
  u: number,
  v: number,
  path: SampledSplinePath | null | undefined,
): { colorT: number; alpha: number } {
  if (!recipe.spline || !path || path.points.length < 2) return { colorT: 0, alpha: 0 };
  let nearestHit: SplineSegmentHit | null = null;
  let mergedAlpha = 0;
  let addedAlpha = 0;
  let weightedColorT = 0;
  let weight = 0;
  const segments = path.points.length - 1;

  for (let index = 0; index < segments; index += 1) {
    const a = path.points[index];
    const b = path.points[(index + 1) % path.points.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy || 0.00001;
    const t = clamp01(((u - a.x) * dx + (v - a.y) * dy) / lengthSq);
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const distance = Math.hypot(u - px, v - py);
    const progress = lerp(a.progress, b.progress, t);
    const width = lerp(a.width, b.width, t);

    if (!nearestHit || distance < nearestHit.distance) {
      nearestHit = { distance, progress, width };
    }

    if (recipe.spline.overlapMode !== 'bridge') {
      const value = splineSegmentValue(recipe, distance, progress, width);
      if (value.alpha > 0.001) {
        mergedAlpha = Math.max(mergedAlpha, value.alpha);
        addedAlpha = 1 - (1 - addedAlpha) * (1 - value.alpha);
        weightedColorT += value.colorT * value.alpha;
        weight += value.alpha;
      }
    }
  }

  if (!nearestHit) return { colorT: 0, alpha: 0 };
  if (recipe.spline.overlapMode === 'merge' && weight > 0) {
    return { colorT: weightedColorT / weight, alpha: mergedAlpha };
  }
  if (recipe.spline.overlapMode === 'additive' && weight > 0) {
    return { colorT: weightedColorT / weight, alpha: addedAlpha };
  }
  return splineSegmentValue(recipe, nearestHit.distance, nearestHit.progress, nearestHit.width);
}

type ShapeLayerInstance = {
  x: number;
  y: number;
  rotation: number;
  scale: number;
};

type ShapePixel = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type TextureLabImageMaskSource = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
};

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy || 0.00001;
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / lengthSq);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function pointInPolygon(point: TextureLabSplinePoint, polygon: TextureLabSplinePoint[]): boolean {
  let inside = false;
  for (let index = 0, prev = polygon.length - 1; index < polygon.length; prev = index, index += 1) {
    const a = polygon[index];
    const b = polygon[prev];
    const crosses = a.y > point.y !== b.y > point.y;
    if (crosses && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y || 0.00001) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonSignedDistance(point: TextureLabSplinePoint, polygon: TextureLabSplinePoint[]): number {
  if (polygon.length < 3) return 1;
  let distance = 999;
  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index];
    const b = polygon[(index + 1) % polygon.length];
    distance = Math.min(distance, distanceToSegment(point.x, point.y, a.x, a.y, b.x, b.y));
  }
  return pointInPolygon(point, polygon) ? -distance : distance;
}

function rectSignedDistance(px: number, py: number, roundness: number): number {
  const x = Math.abs(px - 0.5) - (0.5 - roundness * 0.18);
  const y = Math.abs(py - 0.5) - (0.5 - roundness * 0.18);
  const outside = Math.hypot(Math.max(x, 0), Math.max(y, 0));
  const inside = Math.min(Math.max(x, y), 0);
  return outside + inside - roundness * 0.18;
}

function alphaFromSignedDistance(signedDistance: number, feather: number): number {
  return 1 - smoothstep(0, Math.max(0.0001, feather), signedDistance);
}

function strokeAlphaFromSignedDistance(signedDistance: number, strokeWidth: number, feather: number): number {
  if (strokeWidth <= 0) return 0;
  const halfWidth = strokeWidth * 0.5;
  return 1 - smoothstep(halfWidth, halfWidth + Math.max(0.0001, feather), Math.abs(signedDistance));
}

function shapeRepeatInstances(layer: TextureLabShapeElement, seed: number): ShapeLayerInstance[] {
  const repeat = layer.repeat;
  const count = repeat.mode === 'none' ? 1 : Math.max(1, repeat.count);
  const instances: ShapeLayerInstance[] = [];

  for (let index = 0; index < count; index += 1) {
    let x = layer.x;
    let y = layer.y;
    let rotation = layer.rotation;
    let scale = 1;

    if (repeat.mode === 'grid') {
      const columns = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / columns);
      const col = index % columns;
      const row = Math.floor(index / columns);
      x += (col - (columns - 1) / 2) * repeat.spacing;
      y += (row - (rows - 1) / 2) * repeat.spacing;
    } else if (repeat.mode === 'radial') {
      const angle = (index / count) * Math.PI * 2;
      x += Math.cos(angle) * repeat.radius;
      y += Math.sin(angle) * repeat.radius;
      rotation += angle / (Math.PI * 2);
    } else if (repeat.mode === 'scatter') {
      const angle = random01(seed + repeat.seedOffset + 17, index, 1) * Math.PI * 2;
      const radius = Math.sqrt(random01(seed + repeat.seedOffset + 29, index, 2)) * repeat.radius;
      x += Math.cos(angle) * radius;
      y += Math.sin(angle) * radius;
    }

    if (repeat.jitter > 0) {
      x += (random01(seed + repeat.seedOffset + 41, index, 3) - 0.5) * repeat.jitter;
      y += (random01(seed + repeat.seedOffset + 53, index, 4) - 0.5) * repeat.jitter;
    }
    if (repeat.rotationVariance > 0) {
      rotation += (random01(seed + repeat.seedOffset + 67, index, 5) - 0.5) * repeat.rotationVariance;
    }
    if (repeat.scaleVariance > 0) {
      scale += (random01(seed + repeat.seedOffset + 79, index, 6) - 0.5) * repeat.scaleVariance;
    }

    instances.push({ x, y, rotation, scale: Math.max(0.05, scale) });
  }

  return instances;
}

function shapeSignedDistance(layer: TextureLabShapeElement, px: number, py: number): number {
  if (layer.kind === 'ellipse' || layer.kind === 'dot') {
    return Math.hypot((px - 0.5) / 0.5, (py - 0.5) / 0.5) - 1;
  }
  if (layer.kind === 'rect') {
    return rectSignedDistance(px, py, layer.cornerRoundness);
  }
  if (layer.kind === 'polygon' || layer.kind === 'star') {
    return polygonSignedDistance(
      { x: px, y: py },
      layer.points ?? regularShapePoints(layer.sides, layer.innerRadius, layer.kind === 'star'),
    );
  }
  return 1;
}

function shapeSplineAlpha(layer: TextureLabShapeElement, px: number, py: number): number {
  const spline = layer.spline;
  if (!spline || spline.points.length < 2) return 0;
  let distance = 999;
  for (let index = 0; index < spline.points.length - 1; index += 1) {
    const a = spline.points[index];
    const b = spline.points[index + 1];
    distance = Math.min(distance, distanceToSegment(px, py, a.x, a.y, b.x, b.y));
  }
  if (spline.closed) {
    const a = spline.points[spline.points.length - 1];
    const b = spline.points[0];
    distance = Math.min(distance, distanceToSegment(px, py, a.x, a.y, b.x, b.y));
  }
  return strokeAlphaFromSignedDistance(distance, Math.max(0.01, layer.strokeWidth), layer.feather * 0.22);
}

function blendChannel(source: number, destination: number, mode: TextureLabShapeBlendMode): number {
  if (mode === 'add') return clamp01(source + destination);
  if (mode === 'multiply') return source * destination;
  if (mode === 'screen') return 1 - (1 - source) * (1 - destination);
  return source;
}

function compositeShapePixel(
  base: ShapePixel,
  color: [number, number, number],
  alpha: number,
  mode: TextureLabShapeBlendMode,
): ShapePixel {
  const sourceAlpha = clamp01(alpha);
  if (sourceAlpha <= 0) return base;
  const source: [number, number, number] = [
    blendChannel(color[0], base.r, mode),
    blendChannel(color[1], base.g, mode),
    blendChannel(color[2], base.b, mode),
  ];
  const outputAlpha = sourceAlpha + base.a * (1 - sourceAlpha);
  if (outputAlpha <= 0) return { r: source[0], g: source[1], b: source[2], a: 0 };
  return {
    r: (source[0] * sourceAlpha + base.r * base.a * (1 - sourceAlpha)) / outputAlpha,
    g: (source[1] * sourceAlpha + base.g * base.a * (1 - sourceAlpha)) / outputAlpha,
    b: (source[2] * sourceAlpha + base.b * base.a * (1 - sourceAlpha)) / outputAlpha,
    a: outputAlpha,
  };
}

function shapeLayerPixel(layer: TextureLabShapeElement, u: number, v: number, seed: number): ShapePixel {
  if (!layer.enabled) return { r: 0, g: 0, b: 0, a: 0 };
  const fillColor = hexToRgb(layer.fillColor);
  const strokeColor = hexToRgb(layer.strokeColor);
  let pixel: ShapePixel = { r: 0, g: 0, b: 0, a: 0 };

  for (const instance of shapeRepeatInstances(layer, seed)) {
    const size = Math.max(0.001, layer.size * instance.scale);
    const angle = -(layer.rotation + instance.rotation) * Math.PI * 2;
    const dx = u - instance.x;
    const dy = v - instance.y;
    const localX = (dx * Math.cos(angle) - dy * Math.sin(angle)) / size + 0.5;
    const localY = (dx * Math.sin(angle) + dy * Math.cos(angle)) / size + 0.5;
    if (localX < -0.4 || localX > 1.4 || localY < -0.4 || localY > 1.4) continue;

    if (layer.kind === 'spline') {
      const alpha = shapeSplineAlpha(layer, localX, localY) * layer.opacity;
      pixel = compositeShapePixel(pixel, strokeColor, alpha, layer.blendMode);
      continue;
    }

    if (layer.kind === 'ring') {
      const distance = Math.hypot(localX - 0.5, localY - 0.5);
      const alpha =
        (1 -
          smoothstep(
            layer.strokeWidth,
            layer.strokeWidth + Math.max(0.0001, layer.feather * 0.2),
            Math.abs(distance - 0.34),
          )) *
        layer.opacity;
      pixel = compositeShapePixel(pixel, strokeColor, alpha, layer.blendMode);
      continue;
    }

    const signedDistance = shapeSignedDistance(layer, localX, localY);
    const feather = layer.feather * 0.22 + layer.cornerRoundness * 0.015;
    const fillAlpha = alphaFromSignedDistance(signedDistance, feather) * layer.opacity;
    const strokeAlpha = strokeAlphaFromSignedDistance(signedDistance, layer.strokeWidth, feather) * layer.opacity;
    pixel = compositeShapePixel(pixel, fillColor, fillAlpha, layer.blendMode);
    pixel = compositeShapePixel(pixel, strokeColor, strokeAlpha, layer.blendMode);
  }

  return pixel;
}

function shapeComposerPixel(recipe: TextureLabRecipe, u: number, v: number): ShapePixel {
  const layers = recipe.shape?.layers ?? [];
  return layers.reduce<ShapePixel>(
    (pixel, layer, index) => {
      const layerPixel = shapeLayerPixel(layer, u, v, recipe.seed + index * 101);
      return compositeShapePixel(pixel, [layerPixel.r, layerPixel.g, layerPixel.b], layerPixel.a, layer.blendMode);
    },
    { r: 0, g: 0, b: 0, a: 0 },
  );
}

function shaderMapCoordinate(value: number, tileable: boolean): number {
  return tileable ? fract(value + 1) : clamp01(value);
}

function shaderMapHeight(recipe: TextureLabRecipe, u: number, v: number): number {
  const n = fbm(u, v, recipe.scale, recipe.seed, recipe.tileable);
  if (recipe.generator === 'water-ripple-normal') {
    const rippleA = 0.5 + 0.5 * Math.sin((u * recipe.scale + n * recipe.distortion * 4.5) * Math.PI * 2);
    const rippleB =
      0.5 +
      0.5 *
        Math.sin(((u + v * 0.62) * recipe.scale * 0.72 + n * recipe.distortion * 3.5) * Math.PI * 2 + 0.7);
    const rippleC =
      0.5 +
      0.5 *
        Math.sin(((v - u * 0.28) * recipe.scale * 0.55 + n * recipe.distortion * 2.25) * Math.PI * 2 + 1.3);
    return contrast((rippleA * 0.42 + rippleB * 0.34 + rippleC * 0.18 + n * 0.18) / 1.14, recipe.contrast);
  }
  const detail = fbm(u + 0.37, v + 0.19, recipe.scale * 1.85, recipe.seed + 73, recipe.tileable);
  return contrast(n * 0.76 + detail * 0.24, recipe.contrast);
}

function encodeSignedVector(value: number): number {
  return clamp01(value * 0.5 + 0.5);
}

function encodeShaderVector(x: number, y: number, blue = 0.5): [number, number, number, number] {
  return [encodeSignedVector(x), encodeSignedVector(y), clamp01(blue), 1];
}

function shaderNormalMapPixel(
  recipe: TextureLabRecipe,
  u: number,
  v: number,
  width: number,
  height: number,
): [number, number, number, number] {
  const stepU = 1 / Math.max(2, width);
  const stepV = 1 / Math.max(2, height);
  const left = shaderMapHeight(recipe, shaderMapCoordinate(u - stepU, recipe.tileable), v);
  const right = shaderMapHeight(recipe, shaderMapCoordinate(u + stepU, recipe.tileable), v);
  const up = shaderMapHeight(recipe, u, shaderMapCoordinate(v - stepV, recipe.tileable));
  const down = shaderMapHeight(recipe, u, shaderMapCoordinate(v + stepV, recipe.tileable));
  const strength = 2 + recipe.distortion * 12;
  const nx = (left - right) * strength;
  const ny = (up - down) * strength;
  const nz = 1;
  const length = Math.hypot(nx, ny, nz) || 1;
  return [nx / length * 0.5 + 0.5, ny / length * 0.5 + 0.5, nz / length * 0.5 + 0.5, 1];
}

function shaderMapPixel(
  recipe: TextureLabRecipe,
  u: number,
  v: number,
  width: number,
  height: number,
): [number, number, number, number] {
  if (recipe.generator === 'normal-from-height' || recipe.generator === 'water-ripple-normal') {
    return shaderNormalMapPixel(recipe, u, v, width, height);
  }

  const n = fbm(u, v, recipe.scale, recipe.seed, recipe.tileable);
  const detail = fbm(u + 0.31, v + 0.47, recipe.scale * 1.7, recipe.seed + 191, recipe.tileable);
  const strength = clamp01((0.2 + recipe.distortion * 0.8) * (0.65 + recipe.contrast * 0.35));

  if (recipe.generator === 'radial-swirl-flow') {
    const cx = u - 0.5;
    const cy = v - 0.5;
    const distance = Math.hypot(cx, cy);
    const length = distance || 1;
    const falloff = Math.pow(clamp01(1 - distance * 1.55), recipe.falloff);
    const noise = (n - 0.5) * recipe.distortion * 0.45;
    const x = (-cy / length + noise) * strength * falloff;
    const y = (cx / length - noise) * strength * falloff;
    return encodeShaderVector(x, y, falloff);
  }

  if (recipe.generator === 'directional-distortion-map') {
    const direction = -0.18 + (detail - 0.5) * recipe.distortion * 1.2;
    const magnitude = strength * (0.52 + contrast(n, recipe.contrast) * 0.48);
    const x = Math.cos(direction) * magnitude;
    const y = Math.sin(direction) * magnitude + (detail - 0.5) * strength * 0.42;
    return encodeShaderVector(x, y, n);
  }

  const angle = (n * 2 + detail * 0.65) * Math.PI * 2;
  const magnitude = strength * (0.35 + contrast(detail, recipe.contrast) * 0.65);
  return encodeShaderVector(Math.cos(angle) * magnitude, Math.sin(angle) * magnitude, detail);
}

function imageMaskSourceOffset(source: TextureLabImageMaskSource, x: number, y: number): number {
  const safeX = Math.min(source.width - 1, Math.max(0, x));
  const safeY = Math.min(source.height - 1, Math.max(0, y));
  return (safeY * source.width + safeX) * 4;
}

function imageMaskLuminanceAt(source: TextureLabImageMaskSource, x: number, y: number): number {
  const offset = imageMaskSourceOffset(source, x, y);
  const alpha = source.pixels[offset + 3] / 255;
  const red = source.pixels[offset] / 255;
  const green = source.pixels[offset + 1] / 255;
  const blue = source.pixels[offset + 2] / 255;
  return clamp01((red * 0.299 + green * 0.587 + blue * 0.114) * alpha);
}

function imageMaskValue(recipe: TextureLabRecipe, source: TextureLabImageMaskSource, x: number, y: number): number {
  const offset = imageMaskSourceOffset(source, x, y);
  const alpha = source.pixels[offset + 3] / 255;
  const luminance = contrast(imageMaskLuminanceAt(source, x, y), recipe.contrast);

  if (recipe.generator === 'image-alpha-mask') return alpha;
  if (recipe.generator === 'image-luminance-mask') return luminance;
  if (recipe.generator === 'image-threshold-mask') {
    const edge = Math.max(0.0001, recipe.softness * 0.5);
    return smoothstep(recipe.threshold - edge, recipe.threshold + edge, luminance);
  }
  if (recipe.generator === 'image-color-key-mask') {
    const [targetRed, targetGreen, targetBlue] = hexToRgb(recipe.imageMask?.colorKey ?? '#000000');
    const red = source.pixels[offset] / 255;
    const green = source.pixels[offset + 1] / 255;
    const blue = source.pixels[offset + 2] / 255;
    const distance = Math.hypot(red - targetRed, green - targetGreen, blue - targetBlue) / Math.sqrt(3);
    return 1 - smoothstep(recipe.threshold, recipe.threshold + Math.max(0.0001, recipe.softness * 0.65), distance);
  }

  const left = imageMaskLuminanceAt(source, x - 1, y);
  const right = imageMaskLuminanceAt(source, x + 1, y);
  const up = imageMaskLuminanceAt(source, x, y - 1);
  const down = imageMaskLuminanceAt(source, x, y + 1);
  const edge = Math.hypot(right - left, down - up) * recipe.contrast * 1.6;
  return smoothstep(recipe.threshold, recipe.threshold + Math.max(0.0001, recipe.softness * 0.7), edge);
}

function imageMaskPixel(
  recipe: TextureLabRecipe,
  source: TextureLabImageMaskSource,
  x: number,
  y: number,
): { color: [number, number, number, number]; alpha: number } {
  const value = clamp01(imageMaskValue(recipe, source, x, y));
  if (recipe.generator === 'image-alpha-mask') return { color: [value, value, value, 1], alpha: value };
  return { color: [value, value, value, 1], alpha: 1 };
}

function generatorValue(
  recipe: TextureLabRecipe,
  u: number,
  v: number,
  x: number,
  y: number,
  splinePath?: SampledSplinePath | null,
): { colorT: number; alpha: number } {
  if (isTextureLabSplineGenerator(recipe.generator)) {
    return splineGeneratorValue(recipe, u, v, splinePath);
  }
  if (isTextureLabImageMaskGenerator(recipe.generator)) {
    return { colorT: 0, alpha: 0 };
  }

  const cx = (u - 0.5) * 2;
  const cy = (v - 0.5) * 2;
  const n = fbm(u, v, recipe.scale, recipe.seed, recipe.tileable);
  const d = Math.hypot(cx, cy);
  const angle = Math.atan2(cy, cx);
  const rays = Math.abs(Math.cos(angle * 4));
  const line = Math.abs(cy);
  const diagonal = Math.abs((cy + cx * 0.8) / Math.sqrt(1.64));
  const checker = (Math.floor(u * recipe.scale) + Math.floor(v * recipe.scale)) % 2 === 0 ? 1 : 0;

  switch (recipe.generator) {
    case 'soft-circle': {
      const alpha = shapeFalloff(d, 0.78, recipe.softness, recipe.falloff) * (0.96 + n * 0.04);
      return { colorT: 1 - d * 0.7, alpha };
    }
    case 'spark': {
      const alpha = Math.max(
        shapeFalloff(d, 0.55, recipe.softness * 0.4, recipe.falloff),
        Math.pow(rays, 12) * shapeFalloff(d, 0.95, 0.15, 1),
      );
      return { colorT: 1 - d * 0.5, alpha };
    }
    case 'streak': {
      const tail = shapeFalloff(Math.abs(cx) * 0.65, 0.92, recipe.softness, recipe.falloff);
      const alpha = tail * Math.exp(-line * line * 36);
      return { colorT: 1 - Math.abs(cx) * 0.45, alpha };
    }
    case 'ring': {
      const alpha = 1 - smoothstep(0.04, 0.05 + recipe.softness * 0.18, Math.abs(d - 0.58));
      return { colorT: alpha, alpha: clamp01(alpha) };
    }
    case 'smoke-puff': {
      const alpha = shapeFalloff(d + (n - 0.5) * 0.35, 0.78, recipe.softness, recipe.falloff);
      return { colorT: n, alpha: alpha * 0.82 };
    }
    case 'star': {
      const points = Math.pow(Math.abs(Math.cos(angle * 5)), 4);
      const alpha = shapeFalloff(d * (1.3 - points * 0.45), 0.58, recipe.softness * 0.55, recipe.falloff);
      return { colorT: points, alpha };
    }
    case 'trail-blob': {
      const tail = smoothstep(0.95, -0.75, cx);
      const thickness = 0.2 + tail * 0.3;
      const alpha =
        tail *
        Math.exp(-(cy * cy) / Math.max(0.01, thickness * thickness)) *
        shapeFalloff(Math.abs(cx) * 0.8, 0.95, recipe.softness, 1);
      return { colorT: tail, alpha };
    }
    case 'rain-slash': {
      return { colorT: 0.75, alpha: Math.exp(-diagonal * diagonal * 120) * shapeFalloff(Math.abs(cx), 0.92, 0.08, 1) };
    }
    case 'circle-mask':
      return {
        colorT: shapeFalloff(d, 0.76, recipe.softness, recipe.falloff),
        alpha: shapeFalloff(d, 0.76, recipe.softness, recipe.falloff),
      };
    case 'ellipse-mask': {
      const ed = Math.hypot(cx / 0.95, cy / 0.58);
      return {
        colorT: shapeFalloff(ed, 0.82, recipe.softness, recipe.falloff),
        alpha: shapeFalloff(ed, 0.82, recipe.softness, recipe.falloff),
      };
    }
    case 'rounded-rect-mask': {
      const mask = 1 - smoothstep(-0.02, recipe.softness * 0.35, roundedRectMask(cx, cy, 0.28));
      return { colorT: mask, alpha: mask };
    }
    case 'radial-mask': {
      const value = clamp01(1 - Math.pow(d, recipe.falloff));
      return { colorT: value, alpha: value };
    }
    case 'threshold-noise-mask': {
      const value = n >= recipe.threshold ? 1 : 0;
      return { colorT: value, alpha: value };
    }
    case 'sdf-circle': {
      const value = sdfCircleField(d, sdfRadius(recipe), sdfSpread(recipe));
      return { colorT: contrast(value, recipe.contrast), alpha: 1 };
    }
    case 'sdf-ring': {
      const radius = sdfRadius(recipe);
      const width = 0.035 + recipe.softness * 0.18;
      const spread = sdfSpread(recipe, 0.35);
      const value = clamp01(0.5 - (Math.abs(d - radius) - width) / spread);
      return { colorT: contrast(value, recipe.contrast), alpha: 1 };
    }
    case 'sdf-soft-outline': {
      const radius = sdfRadius(recipe);
      const width = 0.035 + recipe.threshold * 0.15;
      const spread = sdfSpread(recipe, 0.42);
      const value = Math.pow(clamp01(1 - smoothstep(width, width + spread, Math.abs(d - radius))), recipe.falloff);
      return { colorT: value, alpha: value };
    }
    case 'sdf-inner-glow': {
      const radius = sdfRadius(recipe);
      const spread = sdfSpread(recipe, 0.7);
      const rim = smoothstep(radius - spread, radius, d);
      const inside = 1 - smoothstep(radius, radius + 0.01, d);
      const value = Math.pow(clamp01(rim * inside), recipe.falloff);
      return { colorT: value, alpha: value };
    }
    case 'sdf-outer-glow': {
      const radius = sdfRadius(recipe);
      const spread = sdfSpread(recipe, 0.82);
      const outside = smoothstep(radius - 0.01, radius + 0.01, d);
      const fade = 1 - smoothstep(radius, radius + spread, d);
      const value = Math.pow(clamp01(outside * fade), recipe.falloff);
      return { colorT: value, alpha: value };
    }
    case 'cloud-noise':
      return { colorT: n, alpha: n };
    case 'cellular-spots': {
      const value = cellular(u, v, recipe.scale, recipe.seed, recipe.tileable);
      return { colorT: value, alpha: value };
    }
    case 'dissolve-noise': {
      const value = contrast(n, recipe.contrast * 1.8);
      return { colorT: value, alpha: value };
    }
    case 'water-noise': {
      const waves = 0.5 + 0.5 * Math.sin((u * recipe.scale + n * recipe.distortion * 6 + v * 2) * Math.PI * 2);
      const value = contrast((n + waves) * 0.5, recipe.contrast);
      return { colorT: value, alpha: value };
    }
    case 'height-map': {
      const value = contrast((n + (1 - d) * 0.35) / 1.35, recipe.contrast);
      return { colorT: value, alpha: 1 };
    }
    case 'directional-gradient':
      return { colorT: u, alpha: 1 };
    case 'checker':
      return { colorT: checker, alpha: 1 };
    case 'dither': {
      const matrix = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
      const threshold = matrix[(x % 4) + (y % 4) * 4] / 16;
      const value = u > threshold ? 1 : 0;
      return { colorT: value, alpha: 1 };
    }
    case 'scanline': {
      const value = y % 4 < 2 ? 1 : 0.22;
      return { colorT: value, alpha: 1 };
    }
    case 'palette-ramp':
      return { colorT: u, alpha: 1 };
    default:
      return { colorT: n, alpha: n };
  }
}

export function normalizeTextureLabRecipe(input?: Partial<TextureLabRecipe> | null): TextureLabRecipe {
  return normalizeRecipe(input);
}

export function textureLabRecipeDimensions(input?: Partial<TextureLabRecipe> | null): { width: number; height: number } {
  const recipe = normalizeRecipe(input);
  return { width: recipe.width, height: recipe.height };
}

function normalizeSavedRecipeName(name: unknown, fallback: string): string {
  const value = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  return (value || fallback).slice(0, 64);
}

function normalizeSavedRecipeId(id: unknown, index: number): string {
  const value = typeof id === 'string' ? id.trim() : '';
  return value || `saved-recipe-${index + 1}`;
}

function normalizeSavedRecipeTime(value: unknown): number {
  const time = Number(value);
  return Number.isFinite(time) && time >= 0 ? time : 0;
}

export function normalizeTextureLabSavedRecipes(input?: unknown): TextureLabSavedRecipe[] {
  if (!Array.isArray(input)) return [];
  const names = new Set<string>();
  const ids = new Set<string>();
  const recipes: TextureLabSavedRecipe[] = [];

  for (const [index, item] of input.entries()) {
    if (!item || typeof item !== 'object') continue;
    const source = item as Partial<TextureLabSavedRecipe>;
    const recipe = normalizeTextureLabRecipe(source.recipe);
    const name = normalizeSavedRecipeName(source.name, `Recipe ${index + 1}`);
    const nameKey = name.toLowerCase();
    if (names.has(nameKey)) continue;
    names.add(nameKey);

    const baseId = normalizeSavedRecipeId(source.id, index);
    let id = baseId;
    let suffix = 2;
    while (ids.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }
    ids.add(id);

    const createdAt = normalizeSavedRecipeTime(source.createdAt);
    const updatedAt = Math.max(createdAt, normalizeSavedRecipeTime(source.updatedAt));
    recipes.push({ id, name, recipe, createdAt, updatedAt });
    if (recipes.length >= TEXTURE_LAB_SAVED_RECIPE_LIMIT) break;
  }

  return recipes;
}

export function textureLabAtlasPresetBaseGenerator(preset: TextureLabAtlasPreset): TextureLabRecipe['generator'] {
  if (preset === 'custom-frames') return 'soft-circle';
  if (preset === 'seeded-spark') return 'spark';
  if (preset === 'smoke-variants') return 'smoke-puff';
  if (preset === 'rain-variants') return 'rain-slash';
  if (preset === 'dissolve-loop') return 'threshold-noise-mask';
  return 'ring';
}

export function textureLabAtlasFrameRecipe(
  recipe: TextureLabRecipe,
  atlas: TextureLabAtlasSettings,
  index: number,
): TextureLabRecipe {
  const progress = atlas.frameCount <= 1 ? 0 : index / (atlas.frameCount - 1);
  const seed = recipe.seed + index * atlas.seedStep;

  if (atlas.preset === 'custom-frames') {
    return normalizeRecipe({ ...recipe, seed, atlas: undefined });
  }

  if (atlas.preset === 'seeded-spark') {
    return normalizeRecipe({
      ...defaultTextureLabRecipeForGenerator('spark'),
      ...recipe,
      generator: 'spark',
      seed,
      softness: clamp(recipe.softness * (0.75 + progress * 0.35), 0, 1),
      falloff: clamp(recipe.falloff * (0.9 + (index % 3) * 0.08), 0.1, 6),
      atlas: undefined,
    });
  }

  if (atlas.preset === 'smoke-variants') {
    return normalizeRecipe({
      ...defaultTextureLabRecipeForGenerator('smoke-puff'),
      ...recipe,
      generator: 'smoke-puff',
      seed,
      scale: clamp(recipe.scale + (index % 5) - 2, 1, 32),
      softness: clamp(0.55 + progress * 0.25, 0, 1),
      distortion: clamp(recipe.distortion + 0.12, 0, 1),
      colorRamp: recipe.colorRamp === 'white' ? 'smoke' : recipe.colorRamp,
      atlas: undefined,
    });
  }

  if (atlas.preset === 'rain-variants') {
    return normalizeRecipe({
      ...defaultTextureLabRecipeForGenerator('rain-slash'),
      ...recipe,
      generator: 'rain-slash',
      seed,
      softness: clamp(0.06 + (index % 4) * 0.02, 0, 1),
      falloff: clamp(1 + progress * 0.5, 0.1, 6),
      colorRamp: recipe.colorRamp === 'white' ? 'ice' : recipe.colorRamp,
      atlas: undefined,
    });
  }

  if (atlas.preset === 'dissolve-loop') {
    const loopProgress = atlas.frameCount <= 1 ? 0 : index / atlas.frameCount;
    const threshold = 0.12 + (0.76 * (1 - Math.cos(loopProgress * Math.PI * 2))) / 2;
    return normalizeRecipe({
      ...defaultTextureLabRecipeForGenerator('threshold-noise-mask'),
      ...recipe,
      generator: 'threshold-noise-mask',
      seed,
      threshold,
      scale: clamp(recipe.scale, 2, 32),
      contrast: clamp(recipe.contrast * 1.2, 0.1, 4),
      alphaMode: 'luminance',
      colorRamp: recipe.colorRamp === 'white' ? 'grayscale' : recipe.colorRamp,
      atlas: undefined,
    });
  }

  if (atlas.preset === 'impact-ring') {
    const size = 0.18 + progress * 0.92;
    const opacity = Math.max(0.08, 1 - progress * 0.82);
    return normalizeRecipe({
      ...defaultTextureLabRecipeForGenerator('shape-composer'),
      ...recipe,
      generator: 'shape-composer',
      seed,
      shape: shapeRecipe(
        [
          textureLabShapeElement('ring', {
            id: 'impact-ring',
            label: 'Impact Ring',
            x: 0.5,
            y: 0.5,
            size,
            opacity,
            fillColor: '#ffffff',
            strokeColor: '#ffffff',
            strokeWidth: 0.08,
            feather: clamp(0.04 + progress * 0.12, 0, 0.45),
          }),
        ],
        'impact-ring',
      ),
      alphaMode: 'shape',
      backgroundAlpha: 0,
      atlas: undefined,
    });
  }

  return normalizeRecipe({ ...recipe, seed, atlas: undefined });
}

export function textureLabAtlasFrameFromRecipe(
  input: Partial<TextureLabRecipe> | null | undefined,
  index: number,
): TextureLabAtlasCustomFrame {
  const recipe = textureLabRecipeWithoutAtlas(input);
  const { width, height } = textureLabRecipeDimensions(recipe);
  const label =
    TEXTURE_LAB_GENERATORS.find((generator) => generator.id === recipe.generator)?.label ?? recipe.generator;
  return {
    id: `atlas-frame-${index + 1}-${recipe.generator}-${recipe.seed}`,
    name: `Frame ${index + 1} - ${label}`,
    dataBase64: TEXTURE_LAB_RECIPE_FRAME_PLACEHOLDER,
    width,
    height,
    recipe,
  };
}

export function textureLabMaterializeAtlasFrames(
  input?: Partial<TextureLabRecipe> | null,
  atlasInput?: Partial<TextureLabAtlasSettings> | null,
  fillPreset?: TextureLabAtlasPreset,
): TextureLabAtlasCustomFrame[] {
  const sourceRecipe = normalizeRecipe(input);
  const preset = fillPreset ?? atlasInput?.preset ?? sourceRecipe.atlas?.preset ?? 'custom-frames';
  const atlas = normalizeTextureLabAtlasSettings({
    ...sourceRecipe.atlas,
    ...atlasInput,
    enabled: true,
    preset,
  });

  if (preset === 'custom-frames') {
    return Array.from({ length: atlas.frameCount }, (_, index) => textureLabAtlasFrameFromRecipe(sourceRecipe, index));
  }

  const baseRecipe = normalizeRecipe({
    ...defaultTextureLabRecipeForGenerator(textureLabAtlasPresetBaseGenerator(preset)),
    size: sourceRecipe.size,
    width: sourceRecipe.width,
    height: sourceRecipe.height,
    seed: sourceRecipe.seed,
    atlas: undefined,
  });
  const presetAtlas = normalizeTextureLabAtlasSettings({ ...atlas, preset, enabled: true });
  return Array.from({ length: presetAtlas.frameCount }, (_, index) =>
    textureLabAtlasFrameFromRecipe(textureLabAtlasFrameRecipe(baseRecipe, presetAtlas, index), index),
  );
}

function atlasMetadata(
  atlas: TextureLabAtlasSettings,
  frameWidth: number,
  frameHeight: number,
): TextureLabAtlasMetadata {
  const width = atlas.columns * frameWidth;
  const height = atlas.rows * frameHeight;
  const duration = 1 / atlas.fps;
  const frames = Array.from({ length: atlas.frameCount }, (_, index) => ({
    index,
    x: (index % atlas.columns) * frameWidth,
    y: Math.floor(index / atlas.columns) * frameHeight,
    width: frameWidth,
    height: frameHeight,
    duration,
  }));
  return {
    mode: atlas.mode,
    preset: atlas.preset,
    playback: atlas.playback,
    columns: atlas.columns,
    rows: atlas.rows,
    frameCount: atlas.frameCount,
    fps: atlas.fps,
    frameWidth,
    frameHeight,
    width,
    height,
    frames,
  };
}

export function renderTextureLabAtlasPixels(input?: Partial<TextureLabRecipe> | null): TextureLabAtlasPixels {
  const recipe = normalizeRecipe(input);
  const atlas = normalizeTextureLabAtlasSettings({ ...recipe.atlas, enabled: true });
  const { width: frameWidth, height: frameHeight } = textureLabRecipeDimensions(recipe);
  const metadata = atlasMetadata(atlas, frameWidth, frameHeight);
  const pixels = new Uint8ClampedArray(metadata.width * metadata.height * 4);
  const frames: TextureLabAtlasFramePixels[] = [];

  for (let index = 0; index < atlas.frameCount; index += 1) {
    const frameRecipe = textureLabAtlasFrameRecipe(recipe, atlas, index);
    const frame = renderTextureLabPixels(frameRecipe);
    const frameX = (index % atlas.columns) * frameWidth;
    const frameY = Math.floor(index / atlas.columns) * frameHeight;
    for (let y = 0; y < frameHeight; y += 1) {
      const targetOffset = ((frameY + y) * metadata.width + frameX) * 4;
      const sourceOffset = y * frameWidth * 4;
      pixels.set(frame.pixels.subarray(sourceOffset, sourceOffset + frameWidth * 4), targetOffset);
    }
    frames.push({
      ...frame,
      index,
      progress: atlas.frameCount <= 1 ? 0 : index / (atlas.frameCount - 1),
    });
  }

  return {
    width: metadata.width,
    height: metadata.height,
    pixels,
    recipe: { ...recipe, atlas },
    atlas: metadata,
    frames,
  };
}

function writeTextureLabPixel(
  pixels: Uint8ClampedArray,
  offset: number,
  color: [number, number, number, number],
  alpha: number,
  recipe: TextureLabRecipe,
): void {
  const backgroundColor = hexToRgb(recipe.backgroundColor);
  const backgroundAlpha = recipe.backgroundAlpha;
  const foregroundAlpha = alpha * color[3];
  const finalAlpha = foregroundAlpha + backgroundAlpha * (1 - foregroundAlpha);
  const finalColor: [number, number, number] =
    finalAlpha > 0
      ? [
          (color[0] * foregroundAlpha + backgroundColor[0] * backgroundAlpha * (1 - foregroundAlpha)) / finalAlpha,
          (color[1] * foregroundAlpha + backgroundColor[1] * backgroundAlpha * (1 - foregroundAlpha)) / finalAlpha,
          (color[2] * foregroundAlpha + backgroundColor[2] * backgroundAlpha * (1 - foregroundAlpha)) / finalAlpha,
        ]
      : [color[0], color[1], color[2]];

  pixels[offset] = Math.round(clamp01(finalColor[0]) * 255);
  pixels[offset + 1] = Math.round(clamp01(finalColor[1]) * 255);
  pixels[offset + 2] = Math.round(clamp01(finalColor[2]) * 255);
  pixels[offset + 3] = Math.round(finalAlpha * 255);
}

export function renderTextureLabPixels(input?: Partial<TextureLabRecipe> | null): TextureLabGeneratedPixels {
  const recipe = normalizeRecipe(input);
  const { width, height } = textureLabRecipeDimensions(recipe);
  const pixels = new Uint8ClampedArray(width * height * 4);
  const splinePath = buildSampledSplinePath(recipe);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let u = recipe.tileable ? (x === width - 1 ? 0 : x / Math.max(1, width - 1)) : (x + 0.5) / width;
      let v = recipe.tileable ? (y === height - 1 ? 0 : y / Math.max(1, height - 1)) : (y + 0.5) / height;
      if (
        recipe.distortion > 0 &&
        !recipe.generator.includes('checker') &&
        recipe.generator !== 'dither' &&
        !isTextureLabShaderMapGenerator(recipe.generator)
      ) {
        const dx = fbm(u, v, recipe.scale, recipe.seed + 211, recipe.tileable) - 0.5;
        const dy = fbm(u, v, recipe.scale, recipe.seed + 307, recipe.tileable) - 0.5;
        u = recipe.tileable ? fract(u + dx * recipe.distortion * 0.12 + 1) : clamp01(u + dx * recipe.distortion * 0.12);
        v = recipe.tileable ? fract(v + dy * recipe.distortion * 0.12 + 1) : clamp01(v + dy * recipe.distortion * 0.12);
      }

      let color: [number, number, number, number];
      let alpha: number;
      if (isTextureLabShaderMapGenerator(recipe.generator)) {
        color = shaderMapPixel(recipe, u, v, width, height);
        alpha = 1;
      } else if (recipe.generator === 'shape-composer') {
        const shapePixel = shapeComposerPixel(recipe, u, v);
        color = [shapePixel.r, shapePixel.g, shapePixel.b, 1];
        const luminance = clamp01(shapePixel.r * 0.299 + shapePixel.g * 0.587 + shapePixel.b * 0.114);
        alpha = clamp01(shapePixel.a);
        if (recipe.alphaMode === 'opaque') alpha = 1;
        if (recipe.alphaMode === 'luminance') alpha = luminance;
        if (recipe.alphaMode === 'inverted') alpha = 1 - alpha;
      } else {
        const value = generatorValue(recipe, u, v, x, y, splinePath);
        const colorT = contrast(value.colorT, recipe.contrast);
        color = sampleRamp(recipe.colorRamp, colorT, recipe.solidColor);
        alpha = clamp01(value.alpha);
        if (recipe.alphaMode === 'opaque') alpha = 1;
        if (recipe.alphaMode === 'luminance') alpha = colorT;
        if (recipe.alphaMode === 'inverted') alpha = 1 - alpha;
      }

      const offset = (y * width + x) * 4;
      writeTextureLabPixel(pixels, offset, color, alpha, recipe);
    }
  }

  return { width, height, pixels, recipe };
}

export function renderTextureLabImageMaskPixels(
  input: Partial<TextureLabRecipe> | null | undefined,
  source: TextureLabImageMaskSource,
): TextureLabGeneratedPixels {
  const recipe = normalizeRecipe(input);
  const { width, height } = textureLabRecipeDimensions(recipe);
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.round((x / Math.max(1, width - 1)) * Math.max(0, source.width - 1));
      const sourceY = Math.round((y / Math.max(1, height - 1)) * Math.max(0, source.height - 1));
      const { color, alpha } = imageMaskPixel(recipe, source, sourceX, sourceY);
      writeTextureLabPixel(pixels, (y * width + x) * 4, color, alpha, recipe);
    }
  }

  return { width, height, pixels, recipe };
}

export function textureLabFilename(recipe: TextureLabRecipe): string {
  const generator = TEXTURE_LAB_GENERATORS.find((item) => item.id === recipe.generator);
  const base = (generator?.label ?? recipe.generator)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const atlas = recipe.atlas?.enabled ? '-atlas' : '';
  const { width, height } = textureLabRecipeDimensions(recipe);
  const dimensions = width === height ? String(width) : `${width}x${height}`;
  return `${base}${atlas}-${dimensions}-${recipe.seed}.png`;
}

export function textureLabPixelsToDataUrl(result: TextureLabGeneratedPixels): string {
  const canvas = document.createElement('canvas');
  canvas.width = result.width;
  canvas.height = result.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available');
  const pixels = new Uint8ClampedArray(result.pixels.length);
  pixels.set(result.pixels);
  context.putImageData(new ImageData(pixels, result.width, result.height), 0, 0);
  return canvas.toDataURL('image/png');
}

function textureLabCustomFrameDataUrl(frame: TextureLabAtlasCustomFrame): string {
  return frame.dataBase64.startsWith('data:image') ? frame.dataBase64 : `data:image/png;base64,${frame.dataBase64}`;
}

function loadTextureLabImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Texture Lab could not load the custom atlas frame.'));
    image.src = src;
  });
}

function textureLabImageMaskDataUrl(recipe: TextureLabRecipe): string {
  const imageMask = recipe.imageMask;
  if (!imageMask?.dataBase64) return '';
  if (imageMask.dataBase64.startsWith('data:image')) return imageMask.dataBase64;
  return `data:${imageMask.mimeType};base64,${imageMask.dataBase64}`;
}

async function loadTextureLabImageMaskSource(recipe: TextureLabRecipe): Promise<TextureLabImageMaskSource> {
  const src = textureLabImageMaskDataUrl(recipe);
  if (!src) throw new Error('Upload an image before generating an image mask.');
  const { width, height } = textureLabRecipeDimensions(recipe);
  const image = await loadTextureLabImage(src);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available');
  context.imageSmoothingEnabled = !recipe.pixelated;
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  return { width, height, pixels: new Uint8ClampedArray(imageData.data) };
}

export async function renderTextureLabPixelsAsync(
  input?: Partial<TextureLabRecipe> | null,
): Promise<TextureLabGeneratedPixels> {
  const recipe = normalizeRecipe(input);
  if (isTextureLabImageMaskGenerator(recipe.generator) && recipe.imageMask?.dataBase64) {
    const source = await loadTextureLabImageMaskSource(recipe);
    return renderTextureLabImageMaskPixels(recipe, source);
  }
  return renderTextureLabPixels(recipe);
}

async function renderTextureLabCustomFramePixels(
  recipe: TextureLabRecipe,
  frame: TextureLabAtlasCustomFrame,
  index: number,
): Promise<TextureLabAtlasFramePixels> {
  const { width: frameWidth, height: frameHeight } = textureLabRecipeDimensions(recipe);
  if (frame.recipe) {
    const rendered = await renderTextureLabPixelsAsync({
      ...frame.recipe,
      size: recipe.size,
      width: frameWidth,
      height: frameHeight,
      atlas: undefined,
    });
    return {
      ...rendered,
      index,
      progress: 0,
    };
  }

  const image = await loadTextureLabImage(textureLabCustomFrameDataUrl(frame));
  const canvas = document.createElement('canvas');
  canvas.width = frameWidth;
  canvas.height = frameHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is not available');
  context.imageSmoothingEnabled = !recipe.pixelated;
  const scale = Math.min(
    frameWidth / Math.max(1, image.naturalWidth || frame.width),
    frameHeight / Math.max(1, image.naturalHeight || frame.height),
  );
  const width = Math.max(1, Math.round((image.naturalWidth || frame.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || frame.height) * scale));
  const x = Math.floor((frameWidth - width) / 2);
  const y = Math.floor((frameHeight - height) / 2);
  context.clearRect(0, 0, frameWidth, frameHeight);
  context.drawImage(image, x, y, width, height);
  const imageData = context.getImageData(0, 0, frameWidth, frameHeight);
  return {
    width: frameWidth,
    height: frameHeight,
    pixels: new Uint8ClampedArray(imageData.data),
    recipe: normalizeRecipe({ ...recipe, atlas: undefined }),
    index,
    progress: 0,
  };
}

export async function renderTextureLabAtlasPixelsAsync(
  input?: Partial<TextureLabRecipe> | null,
): Promise<TextureLabAtlasPixels> {
  const recipe = normalizeRecipe(input);
  const atlas = normalizeTextureLabAtlasSettings({ ...recipe.atlas, enabled: true });
  const { width: frameWidth, height: frameHeight } = textureLabRecipeDimensions(recipe);
  const metadata = atlasMetadata(atlas, frameWidth, frameHeight);
  const pixels = new Uint8ClampedArray(metadata.width * metadata.height * 4);
  const frames: TextureLabAtlasFramePixels[] = [];

  for (let index = 0; index < atlas.frameCount; index += 1) {
    const frameRecipe = textureLabAtlasFrameRecipe(recipe, atlas, index);
    const frame = await renderTextureLabPixelsAsync(frameRecipe);
    const frameX = (index % atlas.columns) * frameWidth;
    const frameY = Math.floor(index / atlas.columns) * frameHeight;
    for (let y = 0; y < frameHeight; y += 1) {
      const targetOffset = ((frameY + y) * metadata.width + frameX) * 4;
      const sourceOffset = y * frameWidth * 4;
      pixels.set(frame.pixels.subarray(sourceOffset, sourceOffset + frameWidth * 4), targetOffset);
    }
    frames.push({
      ...frame,
      index,
      progress: atlas.frameCount <= 1 ? 0 : index / (atlas.frameCount - 1),
    });
  }

  return {
    width: metadata.width,
    height: metadata.height,
    pixels,
    recipe: { ...recipe, atlas },
    atlas: metadata,
    frames,
  };
}

export function isTextureLabCustomAtlas(input?: Partial<TextureLabRecipe> | null): boolean {
  const recipe = normalizeRecipe(input);
  const atlas = recipe.atlas ? normalizeTextureLabAtlasSettings(recipe.atlas) : undefined;
  return atlas?.enabled === true && (atlas.preset === 'custom-frames' || (atlas.customFrames?.length ?? 0) > 0);
}

export async function renderTextureLabCustomAtlasPixels(
  input?: Partial<TextureLabRecipe> | null,
): Promise<TextureLabAtlasPixels> {
  const recipe = normalizeRecipe(input);
  const atlas = normalizeTextureLabAtlasSettings({ ...recipe.atlas, enabled: true, preset: 'custom-frames' });
  const { width: frameWidth, height: frameHeight } = textureLabRecipeDimensions(recipe);
  const metadata = atlasMetadata(atlas, frameWidth, frameHeight);
  const pixels = new Uint8ClampedArray(metadata.width * metadata.height * 4);
  const frames: TextureLabAtlasFramePixels[] = [];
  const customFrames = atlas.customFrames ?? [];

  for (let index = 0; index < atlas.frameCount; index += 1) {
    const customFrame = customFrames[index] ?? customFrames[0];
    const frame = customFrame
      ? await renderTextureLabCustomFramePixels(recipe, customFrame, index)
      : renderTextureLabPixels(textureLabAtlasFrameRecipe(recipe, atlas, index));
    const frameX = (index % atlas.columns) * frameWidth;
    const frameY = Math.floor(index / atlas.columns) * frameHeight;
    for (let y = 0; y < frameHeight; y += 1) {
      const targetOffset = ((frameY + y) * metadata.width + frameX) * 4;
      const sourceOffset = y * frameWidth * 4;
      pixels.set(frame.pixels.subarray(sourceOffset, sourceOffset + frameWidth * 4), targetOffset);
    }
    frames.push({
      ...frame,
      index,
      progress: atlas.frameCount <= 1 ? 0 : index / (atlas.frameCount - 1),
    });
  }

  return {
    width: metadata.width,
    height: metadata.height,
    pixels,
    recipe: { ...recipe, atlas },
    atlas: metadata,
    frames,
  };
}

export function generateTextureLabTexture(input?: Partial<TextureLabRecipe> | null): GeneratedTextureResult {
  const normalized = normalizeRecipe(input);
  if (normalized.atlas?.enabled) {
    const pixels = renderTextureLabAtlasPixels(normalized);
    const dataUrl = textureLabPixelsToDataUrl(pixels);
    return {
      filename: textureLabFilename(pixels.recipe),
      dataBase64: dataUrl.split(',', 2)[1] ?? '',
      dataUrl,
      width: pixels.width,
      height: pixels.height,
      recipe: pixels.recipe,
      atlas: pixels.atlas,
    };
  }

  const pixels = renderTextureLabPixels(normalized);
  const dataUrl = textureLabPixelsToDataUrl(pixels);
  return {
    filename: textureLabFilename(pixels.recipe),
    dataBase64: dataUrl.split(',', 2)[1] ?? '',
    dataUrl,
    width: pixels.width,
    height: pixels.height,
    recipe: pixels.recipe,
  };
}

export async function generateTextureLabTextureAsync(
  input?: Partial<TextureLabRecipe> | null,
): Promise<GeneratedTextureResult> {
  if (isTextureLabCustomAtlas(input)) {
    const pixels = await renderTextureLabCustomAtlasPixels(input);
    const dataUrl = textureLabPixelsToDataUrl(pixels);
    return {
      filename: textureLabFilename(pixels.recipe),
      dataBase64: dataUrl.split(',', 2)[1] ?? '',
      dataUrl,
      width: pixels.width,
      height: pixels.height,
      recipe: pixels.recipe,
      atlas: pixels.atlas,
    };
  }
  const normalized = normalizeRecipe(input);
  if (normalized.atlas?.enabled) {
    const pixels = await renderTextureLabAtlasPixelsAsync(normalized);
    const dataUrl = textureLabPixelsToDataUrl(pixels);
    return {
      filename: textureLabFilename(pixels.recipe),
      dataBase64: dataUrl.split(',', 2)[1] ?? '',
      dataUrl,
      width: pixels.width,
      height: pixels.height,
      recipe: pixels.recipe,
      atlas: pixels.atlas,
    };
  }
  const pixels = await renderTextureLabPixelsAsync(normalized);
  const dataUrl = textureLabPixelsToDataUrl(pixels);
  return {
    filename: textureLabFilename(pixels.recipe),
    dataBase64: dataUrl.split(',', 2)[1] ?? '',
    dataUrl,
    width: pixels.width,
    height: pixels.height,
    recipe: pixels.recipe,
  };
}

export function generateTextureLabAtlasBundle(input?: Partial<TextureLabRecipe> | null): TextureLabAtlasBundle {
  const pixels = renderTextureLabAtlasPixels(input);
  const sheetDataUrl = textureLabPixelsToDataUrl(pixels);
  const texture: GeneratedTextureResult = {
    filename: textureLabFilename(pixels.recipe),
    dataBase64: sheetDataUrl.split(',', 2)[1] ?? '',
    dataUrl: sheetDataUrl,
    width: pixels.width,
    height: pixels.height,
    recipe: pixels.recipe,
    atlas: pixels.atlas,
  };
  const frames = pixels.frames.map((frame) => {
    const dataUrl = textureLabPixelsToDataUrl(frame);
    return {
      filename: `frame-${String(frame.index).padStart(3, '0')}.png`,
      dataBase64: dataUrl.split(',', 2)[1] ?? '',
      dataUrl,
      width: frame.width,
      height: frame.height,
      recipe: frame.recipe,
    };
  });
  return { texture, frames, atlas: pixels.atlas };
}

export async function generateTextureLabAtlasBundleAsync(
  input?: Partial<TextureLabRecipe> | null,
): Promise<TextureLabAtlasBundle> {
  const pixels = isTextureLabCustomAtlas(input)
    ? await renderTextureLabCustomAtlasPixels(input)
    : await renderTextureLabAtlasPixelsAsync(input);
  const sheetDataUrl = textureLabPixelsToDataUrl(pixels);
  const texture: GeneratedTextureResult = {
    filename: textureLabFilename(pixels.recipe),
    dataBase64: sheetDataUrl.split(',', 2)[1] ?? '',
    dataUrl: sheetDataUrl,
    width: pixels.width,
    height: pixels.height,
    recipe: pixels.recipe,
    atlas: pixels.atlas,
  };
  const frames = pixels.frames.map((frame) => {
    const dataUrl = textureLabPixelsToDataUrl(frame);
    return {
      filename: `frame-${String(frame.index).padStart(3, '0')}.png`,
      dataBase64: dataUrl.split(',', 2)[1] ?? '',
      dataUrl,
      width: frame.width,
      height: frame.height,
      recipe: frame.recipe,
    };
  });
  return { texture, frames, atlas: pixels.atlas };
}
