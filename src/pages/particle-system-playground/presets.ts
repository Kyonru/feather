import type { ParticleSystemPlaygroundSystem, ParticleSystemPlaygroundSystemProperties } from '@/types/particle-system-playground';

const D = Math.PI / 180;

export type PresetValues = Required<
  Pick<
    ParticleSystemPlaygroundSystemProperties,
    | 'direction'
    | 'spread'
    | 'speedMin'
    | 'speedMax'
    | 'linearAccelXMin'
    | 'linearAccelYMin'
    | 'linearAccelXMax'
    | 'linearAccelYMax'
    | 'radialAccelMin'
    | 'radialAccelMax'
    | 'tangentialAccelMin'
    | 'tangentialAccelMax'
    | 'linearDampingMin'
    | 'linearDampingMax'
  >
>;

export type MotionPreset = {
  name: string;
  values: Partial<PresetValues>;
  description?: string;
};

type FullPreset = MotionPreset & { values: PresetValues };

type OnChange = (key: string, value: string | number | boolean) => void;

export const MOTION_KEYS = [
  'direction',
  'spread',
  'speedMin',
  'speedMax',
  'linearAccelXMin',
  'linearAccelYMin',
  'linearAccelXMax',
  'linearAccelYMax',
  'radialAccelMin',
  'radialAccelMax',
  'tangentialAccelMin',
  'tangentialAccelMax',
  'linearDampingMin',
  'linearDampingMax',
] as const satisfies (keyof PresetValues)[];

const ZERO_VALUES: PresetValues = {
  direction: 0,
  spread: 0,
  speedMin: 0,
  speedMax: 0,
  linearAccelXMin: 0,
  linearAccelYMin: 0,
  linearAccelXMax: 0,
  linearAccelYMax: 0,
  radialAccelMin: 0,
  radialAccelMax: 0,
  tangentialAccelMin: 0,
  tangentialAccelMax: 0,
  linearDampingMin: 0,
  linearDampingMax: 0,
};

function round(value: number, places = 3) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function damping(drag: number, randomness = 0): Pick<PresetValues, 'linearDampingMin' | 'linearDampingMax'> {
  return {
    linearDampingMin: round(Math.max(0, drag * (1 - randomness))),
    linearDampingMax: round(Math.max(0, drag * (1 + randomness))),
  };
}

function accelVector(directionDeg: number, min: number, max = min) {
  const angle = directionDeg * D;
  return {
    linearAccelXMin: round(Math.cos(angle) * min),
    linearAccelYMin: round(Math.sin(angle) * min),
    linearAccelXMax: round(Math.cos(angle) * max),
    linearAccelYMax: round(Math.sin(angle) * max),
  };
}

function preset(name: string, values: Partial<PresetValues>, description?: string): FullPreset {
  return {
    name,
    description,
    values: normalizeValues(values),
  };
}

export function normalizeValues(values: Partial<PresetValues> = {}): PresetValues {
  const normalized = { ...ZERO_VALUES };
  for (const key of MOTION_KEYS) {
    const value = values[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      normalized[key] = value;
    }
  }
  return normalized;
}

const SPEED_KEYS = new Set<keyof PresetValues>(['speedMin', 'speedMax']);
const FORCE_KEYS = new Set<keyof PresetValues>([
  'linearAccelXMin',
  'linearAccelYMin',
  'linearAccelXMax',
  'linearAccelYMax',
  'radialAccelMin',
  'radialAccelMax',
  'tangentialAccelMin',
  'tangentialAccelMax',
]);

function intensifyPreset(item: FullPreset): FullPreset {
  const values = { ...item.values };
  for (const key of SPEED_KEYS) {
    values[key] = round(values[key] * 1.3);
  }
  for (const key of FORCE_KEYS) {
    values[key] = round(values[key] * 1.45);
  }
  return { ...item, values };
}

