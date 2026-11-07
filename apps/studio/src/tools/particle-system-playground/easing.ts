import {
  PARTICLE_TIMELINE_EASINGS,
  type ParticleTimelineEasing,
} from '../../types/particle-system-playground';

export const PARTICLE_TIMELINE_EASING_LABELS: Record<ParticleTimelineEasing, string> = {
  linear: 'Linear',
  hold: 'Hold',
  inSine: 'In Sine',
  outSine: 'Out Sine',
  inOutSine: 'In-Out Sine',
  inQuad: 'In Quad',
  outQuad: 'Out Quad',
  inOutQuad: 'In-Out Quad',
  inCubic: 'In Cubic',
  outCubic: 'Out Cubic',
  inOutCubic: 'In-Out Cubic',
  inQuart: 'In Quart',
  outQuart: 'Out Quart',
  inOutQuart: 'In-Out Quart',
  inExpo: 'In Expo',
  outExpo: 'Out Expo',
  inOutExpo: 'In-Out Expo',
  inBack: 'In Back',
  outBack: 'Out Back',
  inOutBack: 'In-Out Back',
  inElastic: 'In Elastic',
  outElastic: 'Out Elastic',
  inOutElastic: 'In-Out Elastic',
  inBounce: 'In Bounce',
  outBounce: 'Out Bounce',
  inOutBounce: 'In-Out Bounce',
};

const VALID_EASINGS = new Set<string>(PARTICLE_TIMELINE_EASINGS);

export function normalizeParticleTimelineEasing(value: unknown): ParticleTimelineEasing {
  return typeof value === 'string' && VALID_EASINGS.has(value) ? (value as ParticleTimelineEasing) : 'linear';
}

function easeOutBounce(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) {
    const shifted = x - 1.5 / d1;
    return n1 * shifted * shifted + 0.75;
  }
  if (x < 2.5 / d1) {
    const shifted = x - 2.25 / d1;
    return n1 * shifted * shifted + 0.9375;
  }
  const shifted = x - 2.625 / d1;
  return n1 * shifted * shifted + 0.984375;
}

export function easeParticleTimelineValue(easing: unknown, x: number): number {
  const t = Math.min(1, Math.max(0, x));
  const easingId = normalizeParticleTimelineEasing(easing);
  const c1 = 1.70158;
  const c2 = c1 * 1.525;
  const c3 = c1 + 1;
  const c4 = (2 * Math.PI) / 3;
  const c5 = (2 * Math.PI) / 4.5;

  switch (easingId) {
    case 'hold':
      return 0;
    case 'inSine':
      return 1 - Math.cos((t * Math.PI) / 2);
    case 'outSine':
      return Math.sin((t * Math.PI) / 2);
    case 'inOutSine':
      return -(Math.cos(Math.PI * t) - 1) / 2;
    case 'inQuad':
      return t * t;
    case 'outQuad':
      return 1 - (1 - t) * (1 - t);
    case 'inOutQuad':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'inCubic':
      return t * t * t;
    case 'outCubic':
      return 1 - Math.pow(1 - t, 3);
    case 'inOutCubic':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    case 'inQuart':
      return t * t * t * t;
    case 'outQuart':
      return 1 - Math.pow(1 - t, 4);
    case 'inOutQuart':
      return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
    case 'inExpo':
      return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
    case 'outExpo':
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    case 'inOutExpo':
      if (t === 0 || t === 1) return t;
      return t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
    case 'inBack':
      return c3 * t * t * t - c1 * t * t;
    case 'outBack':
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    case 'inOutBack':
      return t < 0.5
        ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
        : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
    case 'inElastic':
      if (t === 0 || t === 1) return t;
      return -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c4);
    case 'outElastic':
      if (t === 0 || t === 1) return t;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    case 'inOutElastic':
      if (t === 0 || t === 1) return t;
      return t < 0.5
        ? -(Math.pow(2, 20 * t - 10) * Math.sin((20 * t - 11.125) * c5)) / 2
        : (Math.pow(2, -20 * t + 10) * Math.sin((20 * t - 11.125) * c5)) / 2 + 1;
    case 'inBounce':
      return 1 - easeOutBounce(1 - t);
    case 'outBounce':
      return easeOutBounce(t);
    case 'inOutBounce':
      return t < 0.5 ? (1 - easeOutBounce(1 - 2 * t)) / 2 : (1 + easeOutBounce(2 * t - 1)) / 2;
    case 'linear':
    default:
      return t;
  }
}
