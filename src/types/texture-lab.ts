export const TEXTURE_LAB_SIZES = [32, 64, 128, 256] as const;

export const TEXTURE_LAB_GENERATOR_IDS = [
  'soft-circle',
  'spark',
  'streak',
  'ring',
  'smoke-puff',
  'star',
  'slash',
  'trail-blob',
  'comet-tail',
  'rain-slash',
  'circle-mask',
  'ellipse-mask',
  'rounded-rect-mask',
  'radial-mask',
  'threshold-noise-mask',
  'cloud-noise',
  'cellular-spots',
  'dissolve-noise',
  'water-noise',
  'height-map',
  'directional-gradient',
  'checker',
  'dither',
  'scanline',
  'palette-ramp',
  'spline-trail',
  'spline-ribbon',
  'spline-mask',
  'spline-lightning',
] as const;

export const TEXTURE_LAB_COLOR_RAMPS = [
  'white',
  'fire',
  'smoke',
  'ice',
  'magic',
  'water',
  'gold',
  'rainbow',
  'grayscale',
] as const;

export const TEXTURE_LAB_ALPHA_MODES = ['shape', 'opaque', 'luminance', 'inverted'] as const;
export const TEXTURE_LAB_SPLINE_OVERLAP_MODES = ['merge', 'bridge', 'additive'] as const;

export type TextureLabSize = (typeof TEXTURE_LAB_SIZES)[number];
export type TextureLabGeneratorId = (typeof TEXTURE_LAB_GENERATOR_IDS)[number];
export type TextureLabColorRamp = (typeof TEXTURE_LAB_COLOR_RAMPS)[number];
export type TextureLabAlphaMode = (typeof TEXTURE_LAB_ALPHA_MODES)[number];
export type TextureLabSplineOverlapMode = (typeof TEXTURE_LAB_SPLINE_OVERLAP_MODES)[number];

export type TextureLabSplinePoint = {
  x: number;
  y: number;
};

export type TextureLabSplineRecipe = {
  points: TextureLabSplinePoint[];
  closed: boolean;
  tension: number;
  strokeWidth: number;
  feather: number;
  taperStart: number;
  taperEnd: number;
  jitter: number;
  samples: number;
  overlapMode: TextureLabSplineOverlapMode;
};

export type TextureLabRecipe = {
  generator: TextureLabGeneratorId;
  size: TextureLabSize;
  seed: number;
  softness: number;
  falloff: number;
  contrast: number;
  threshold: number;
  scale: number;
  distortion: number;
  tileable: boolean;
  pixelated: boolean;
  alphaMode: TextureLabAlphaMode;
  colorRamp: TextureLabColorRamp;
  spline?: TextureLabSplineRecipe;
};

export type TextureLabGeneratedPixels = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  recipe: TextureLabRecipe;
};

export type GeneratedTextureResult = {
  filename: string;
  dataBase64: string;
  dataUrl: string;
  width: number;
  height: number;
  recipe: TextureLabRecipe;
};
