import {
  TEXTURE_LAB_ALPHA_MODES,
  TEXTURE_LAB_COLOR_RAMPS,
  TEXTURE_LAB_GENERATOR_IDS,
  TEXTURE_LAB_SIZES,
  type GeneratedTextureResult,
  type TextureLabAlphaMode,
  type TextureLabColorRamp,
  type TextureLabGeneratedPixels,
  type TextureLabGeneratorId,
  type TextureLabRecipe,
  type TextureLabSize,
  type TextureLabSplinePoint,
  type TextureLabSplineRecipe,
} from '@/types/texture-lab';

export type TextureLabGeneratorCategory = 'Particle sprites' | 'Masks' | 'Noise / maps' | 'Pixel patterns' | 'Spline paths';

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

export const TEXTURE_LAB_GENERATORS: TextureLabGeneratorMeta[] = [
  { id: 'soft-circle', label: 'Soft Circle', category: 'Particle sprites', description: 'A soft radial sprite for glows, embers, and dust.' },
  { id: 'spark', label: 'Spark', category: 'Particle sprites', description: 'A compact cross-shaped spark with a hot center.' },
  { id: 'streak', label: 'Streak', category: 'Particle sprites', description: 'A tapered horizontal streak for speed lines.' },
  { id: 'ring', label: 'Ring', category: 'Particle sprites', description: 'A soft hollow ring for shockwaves and ripples.' },
  { id: 'smoke-puff', label: 'Smoke Puff', category: 'Particle sprites', description: 'A noisy soft puff with uneven edges.' },
  { id: 'star', label: 'Star', category: 'Particle sprites', description: 'A pointed sparkle sprite.' },
  { id: 'slash', label: 'Slash', category: 'Particle sprites', description: 'A diagonal slash texture for cuts and wind.' },
  { id: 'trail-blob', label: 'Trail Blob', category: 'Particle sprites', description: 'A soft blob stretched for magical trails.' },
  { id: 'comet-tail', label: 'Comet Tail', category: 'Particle sprites', description: 'A bright head with a long fading tail.' },
  { id: 'rain-slash', label: 'Rain Slash', category: 'Particle sprites', description: 'A thin diagonal streak for rain and speed.' },
  { id: 'circle-mask', label: 'Circle Mask', category: 'Masks', description: 'A hard or soft circular alpha mask.' },
  { id: 'ellipse-mask', label: 'Ellipse Mask', category: 'Masks', description: 'A horizontal ellipse alpha mask.' },
  { id: 'rounded-rect-mask', label: 'Rounded Rect', category: 'Masks', description: 'A rounded rectangle utility mask.' },
  { id: 'radial-mask', label: 'Radial Mask', category: 'Masks', description: 'A grayscale radial falloff map.' },
  { id: 'threshold-noise-mask', label: 'Noise Mask', category: 'Masks', description: 'A thresholded procedural noise mask.' },
  { id: 'cloud-noise', label: 'Cloud Noise', category: 'Noise / maps', description: 'Soft value noise for smoke and water.' },
  { id: 'cellular-spots', label: 'Cellular Spots', category: 'Noise / maps', description: 'Cell-like spots for foam, stars, or dissolve.' },
  { id: 'dissolve-noise', label: 'Dissolve Noise', category: 'Noise / maps', description: 'High-contrast texture for shader dissolves.' },
  { id: 'water-noise', label: 'Water Noise', category: 'Noise / maps', description: 'Layered directional noise for shimmer.' },
  { id: 'height-map', label: 'Height Map', category: 'Noise / maps', description: 'Smooth grayscale map for shader experiments.' },
  { id: 'directional-gradient', label: 'Directional Gradient', category: 'Noise / maps', description: 'A simple left-to-right utility map.' },
  { id: 'checker', label: 'Checker', category: 'Pixel patterns', description: 'A tileable checker texture.' },
  { id: 'dither', label: 'Dither', category: 'Pixel patterns', description: 'A deterministic ordered dither pattern.' },
  { id: 'scanline', label: 'Scanline', category: 'Pixel patterns', description: 'Horizontal scanlines for pixel effects.' },
  { id: 'palette-ramp', label: 'Palette Ramp', category: 'Pixel patterns', description: 'A horizontal color ramp.' },
  { id: 'spline-trail', label: 'Spline Trail', category: 'Spline paths', description: 'An editable tapered path for trails, wisps, and comet-like sprites.' },
  { id: 'spline-ribbon', label: 'Spline Ribbon', category: 'Spline paths', description: 'A wider editable ribbon path with soft feathered edges.' },
  { id: 'spline-mask', label: 'Spline Mask', category: 'Spline paths', description: 'An editable stroke or closed-loop mask.' },
  { id: 'spline-lightning', label: 'Spline Lightning', category: 'Spline paths', description: 'A seed-jittered editable path for bolts and energized streaks.' },
];