export const NAMED_PRESETS: FullPreset[] = [
  preset('Explosion', {
    direction: 270 * D,
    spread: 360 * D,
    speedMin: 200,
    speedMax: 700,
    radialAccelMin: 100,
    radialAccelMax: 300,
    tangentialAccelMin: 0,
    tangentialAccelMax: 30,
    ...damping(0.2, 0.1),
  }, 'Fireworks, blasts, fragments, debris'),
  preset('Whirlpool', {
    direction: 0,
    spread: 360 * D,
    speedMin: 80,
    speedMax: 180,
    radialAccelMin: -220,
    radialAccelMax: -90,
    tangentialAccelMin: 320,
    tangentialAccelMax: 520,
    ...damping(0.03),
  }, 'Black holes, portals, water vortices'),
  preset('Tornado', {
    direction: 270 * D,
    spread: 30 * D,
    speedMin: 150,
    speedMax: 300,
    radialAccelMin: -30,
    radialAccelMax: -10,
    tangentialAccelMin: 100,
    tangentialAccelMax: 250,
    ...accelVector(270, 20, 80),
    ...damping(0.08, 0.2),
  }, 'Columns, funnels, upward spirals'),
  preset('Wind Drift', {
    direction: 0,
    spread: 15 * D,
    speedMin: 50,
    speedMax: 120,
    ...accelVector(0, 15, 45),
    ...damping(0.12, 0.2),
  }, 'Leaves, ash, side-scrolling weather'),
  preset('Smoke Rise', {
    direction: 270 * D,
    spread: 70 * D,
    speedMin: 20,
    speedMax: 80,
    ...accelVector(270, 20, 65),
    ...damping(0.6, 0.2),
  }, 'Smoke, steam, drifting dust'),
  preset('Gravity Fall', {
    direction: 90 * D,
    spread: 5 * D,
    speedMin: 300,
    speedMax: 500,
    ...accelVector(90, 180, 420),
    ...damping(0.03),
  }, 'Rain, falling chunks, heavy drops'),
  preset('Orbit', {
    direction: 0,
    spread: 360 * D,
    speedMin: 120,
    speedMax: 180,
    radialAccelMin: -120,
    radialAccelMax: -70,
    tangentialAccelMin: 180,
    tangentialAccelMax: 280,
    ...damping(0.01),
  }, 'Magic rings, satellites, orbital wisps'),
  preset('Shockwave', {
    direction: 270 * D,
    spread: 360 * D,
    speedMin: 500,
    speedMax: 500,
    radialAccelMin: 400,
    radialAccelMax: 400,
    ...damping(0.15),
  }, 'Rings, pulses, impact fronts'),
  preset('Fountain', {
    direction: 270 * D,
    spread: 50 * D,
    speedMin: 300,
    speedMax: 500,
    radialAccelMin: 0,
    radialAccelMax: 40,
    ...accelVector(90, 180, 320),
    ...damping(0.02),
  }, 'Sparks, water jets, fountains'),
  preset('Fire Sparks', {
    direction: 270 * D,
    spread: 120 * D,
    speedMin: 150,
    speedMax: 600,
    ...accelVector(270, 30, 95),
    tangentialAccelMin: -20,
    tangentialAccelMax: 20,
    ...damping(0.1, 0.05),
  }, 'Campfires, welders, embers'),
  preset('Ember Float', {
    direction: 270 * D,
    spread: 35 * D,
    speedMin: 15,
    speedMax: 65,
    ...accelVector(270, 15, 50),
    tangentialAccelMin: -35,
    tangentialAccelMax: 35,
    ...damping(0.28, 0.25),
  }),
  preset('Rain', {
    direction: 90 * D,
    spread: 3 * D,
    speedMin: 450,
    speedMax: 850,
    ...accelVector(90, 120, 240),
    ...damping(0.01),
  }),
  preset('Snow Drift', {
    direction: 95 * D,
    spread: 28 * D,
    speedMin: 20,
    speedMax: 70,
    ...accelVector(100, 8, 25),
    tangentialAccelMin: -20,
    tangentialAccelMax: 20,
    ...damping(0.35, 0.15),
  }),
  preset('Magic Swirl', {
    direction: 270 * D,
    spread: 360 * D,
    speedMin: 40,
    speedMax: 160,
    radialAccelMin: -90,
    radialAccelMax: -25,
    tangentialAccelMin: -260,
    tangentialAccelMax: -120,
    ...damping(0.04),
  }),
  preset('Portal Inhale', {
    spread: 360 * D,
    speedMin: 10,
    speedMax: 90,
    radialAccelMin: -350,
    radialAccelMax: -160,
    tangentialAccelMin: 120,
    tangentialAccelMax: 260,
    ...damping(0.06),
  }),
  preset('Portal Burst', {
    spread: 360 * D,
    speedMin: 120,
    speedMax: 380,
    radialAccelMin: 160,
    radialAccelMax: 420,
    tangentialAccelMin: -160,
    tangentialAccelMax: 160,
    ...damping(0.12),
  }),
  preset('Spiral Up', {
    direction: 270 * D,
    spread: 45 * D,
    speedMin: 80,
    speedMax: 180,
    ...accelVector(270, 30, 95),
    radialAccelMin: -60,
    radialAccelMax: -15,
    tangentialAccelMin: 160,
    tangentialAccelMax: 260,
    ...damping(0.08),
  }),
  preset('Spiral Down', {
    direction: 90 * D,
    spread: 45 * D,
    speedMin: 80,
    speedMax: 180,
    ...accelVector(90, 30, 95),
    radialAccelMin: -60,
    radialAccelMax: -15,
    tangentialAccelMin: -260,
    tangentialAccelMax: -160,
    ...damping(0.08),
  }),
  preset('Jet Thruster', {
    direction: 90 * D,
    spread: 18 * D,
    speedMin: 350,
    speedMax: 950,
    ...accelVector(90, 60, 180),
    radialAccelMin: 15,
    radialAccelMax: 75,
    ...damping(0.04),
  }),
  preset('Muzzle Flash', {
    direction: 0,
    spread: 24 * D,
    speedMin: 700,
    speedMax: 1200,
    ...accelVector(0, -40, 60),
    radialAccelMin: 80,
    radialAccelMax: 220,
    ...damping(0.28, 0.1),
  }),
  preset('Blood Spray', {
    direction: 0,
    spread: 70 * D,
    speedMin: 160,
    speedMax: 520,
    ...accelVector(90, 120, 320),
    radialAccelMin: 20,
    radialAccelMax: 80,
    ...damping(0.12, 0.15),
  }),
  preset('Debris Arc', {
    direction: 300 * D,
    spread: 95 * D,
    speedMin: 160,
    speedMax: 500,
    ...accelVector(90, 260, 500),
    radialAccelMin: 40,
    radialAccelMax: 160,
    tangentialAccelMin: -30,
    tangentialAccelMax: 30,
    ...damping(0.08),
  }),
  preset('Dust Puff', {
    direction: 270 * D,
    spread: 360 * D,
    speedMin: 30,
    speedMax: 180,
    ...accelVector(270, 5, 35),
    radialAccelMin: 50,
    radialAccelMax: 140,
    ...damping(0.7, 0.18),
  }),
  preset('Steam Vent', {
    direction: 270 * D,
    spread: 18 * D,
    speedMin: 180,
    speedMax: 420,
    ...accelVector(270, 20, 70),
    tangentialAccelMin: -25,
    tangentialAccelMax: 25,
    ...damping(0.42, 0.2),
  }),
  preset('Bubbles', {
    direction: 270 * D,
    spread: 30 * D,
    speedMin: 20,
    speedMax: 100,
    ...accelVector(270, 25, 80),
    radialAccelMin: -15,
    radialAccelMax: 35,
    tangentialAccelMin: -45,
    tangentialAccelMax: 45,
    ...damping(0.22, 0.25),
  }),
  preset('Water Splash', {
    direction: 270 * D,
    spread: 95 * D,
    speedMin: 180,
    speedMax: 620,
    ...accelVector(90, 220, 520),
    radialAccelMin: 20,
    radialAccelMax: 100,
    ...damping(0.03),
  }),
  preset('Leaf Gust', {
    direction: 350 * D,
    spread: 45 * D,
    speedMin: 60,
    speedMax: 220,
    ...accelVector(0, 25, 85),
    radialAccelMin: -20,
    radialAccelMax: 20,
    tangentialAccelMin: -160,
    tangentialAccelMax: 160,
    ...damping(0.16, 0.25),
  }),
  preset('Sparks Shower', {
    direction: 70 * D,
    spread: 55 * D,
    speedMin: 220,
    speedMax: 720,
    ...accelVector(90, 260, 560),
    tangentialAccelMin: -20,
    tangentialAccelMax: 20,
    ...damping(0.05),
  }),
  preset('Energy Beam', {
    direction: 0,
    spread: 8 * D,
    speedMin: 500,
    speedMax: 900,
    ...accelVector(0, 0, 120),
    radialAccelMin: -40,
    radialAccelMax: -5,
    ...damping(0.02),
  }),
  preset('Implosion', {
    spread: 360 * D,
    speedMin: 30,
    speedMax: 160,
    radialAccelMin: -520,
    radialAccelMax: -260,
    tangentialAccelMin: -80,
    tangentialAccelMax: 80,
    ...damping(0.08),
  }),
  preset('Fireflies', {
    spread: 360 * D,
    speedMin: 5,
    speedMax: 45,
    radialAccelMin: -20,
    radialAccelMax: 20,
    tangentialAccelMin: -90,
    tangentialAccelMax: 90,
    ...damping(0.45, 0.25),
  }),
  preset('Laser Scatter', {
    direction: 0,
    spread: 18 * D,
    speedMin: 350,
    speedMax: 1100,
    radialAccelMin: 120,
    radialAccelMax: 320,
    tangentialAccelMin: -40,
    tangentialAccelMax: 40,
    ...damping(0.05),
  }),
].map(intensifyPreset).sort((a, b) => a.name.localeCompare(b.name));

