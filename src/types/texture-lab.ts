export const TEXTURE_LAB_SIZES = [32, 64, 128, 256] as const;

export const TEXTURE_LAB_GENERATOR_IDS = [
  'soft-circle',
  'spark',
  'streak',
  'ring',
  'smoke-puff',
  'star',
  'trail-blob',
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
  'shape-composer',
  'spline-trail',
  'spline-ribbon',
  'spline-mask',
  'spline-lightning',
] as const;

export const TEXTURE_LAB_COLOR_RAMPS = [
  'solid',
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
export const TEXTURE_LAB_SHAPE_ELEMENT_KINDS = ['polygon', 'star', 'ellipse', 'rect', 'ring', 'spline', 'dot'] as const;
export const TEXTURE_LAB_SHAPE_REPEAT_MODES = ['none', 'grid', 'radial', 'scatter'] as const;
export const TEXTURE_LAB_SHAPE_BLEND_MODES = ['normal', 'add', 'multiply', 'screen'] as const;

export type TextureLabSize = (typeof TEXTURE_LAB_SIZES)[number];
export type TextureLabGeneratorId = (typeof TEXTURE_LAB_GENERATOR_IDS)[number];
export type TextureLabColorRamp = (typeof TEXTURE_LAB_COLOR_RAMPS)[number];
export type TextureLabAlphaMode = (typeof TEXTURE_LAB_ALPHA_MODES)[number];
export type TextureLabSplineOverlapMode = (typeof TEXTURE_LAB_SPLINE_OVERLAP_MODES)[number];
export type TextureLabShapeElementKind = (typeof TEXTURE_LAB_SHAPE_ELEMENT_KINDS)[number];
export type TextureLabShapeRepeatMode = (typeof TEXTURE_LAB_SHAPE_REPEAT_MODES)[number];
export type TextureLabShapeBlendMode = (typeof TEXTURE_LAB_SHAPE_BLEND_MODES)[number];

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

export type TextureLabShapeRepeat = {
  mode: TextureLabShapeRepeatMode;
  count: number;
  spacing: number;
  radius: number;
  seedOffset: number;
  rotationVariance: number;
  scaleVariance: number;
  jitter: number;
};

export type TextureLabShapeElement = {
  id: string;
  kind: TextureLabShapeElementKind;
  label: string;
  enabled: boolean;
  x: number;
  y: number;
  size: number;
  rotation: number;
  opacity: number;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  feather: number;
  blendMode: TextureLabShapeBlendMode;
  sides: number;
  innerRadius: number;
  cornerRoundness: number;
  points?: TextureLabSplinePoint[];
  spline?: TextureLabSplineRecipe;
  repeat: TextureLabShapeRepeat;
};

export type TextureLabShapeRecipe = {
  selectedLayerId?: string;
  layers: TextureLabShapeElement[];
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
  solidColor: string;
  backgroundColor: string;
  backgroundAlpha: number;
  spline?: TextureLabSplineRecipe;
  shape?: TextureLabShapeRecipe;
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
