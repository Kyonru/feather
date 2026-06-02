export const TEXTURE_LAB_SIZES = [4, 8, 16, 32, 64, 128, 256] as const;

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
  'image-alpha-mask',
  'image-luminance-mask',
  'image-threshold-mask',
  'image-color-key-mask',
  'image-edge-mask',
  'cloud-noise',
  'cellular-spots',
  'dissolve-noise',
  'water-noise',
  'height-map',
  'directional-gradient',
  'normal-from-height',
  'flow-map',
  'radial-swirl-flow',
  'water-ripple-normal',
  'directional-distortion-map',
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
export const TEXTURE_LAB_ATLAS_MODES = ['variations', 'flipbook'] as const;
export const TEXTURE_LAB_ATLAS_PRESETS = [
  'seeded-spark',
  'smoke-variants',
  'rain-variants',
  'dissolve-loop',
  'impact-ring',
  'custom-frames',
] as const;
export const TEXTURE_LAB_ATLAS_PLAYBACK_MODES = ['lifetime', 'variants'] as const;

export type TextureLabSize = number;
export type TextureLabGeneratorId = (typeof TEXTURE_LAB_GENERATOR_IDS)[number];
export type TextureLabColorRamp = (typeof TEXTURE_LAB_COLOR_RAMPS)[number];
export type TextureLabAlphaMode = (typeof TEXTURE_LAB_ALPHA_MODES)[number];
export type TextureLabSplineOverlapMode = (typeof TEXTURE_LAB_SPLINE_OVERLAP_MODES)[number];
export type TextureLabShapeElementKind = (typeof TEXTURE_LAB_SHAPE_ELEMENT_KINDS)[number];
export type TextureLabShapeRepeatMode = (typeof TEXTURE_LAB_SHAPE_REPEAT_MODES)[number];
export type TextureLabShapeBlendMode = (typeof TEXTURE_LAB_SHAPE_BLEND_MODES)[number];
export type TextureLabAtlasMode = (typeof TEXTURE_LAB_ATLAS_MODES)[number];
export type TextureLabAtlasPreset = (typeof TEXTURE_LAB_ATLAS_PRESETS)[number];
export type TextureLabAtlasPlaybackMode = (typeof TEXTURE_LAB_ATLAS_PLAYBACK_MODES)[number];

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

export type TextureLabImageMaskRecipe = {
  dataBase64: string;
  mimeType: string;
  name: string;
  width: number;
  height: number;
  colorKey: string;
};

export type TextureLabAtlasSettings = {
  enabled: boolean;
  mode: TextureLabAtlasMode;
  preset: TextureLabAtlasPreset;
  columns: number;
  rows: number;
  frameCount: number;
  fps: number;
  seedStep: number;
  playback: TextureLabAtlasPlaybackMode;
  onionSkin: boolean;
  customFrames?: TextureLabAtlasCustomFrame[];
};

export type TextureLabAtlasFrameMetadata = {
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  duration: number;
};

export type TextureLabAtlasCustomFrame = {
  id: string;
  name: string;
  dataBase64: string;
  width: number;
  height: number;
  recipe?: Omit<TextureLabRecipe, 'atlas'>;
};

export type TextureLabAtlasMetadata = {
  mode: TextureLabAtlasMode;
  preset: TextureLabAtlasPreset;
  playback: TextureLabAtlasPlaybackMode;
  columns: number;
  rows: number;
  frameCount: number;
  fps: number;
  frameWidth: number;
  frameHeight: number;
  width: number;
  height: number;
  frames: TextureLabAtlasFrameMetadata[];
};

export type TextureLabRecipe = {
  generator: TextureLabGeneratorId;
  size: TextureLabSize;
  width: number;
  height: number;
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
  imageMask?: TextureLabImageMaskRecipe;
  spline?: TextureLabSplineRecipe;
  shape?: TextureLabShapeRecipe;
  atlas?: TextureLabAtlasSettings;
};

export type TextureLabSavedRecipe = {
  id: string;
  name: string;
  recipe: TextureLabRecipe;
  createdAt: number;
  updatedAt: number;
};

export type TextureLabGeneratedPixels = {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  recipe: TextureLabRecipe;
};

export type TextureLabAtlasFramePixels = TextureLabGeneratedPixels & {
  index: number;
  progress: number;
};

export type TextureLabAtlasPixels = TextureLabGeneratedPixels & {
  atlas: TextureLabAtlasMetadata;
  frames: TextureLabAtlasFramePixels[];
};

export type GeneratedTextureResult = {
  filename: string;
  dataBase64: string;
  dataUrl: string;
  width: number;
  height: number;
  recipe: TextureLabRecipe;
  atlas?: TextureLabAtlasMetadata;
};

export type TextureLabAtlasBundle = {
  texture: GeneratedTextureResult;
  frames: GeneratedTextureResult[];
  atlas: TextureLabAtlasMetadata;
};
