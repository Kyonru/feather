export type MovementPattern = 'none' | 'circle' | 'figure-eight' | 'irregular';
export type CompositeType = 'scratch' | 'game';
export type HotParticlesTemplate = 'fire' | 'explosion' | 'smoke' | 'sparkles';

export type HotParticlesMovement = {
  pattern: MovementPattern;
  radius?: number;
  radiusX?: number;
  radiusY?: number;
  speed?: number;
  scale?: number;
};

export type HotParticlesSystemProperties = {
  emissionRate?: number;
  emitterLifetime?: number;
  particleLifetimeMin?: number;
  particleLifetimeMax?: number;
  direction?: number;
  spread?: number;
  speedMin?: number;
  speedMax?: number;
  linearAccelXMin?: number;
  linearAccelYMin?: number;
  linearAccelXMax?: number;
  linearAccelYMax?: number;
  radialAccelMin?: number;
  radialAccelMax?: number;
  tangentialAccelMin?: number;
  tangentialAccelMax?: number;
  linearDampingMin?: number;
  linearDampingMax?: number;
  sizes?: string;
  sizeVariation?: number;
  rotationMin?: number;
  rotationMax?: number;
  relativeRotation?: boolean;
  spinMin?: number;
  spinMax?: number;
  spinVariation?: number;
  offsetX?: number;
  offsetY?: number;
  insertMode?: string;
  colors?: string;
  emissionAreaDist?: string;
  emissionAreaDx?: number;
  emissionAreaDy?: number;
  emissionAreaAngle?: number;
  emissionAreaRelative?: boolean;
  count?: number;
  bufferSize?: number;
};

export type HotParticlesSystem = {
  index: number;
  title: string;
  blendMode: string;
  x: number;
  y: number;
  kickStartSteps: number;
  kickStartDt: number;
  emitAtStart: number;
  texturePath: string;
  texturePreset: string;
  textureFilename: string;
  shaderPath: string;
  shaderFilename: string;
  shaderSource: string;
  exportReady: boolean;
  properties: HotParticlesSystemProperties;
};

export type HotParticlesCompositeData = {
  compositeType: CompositeType;
  x: number;
  y: number;
  movement: HotParticlesMovement;
  systems: HotParticlesSystem[];
};

export type HotParticlesData = {
  type: 'hot-particles';
  loading?: boolean;
  composites: string[];
  activeComposite: string | null;
  activeSystem: number;
  data: HotParticlesCompositeData | null;
};

export const BLEND_MODES = ['alpha', 'add', 'subtract', 'multiply', 'screen', 'replace', 'lighten', 'darken'] as const;
export const TEXTURE_PRESETS = ['circle', 'ring', 'light', 'star', 'spiral'] as const;
export const HOT_PARTICLES_TEMPLATES: Array<{ value: HotParticlesTemplate; label: string }> = [
  { value: 'fire', label: 'Fire' },
  { value: 'explosion', label: 'Explosion' },
  { value: 'smoke', label: 'Smoke' },
  { value: 'sparkles', label: 'Sparkles' },
];
export const EMISSION_AREA_DISTRIBUTIONS = [
  'none',
  'uniform',
  'normal',
  'ellipse',
  'borderellipse',
  'borderrectangle',
] as const;