export const DEFAULT_TEXTURE_LAB_RECIPE: TextureLabRecipe = {
  generator: 'soft-circle',
  size: 64,
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
};

export const TEXTURE_LAB_SPLINE_GENERATOR_IDS = [
  'spline-trail',
  'spline-ribbon',
  'spline-mask',
  'spline-lightning',
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
    },
  },
  {
    id: 'comet',
    label: 'Comet Tail',
    spline: DEFAULT_TRAIL_SPLINE,
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
    },
  },
];

const GENERATOR_SET = new Set<string>(TEXTURE_LAB_GENERATOR_IDS);
const SIZE_SET = new Set<number>(TEXTURE_LAB_SIZES);
const RAMP_SET = new Set<string>(TEXTURE_LAB_COLOR_RAMPS);
const ALPHA_SET = new Set<string>(TEXTURE_LAB_ALPHA_MODES);
const SPLINE_GENERATOR_SET = new Set<string>(TEXTURE_LAB_SPLINE_GENERATOR_IDS);

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
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

export function defaultTextureLabRecipeForGenerator(generator: TextureLabGeneratorId): TextureLabRecipe {
  return normalizeRecipe({
    ...DEFAULT_TEXTURE_LAB_RECIPE,
    generator,
    tileable: isTextureLabSplineGenerator(generator) ? false : DEFAULT_TEXTURE_LAB_RECIPE.tileable,
    spline: isTextureLabSplineGenerator(generator) ? defaultSplineForGenerator(generator) : undefined,
  });
}

function defaultSplineForGenerator(generator: TextureLabGeneratorId): TextureLabSplineRecipe {
  if (generator === 'spline-ribbon') {
    return cloneSplineRecipe(TEXTURE_LAB_SPLINE_PRESETS.find((preset) => preset.id === 'ribbon-s')?.spline ?? DEFAULT_TRAIL_SPLINE);
  }
  if (generator === 'spline-mask') {
    return cloneSplineRecipe(TEXTURE_LAB_SPLINE_PRESETS.find((preset) => preset.id === 'ellipse-border')?.spline ?? DEFAULT_TRAIL_SPLINE);
  }
  if (generator === 'spline-lightning') {
    return cloneSplineRecipe(TEXTURE_LAB_SPLINE_PRESETS.find((preset) => preset.id === 'lightning')?.spline ?? DEFAULT_TRAIL_SPLINE);
  }
  return cloneSplineRecipe(DEFAULT_TRAIL_SPLINE);
}

export function textureLabSplinePreset(presetId: TextureLabSplinePresetId): TextureLabSplineRecipe {
  const preset = TEXTURE_LAB_SPLINE_PRESETS.find((item) => item.id === presetId);
  return cloneSplineRecipe(preset?.spline ?? DEFAULT_TRAIL_SPLINE);
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
  const source = input && typeof input === 'object' ? input as Partial<TextureLabSplineRecipe> : {};
  const points = Array.isArray(source.points)
    ? source.points.map(normalizeSplinePoint).filter((point): point is TextureLabSplinePoint => point !== null).slice(0, 16)
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
  };
}

