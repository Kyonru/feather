export type MovementPattern = 'none' | 'circle' | 'figure-eight' | 'irregular';
export type CompositeType = 'scratch' | 'game';
export type ParticleSystemPlaygroundTemplate = 'fire' | 'explosion' | 'smoke' | 'sparkles';

export type ParticleSystemPlaygroundMovement = {
  pattern: MovementPattern;
  radius?: number;
  radiusX?: number;
  radiusY?: number;
  speed?: number;
  scale?: number;
};

export type ParticleSystemPlaygroundSystemProperties = {
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

export type ParticleSystemPlaygroundSystem = {
  index: number;
  title: string;
  blendMode: string;
  enabled: boolean;
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
  properties: ParticleSystemPlaygroundSystemProperties;
};

export type ParticleSystemPlaygroundCompositeData = {
  compositeType: CompositeType;
  x: number;
  y: number;
  previewEnabled: boolean;
  movement: ParticleSystemPlaygroundMovement;
  systems: ParticleSystemPlaygroundSystem[];
};

export type ParticleSystemPlaygroundData = {
  type: 'particle-system-playground';
  loading?: boolean;
  composites: string[];
  activeComposite: string | null;
  activeSystem: number;
  data: ParticleSystemPlaygroundCompositeData | null;
};

export const BLEND_MODES = ['alpha', 'add', 'subtract', 'multiply', 'screen', 'replace', 'lighten', 'darken'] as const;
export const TEXTURE_PRESETS = ['circle', 'ring', 'light', 'star', 'spiral'] as const;
export const PARTICLE_SYSTEM_PLAYGROUND_TEMPLATES: Array<{ value: ParticleSystemPlaygroundTemplate; label: string }> = [
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
