import type { TextureLabAtlasMetadata } from './texture-lab';

export type MovementPattern = 'none' | 'circle' | 'figure-eight' | 'irregular';
export type CompositeType = 'scratch' | 'game';
export type ParticleSystemPlaygroundTemplate =
  | 'fire'
  | 'explosion'
  | 'smoke'
  | 'sparkles'
  | 'muzzle-flash'
  | 'magic-burst'
  | 'dust-puff'
  | 'complex-composite'
  | 'snowfall'
  | 'rainfall'
  | 'falling-leaves';
export type ParticleSystemPlaygroundProjectVersion = 1 | 2 | 3 | 4;

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
  textureAtlas?: TextureLabAtlasMetadata;
  shaderPath: string;
  shaderFilename: string;
  shaderSource: string;
  exportReady: boolean;
  properties: ParticleSystemPlaygroundSystemProperties;
};

export const PARTICLE_TIMELINE_LANES = [
  'opacity',
  'emissionRate',
  'speedScale',
  'sizeScale',
  'direction',
  'spread',
  'offsetX',
  'offsetY',
] as const;

export type ParticleTimelineLane = (typeof PARTICLE_TIMELINE_LANES)[number];

export const PARTICLE_TIMELINE_EASINGS = [
  'linear',
  'hold',
  'inSine',
  'outSine',
  'inOutSine',
  'inQuad',
  'outQuad',
  'inOutQuad',
  'inCubic',
  'outCubic',
  'inOutCubic',
  'inQuart',
  'outQuart',
  'inOutQuart',
  'inExpo',
  'outExpo',
  'inOutExpo',
  'inBack',
  'outBack',
  'inOutBack',
  'inElastic',
  'outElastic',
  'inOutElastic',
  'inBounce',
  'outBounce',
  'inOutBounce',
] as const;

export type ParticleTimelineEasing = (typeof PARTICLE_TIMELINE_EASINGS)[number];

export type ParticleTimelineKeyframe = {
  id: string;
  time: number;
  value: number;
  easing?: ParticleTimelineEasing;
};

export type ParticleTimelineClip = {
  id: string;
  start: number;
  end: number;
  emit?: number;
};

export type ParticleTimelineTrack = {
  systemIndex: number;
  clips: ParticleTimelineClip[];
  lanes: Partial<Record<ParticleTimelineLane, ParticleTimelineKeyframe[]>>;
};

export const PARTICLE_TIMELINE_MODES = ['one-shot', 'loop', 'ambient'] as const;

export type ParticleTimelineMode = (typeof PARTICLE_TIMELINE_MODES)[number];

export type ParticleTimeline = {
  duration: number;
  mode: ParticleTimelineMode;
  loop: boolean;
  tracks: ParticleTimelineTrack[];
};

export type ParticleTimelineState = {
  time: number;
  playing: boolean;
  scrubVersion?: number;
};

export type ParticleSystemPlaygroundCompositeData = {
  compositeType: CompositeType;
  x: number;
  y: number;
  previewEnabled: boolean;
  movement: ParticleSystemPlaygroundMovement;
  systems: ParticleSystemPlaygroundSystem[];
  timeline?: ParticleTimeline;
  timelineState?: ParticleTimelineState;
};

export type ParticleSystemPlaygroundData = {
  type: 'particle-system-playground';
  loading?: boolean;
  composites: string[];
  activeComposite: string | null;
  activeSystem: number;
  data: ParticleSystemPlaygroundCompositeData | null;
};

export type ParticleSystemPlaygroundProjectSystem = ParticleSystemPlaygroundSystem & {
  textureAssetBase64?: string;
};

export type ParticleSystemPlaygroundProjectFile = {
  type: 'feather.particle-system-playground';
  version: ParticleSystemPlaygroundProjectVersion;
  exportedAt: string;
  name: string;
  composite: Omit<ParticleSystemPlaygroundCompositeData, 'compositeType' | 'systems' | 'timelineState'> & {
    systems: ParticleSystemPlaygroundProjectSystem[];
  };
};

export const BLEND_MODES = ['alpha', 'add', 'subtract', 'multiply', 'screen', 'replace', 'lighten', 'darken'] as const;
export const TEXTURE_PRESETS = ['circle', 'ring', 'light', 'star', 'spiral'] as const;
export const PARTICLE_SYSTEM_PLAYGROUND_TEMPLATES: Array<{ value: ParticleSystemPlaygroundTemplate; label: string }> = [
  { value: 'fire', label: 'Fire' },
  { value: 'explosion', label: 'Explosion' },
  { value: 'smoke', label: 'Smoke' },
  { value: 'sparkles', label: 'Sparkles' },
  { value: 'muzzle-flash', label: 'Muzzle Flash' },
  { value: 'magic-burst', label: 'Magic Burst' },
  { value: 'dust-puff', label: 'Dust Puff' },
  { value: 'complex-composite', label: 'Complex Composite' },
  { value: 'snowfall', label: 'Snowfall' },
  { value: 'rainfall', label: 'Rainfall' },
  { value: 'falling-leaves', label: 'Falling Leaves' },
];
export const EMISSION_AREA_DISTRIBUTIONS = [
  'none',
  'uniform',
  'normal',
  'ellipse',
  'borderellipse',
  'borderrectangle',
] as const;