function normalizeRecipe(input?: Partial<TextureLabRecipe> | null): TextureLabRecipe {
  const source = input ?? {};
  const size = Number(source.size);
  const generator = typeof source.generator === 'string' && GENERATOR_SET.has(source.generator)
    ? source.generator as TextureLabGeneratorId
    : DEFAULT_TEXTURE_LAB_RECIPE.generator;
  const colorRamp = typeof source.colorRamp === 'string' && RAMP_SET.has(source.colorRamp)
    ? source.colorRamp as TextureLabColorRamp
    : DEFAULT_TEXTURE_LAB_RECIPE.colorRamp;
  const alphaMode = typeof source.alphaMode === 'string' && ALPHA_SET.has(source.alphaMode)
    ? source.alphaMode as TextureLabAlphaMode
    : DEFAULT_TEXTURE_LAB_RECIPE.alphaMode;

  return {
    generator,
    size: (SIZE_SET.has(size) ? size : DEFAULT_TEXTURE_LAB_RECIPE.size) as TextureLabSize,
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
    spline: normalizeSplineRecipe(source.spline, generator),
  };
}

function rampStops(ramp: TextureLabColorRamp): Array<[number, number, number, number]> {
  switch (ramp) {
    case 'fire':
      return [[0.16, 0.02, 0.01, 1], [1, 0.22, 0.02, 1], [1, 0.9, 0.28, 1], [1, 1, 1, 1]];
    case 'smoke':
      return [[0.06, 0.06, 0.07, 1], [0.28, 0.28, 0.3, 1], [0.68, 0.66, 0.62, 1]];
    case 'ice':
      return [[0.2, 0.55, 1, 1], [0.74, 0.94, 1, 1], [1, 1, 1, 1]];
    case 'magic':
      return [[0.32, 0.1, 0.72, 1], [0.95, 0.24, 1, 1], [0.25, 0.9, 1, 1]];
    case 'water':
      return [[0.02, 0.16, 0.34, 1], [0.06, 0.52, 0.86, 1], [0.74, 1, 1, 1]];
    case 'gold':
      return [[0.4, 0.18, 0.02, 1], [1, 0.62, 0.08, 1], [1, 0.95, 0.45, 1]];
    case 'rainbow':
      return [[1, 0.05, 0.1, 1], [1, 0.82, 0.05, 1], [0.1, 0.82, 0.24, 1], [0.05, 0.38, 1, 1], [0.8, 0.18, 1, 1]];
    case 'grayscale':
      return [[0, 0, 0, 1], [1, 1, 1, 1]];
    case 'white':
    default:
      return [[1, 1, 1, 1], [1, 1, 1, 1]];
  }
}