export function extractValues(system: ParticleSystemPlaygroundSystem): PresetValues {
  const p = system.properties;
  return normalizeValues({
    direction: p.direction,
    spread: p.spread,
    speedMin: p.speedMin,
    speedMax: p.speedMax,
    linearAccelXMin: p.linearAccelXMin,
    linearAccelYMin: p.linearAccelYMin,
    linearAccelXMax: p.linearAccelXMax,
    linearAccelYMax: p.linearAccelYMax,
    radialAccelMin: p.radialAccelMin,
    radialAccelMax: p.radialAccelMax,
    tangentialAccelMin: p.tangentialAccelMin,
    tangentialAccelMax: p.tangentialAccelMax,
    linearDampingMin: p.linearDampingMin,
    linearDampingMax: p.linearDampingMax,
  });
}

export function applyValues(values: Partial<PresetValues>, onChange: OnChange) {
  const normalized = normalizeValues(values);
  for (const key of MOTION_KEYS) {
    onChange(key, round(normalized[key]));
  }
}

export function mixValues(a: Partial<PresetValues>, b: Partial<PresetValues>): PresetValues {
  const aa = normalizeValues(a);
  const bb = normalizeValues(b);
  const result: Partial<PresetValues> = {};
  for (const key of MOTION_KEYS) {
    result[key] = (aa[key] + bb[key]) / 2;
  }
  return normalizeValues(result);
}

export function randomizeValues(values: Partial<PresetValues>): PresetValues {
  const normalized = normalizeValues(values);
  const result: Partial<PresetValues> = {};
  for (const key of MOTION_KEYS) {
    const value = normalized[key];
    const factor = 0.8 + Math.random() * 0.4;
    result[key] = round(value * factor);
  }
  return normalizeValues(result);
}

const STORAGE_KEY = 'feather:hpf:custom-presets';

function sanitizePreset(preset: MotionPreset, index: number): FullPreset {
  return {
    name: typeof preset.name === 'string' && preset.name.trim() ? preset.name.trim() : `Imported ${index + 1}`,
    description: typeof preset.description === 'string' ? preset.description : undefined,
    values: normalizeValues(preset.values),
  };
}

export function loadCustomPresets(): FullPreset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as MotionPreset[];
    return Array.isArray(raw) ? raw.map(sanitizePreset) : [];
  } catch {
    return [];
  }
}

export function saveCustomPresets(presets: MotionPreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.map(sanitizePreset)));
}