function sampleRamp(ramp: TextureLabColorRamp, value: number): [number, number, number, number] {
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

function splineGeneratorValue(
  recipe: TextureLabRecipe,
  u: number,
  v: number,
  path: SampledSplinePath | null | undefined,
): { colorT: number; alpha: number } {
  if (!recipe.spline || !path || path.points.length < 2) return { colorT: 0, alpha: 0 };
  let nearest = Number.POSITIVE_INFINITY;
  let nearestProgress = 0;
  let nearestWidth = recipe.spline.strokeWidth;
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
    if (distance < nearest) {
      nearest = distance;
      nearestProgress = lerp(a.progress, b.progress, t);
      nearestWidth = lerp(a.width, b.width, t);
    }
  }

  const radius = nearestWidth * 0.5;
  const feather = Math.max(0.001, recipe.spline.feather * 0.12);
  let alpha = 1 - smoothstep(radius, radius + feather, nearest);
  alpha = Math.pow(clamp01(alpha), recipe.falloff);

  if (recipe.generator === 'spline-ribbon') {
    const pulse = 0.65 + Math.sin(nearestProgress * Math.PI * 2) * 0.15;
    return { colorT: pulse, alpha };
  }
  if (recipe.generator === 'spline-mask') {
    return { colorT: alpha, alpha };
  }
  if (recipe.generator === 'spline-lightning') {
    const core = 1 - smoothstep(radius * 0.35, Math.max(radius * 0.35 + 0.001, radius), nearest);
    return { colorT: Math.max(core, 0.7), alpha: Math.max(alpha * 0.7, core) };
  }
  return { colorT: 1 - nearestProgress * 0.8, alpha };
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
      const alpha = Math.max(shapeFalloff(d, 0.55, recipe.softness * 0.4, recipe.falloff), Math.pow(rays, 12) * shapeFalloff(d, 0.95, 0.15, 1));
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
    case 'slash': {
      const along = shapeFalloff(Math.abs(cx - cy * 0.35), 0.88, recipe.softness * 0.6, recipe.falloff);
      const alpha = along * Math.exp(-diagonal * diagonal * 34);
      return { colorT: 1 - diagonal, alpha };
    }
    case 'trail-blob': {
      const tail = smoothstep(0.95, -0.75, cx);
      const thickness = 0.2 + tail * 0.3;
      const alpha = tail * Math.exp(-(cy * cy) / Math.max(0.01, thickness * thickness)) * shapeFalloff(Math.abs(cx) * 0.8, 0.95, recipe.softness, 1);
      return { colorT: tail, alpha };
    }
    case 'comet-tail': {
      const head = shapeFalloff(Math.hypot(cx - 0.45, cy), 0.28, recipe.softness * 0.45, recipe.falloff);
      const tail = smoothstep(0.85, -0.95, cx) * Math.exp(-cy * cy * 22);
      return { colorT: Math.max(head, tail), alpha: Math.max(head, tail * 0.75) };
    }
    case 'rain-slash': {
      return { colorT: 0.75, alpha: Math.exp(-diagonal * diagonal * 120) * shapeFalloff(Math.abs(cx), 0.92, 0.08, 1) };
    }
    case 'circle-mask':
      return { colorT: shapeFalloff(d, 0.76, recipe.softness, recipe.falloff), alpha: shapeFalloff(d, 0.76, recipe.softness, recipe.falloff) };
    case 'ellipse-mask': {
      const ed = Math.hypot(cx / 0.95, cy / 0.58);
      return { colorT: shapeFalloff(ed, 0.82, recipe.softness, recipe.falloff), alpha: shapeFalloff(ed, 0.82, recipe.softness, recipe.falloff) };
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

export function renderTextureLabPixels(input?: Partial<TextureLabRecipe> | null): TextureLabGeneratedPixels {
  const recipe = normalizeRecipe(input);
  const width = recipe.size;
  const height = recipe.size;
  const pixels = new Uint8ClampedArray(width * height * 4);
  const splinePath = buildSampledSplinePath(recipe);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let u = recipe.tileable ? (x === width - 1 ? 0 : x / Math.max(1, width - 1)) : (x + 0.5) / width;
      let v = recipe.tileable ? (y === height - 1 ? 0 : y / Math.max(1, height - 1)) : (y + 0.5) / height;
      if (recipe.distortion > 0 && !recipe.generator.includes('checker') && recipe.generator !== 'dither') {
        const dx = fbm(u, v, recipe.scale, recipe.seed + 211, recipe.tileable) - 0.5;
        const dy = fbm(u, v, recipe.scale, recipe.seed + 307, recipe.tileable) - 0.5;
        u = recipe.tileable ? fract(u + dx * recipe.distortion * 0.12 + 1) : clamp01(u + dx * recipe.distortion * 0.12);
        v = recipe.tileable ? fract(v + dy * recipe.distortion * 0.12 + 1) : clamp01(v + dy * recipe.distortion * 0.12);
      }

      const value = generatorValue(recipe, u, v, x, y, splinePath);
      const colorT = contrast(value.colorT, recipe.contrast);
      const color = sampleRamp(recipe.colorRamp, colorT);
      let alpha = clamp01(value.alpha);
      if (recipe.alphaMode === 'opaque') alpha = 1;
      if (recipe.alphaMode === 'luminance') alpha = colorT;
      if (recipe.alphaMode === 'inverted') alpha = 1 - alpha;

      const offset = (y * width + x) * 4;
      pixels[offset] = Math.round(clamp01(color[0]) * 255);
      pixels[offset + 1] = Math.round(clamp01(color[1]) * 255);
      pixels[offset + 2] = Math.round(clamp01(color[2]) * 255);
      pixels[offset + 3] = Math.round(alpha * color[3] * 255);
    }
  }

  return { width, height, pixels, recipe };
}

export function textureLabFilename(recipe: TextureLabRecipe): string {
  const generator = TEXTURE_LAB_GENERATORS.find((item) => item.id === recipe.generator);
  const base = (generator?.label ?? recipe.generator).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${base}-${recipe.size}-${recipe.seed}.png`;
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

export function generateTextureLabTexture(input?: Partial<TextureLabRecipe> | null): GeneratedTextureResult {
  const pixels = renderTextureLabPixels(input);
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
