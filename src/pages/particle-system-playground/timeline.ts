import {
  PARTICLE_TIMELINE_LANES,
  type ParticleTimelineEasing,
  type ParticleSystemPlaygroundCompositeData,
  type ParticleSystemPlaygroundProjectFile,
  type ParticleSystemPlaygroundProjectSystem,
  type ParticleSystemPlaygroundSystem,
  type ParticleSystemPlaygroundTemplate,
  type ParticleTimeline,
  type ParticleTimelineClip,
  type ParticleTimelineKeyframe,
  type ParticleTimelineLane,
  type ParticleTimelineTrack,
} from '@/types/particle-system-playground';
import { easeParticleTimelineValue, normalizeParticleTimelineEasing } from './easing';

export const PARTICLE_PROJECT_TYPE = 'feather.particle-system-playground';
export const PARTICLE_PROJECT_VERSION = 2;
export const PARTICLE_TIMELINE_DEFAULT_DURATION = 3;
export const PARTICLE_TIMELINE_SCRUB_THROTTLE_MS = 120;

export const PARTICLE_TIMELINE_LANE_LABELS: Record<ParticleTimelineLane, string> = {
  opacity: 'Opacity',
  emissionRate: 'Emission Rate',
  speedScale: 'Speed Scale',
  sizeScale: 'Size Scale',
  direction: 'Direction',
  spread: 'Spread',
  offsetX: 'Offset X',
  offsetY: 'Offset Y',
};

export const PARTICLE_TIMELINE_LANE_DEFAULTS: Record<ParticleTimelineLane, number> = {
  opacity: 1,
  emissionRate: 0,
  speedScale: 1,
  sizeScale: 1,
  direction: 0,
  spread: 0,
  offsetX: 0,
  offsetY: 0,
};

const AMBIENT_TEMPLATES = new Set<ParticleSystemPlaygroundTemplate>(['fire', 'smoke', 'sparkles']);
const VALID_LANES = new Set<string>(PARTICLE_TIMELINE_LANES);

function finiteNumber(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function idPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

function keyframe(
  lane: ParticleTimelineLane,
  systemIndex: number,
  time: number,
  value: number,
  easing?: ParticleTimelineEasing,
): ParticleTimelineKeyframe {
  return {
    id: `${idPart(lane)}-${systemIndex}-${String(time).replace('.', '-')}`,
    time,
    value,
    ...(easing && easing !== 'linear' ? { easing } : {}),
  };
}

function clip(systemIndex: number, start: number, end: number, emit?: number): ParticleTimelineClip {
  return {
    id: `clip-${systemIndex}-${String(start).replace('.', '-')}-${String(end).replace('.', '-')}`,
    start,
    end,
    ...(emit !== undefined ? { emit } : {}),
  };
}

function baseTrack(system: Pick<ParticleSystemPlaygroundSystem, 'index' | 'emitAtStart'>, duration: number): ParticleTimelineTrack {
  return {
    systemIndex: system.index,
    clips: [clip(system.index, 0, duration, system.emitAtStart > 0 ? system.emitAtStart : undefined)],
    lanes: {},
  };
}

function authoredTrack(
  system: Pick<ParticleSystemPlaygroundSystem, 'index' | 'emitAtStart'>,
  start: number,
  end: number,
  lanes: Partial<Record<ParticleTimelineLane, Array<[number, number, ParticleTimelineEasing?]>>>,
  emit?: number,
): ParticleTimelineTrack {
  const track: ParticleTimelineTrack = {
    systemIndex: system.index,
    clips: [clip(system.index, start, end, emit ?? (system.emitAtStart > 0 ? system.emitAtStart : undefined))],
    lanes: {},
  };

  for (const [lane, points] of Object.entries(lanes) as Array<[ParticleTimelineLane, Array<[number, number, ParticleTimelineEasing?]>]>) {
    track.lanes[lane] = points.map(([time, value, easing]) => keyframe(lane, system.index, time, value, easing));
  }

  return track;
}

export function timelineForTemplate(
  template: ParticleSystemPlaygroundTemplate | undefined,
  systems: Pick<ParticleSystemPlaygroundSystem, 'index' | 'emitAtStart'>[],
): ParticleTimeline {
  const duration = PARTICLE_TIMELINE_DEFAULT_DURATION;
  const loop = template ? AMBIENT_TEMPLATES.has(template) : true;

  if (template === 'explosion' && systems.length >= 3) {
    return {
      duration,
      loop: false,
      tracks: [
        authoredTrack(systems[0], 0, 0.42, {
          opacity: [
            [0, 1, 'outExpo'],
            [0.32, 0.78, 'inQuad'],
            [0.42, 0],
          ],
          emissionRate: [
            [0, 950, 'outExpo'],
            [0.18, 280, 'inQuad'],
            [0.42, 0],
          ],
          sizeScale: [
            [0, 0.7, 'outBack'],
            [0.2, 1.45, 'inQuad'],
            [0.42, 0.55],
          ],
        }, 220),
        authoredTrack(systems[1], 0.08, 2.8, {
          opacity: [
            [0.08, 0],
            [0.32, 0.72, 'outSine'],
            [2.8, 0],
          ],
          speedScale: [
            [0.08, 1.2, 'outCubic'],
            [1.1, 0.45, 'outSine'],
            [2.8, 0.15],
          ],
          sizeScale: [
            [0.08, 0.5],
            [1.2, 1.8],
            [2.8, 2.4],
          ],
          offsetY: [
            [0.08, 0],
            [2.8, -34],
          ],
        }, 90),
        authoredTrack(systems[2], 0.02, 1.25, {
          opacity: [
            [0.02, 1],
            [0.8, 0.65],
            [1.25, 0],
          ],
          emissionRate: [
            [0.02, 360],
            [0.25, 80],
            [1.25, 0],
          ],
          speedScale: [
            [0.02, 1.35],
            [1.25, 0.35],
          ],
        }, 140),
      ],
    };
  }

  if (template === 'muzzle-flash' && systems.length >= 2) {
    return {
      duration,
      loop: false,
      tracks: [
        authoredTrack(systems[0], 0, 0.28, {
          opacity: [
            [0, 1],
            [0.12, 0.85],
            [0.28, 0],
          ],
          emissionRate: [
            [0, 1000],
            [0.1, 280],
            [0.28, 0],
          ],
          spread: [
            [0, 0.3],
            [0.28, 0.72],
          ],
        }, 90),
        authoredTrack(systems[1], 0.03, 0.75, {
          opacity: [
            [0.03, 1],
            [0.45, 0.65],
            [0.75, 0],
          ],
          speedScale: [
            [0.03, 1.25],
            [0.75, 0.25],
          ],
        }, 80),
      ],
    };
  }

  if (template === 'magic-burst' && systems.length >= 3) {
    return {
      duration,
      loop: false,
      tracks: [
        authoredTrack(systems[0], 0, 0.65, {
          opacity: [
            [0, 1],
            [0.45, 0.65],
            [0.65, 0],
          ],
          sizeScale: [
            [0, 0.4],
            [0.35, 1.6],
            [0.65, 0.2],
          ],
        }, 120),
        authoredTrack(systems[1], 0.05, 2.2, {
          opacity: [
            [0.05, 0.8],
            [1.5, 0.5],
            [2.2, 0],
          ],
          direction: [
            [0.05, -1.57],
            [2.2, -2.3],
          ],
          spread: [
            [0.05, 6.28],
            [2.2, 3.3],
          ],
        }, 80),
        authoredTrack(systems[2], 0.12, 2.6, {
          opacity: [
            [0.12, 1],
            [1.7, 0.75],
            [2.6, 0],
          ],
          offsetY: [
            [0.12, 0],
            [2.6, -28],
          ],
        }, 110),
      ],
    };
  }

  if (template === 'dust-puff' && systems.length >= 1) {
    return {
      duration,
      loop: false,
      tracks: [
        authoredTrack(systems[0], 0, 2.25, {
          opacity: [
            [0, 0.65],
            [0.45, 0.75],
            [2.25, 0],
          ],
          speedScale: [
            [0, 0.9],
            [1.2, 0.32],
            [2.25, 0.12],
          ],
          sizeScale: [
            [0, 0.45],
            [1.1, 1.75],
            [2.25, 2.4],
          ],
          offsetY: [
            [0, 0],
            [2.25, -18],
          ],
        }, 120),
      ],
    };
  }

  if (template === 'complex-composite' && systems.length >= 5) {
    return {
      duration,
      loop: false,
      tracks: [
        authoredTrack(systems[0], 0, 0.72, {
          opacity: [
            [0, 1],
            [0.45, 0.82],
            [0.72, 0],
          ],
          emissionRate: [
            [0, 720],
            [0.18, 260],
            [0.72, 0],
          ],
          sizeScale: [
            [0, 0.35],
            [0.34, 1.8],
            [0.72, 0.3],
          ],
        }, 140),
        authoredTrack(systems[1], 0.04, 0.58, {
          opacity: [
            [0.04, 0.95],
            [0.32, 0.68],
            [0.58, 0],
          ],
          speedScale: [
            [0.04, 1.5],
            [0.58, 0.45],
          ],
          sizeScale: [
            [0.04, 0.45],
            [0.58, 2.2],
          ],
          spread: [
            [0.04, 6.28],
            [0.58, 6.28],
          ],
        }, 90),
        authoredTrack(systems[2], 0.16, 3, {
          opacity: [
            [0.16, 0],
            [0.5, 0.72],
            [2.75, 0],
          ],
          speedScale: [
            [0.16, 1.1],
            [1.4, 0.42],
            [3, 0.18],
          ],
          sizeScale: [
            [0.16, 0.45],
            [1.35, 1.8],
            [3, 2.5],
          ],
          offsetY: [
            [0.16, 0],
            [3, -42],
          ],
        }, 110),
        authoredTrack(systems[3], 0.1, 1.45, {
          opacity: [
            [0.1, 1],
            [0.75, 0.8],
            [1.45, 0],
          ],
          emissionRate: [
            [0.1, 520],
            [0.42, 120],
            [1.45, 0],
          ],
          speedScale: [
            [0.1, 1.35],
            [1.45, 0.34],
          ],
          direction: [
            [0.1, -0.9],
            [1.45, -2.25],
          ],
          spread: [
            [0.1, 4.6],
            [1.45, 2.2],
          ],
        }, 180),
        authoredTrack(systems[4], 0.28, 2.7, {
          opacity: [
            [0.28, 0],
            [0.62, 0.5],
            [2.7, 0],
          ],
          speedScale: [
            [0.28, 0.8],
            [1.4, 0.28],
            [2.7, 0.12],
          ],
          sizeScale: [
            [0.28, 0.4],
            [1.2, 1.35],
            [2.7, 2],
          ],
          offsetY: [
            [0.28, 10],
            [2.7, 30],
          ],
        }, 100),
      ],
    };
  }

  if (template === 'fire') {
    return {
      duration,
      loop: true,
      tracks: systems.map((system) =>
        authoredTrack(system, 0, duration, {
          opacity: [
            [0, 0.95],
            [1.2, 1],
            [3, 0.92],
          ],
          emissionRate: [
            [0, 90],
            [1.4, 130],
            [3, 95],
          ],
          speedScale: [
            [0, 0.9],
            [1.5, 1.15],
            [3, 0.92],
          ],
        }),
      ),
    };
  }

  if (template === 'smoke') {
    return {
      duration,
      loop: true,
      tracks: systems.map((system) =>
        authoredTrack(system, 0, duration, {
          opacity: [
            [0, 0.55, 'inOutSine'],
            [1.5, 0.7, 'inOutSine'],
            [3, 0.5],
          ],
          sizeScale: [
            [0, 0.85, 'outSine'],
            [1.5, 1.2, 'inOutSine'],
            [3, 1],
          ],
          offsetY: [
            [0, 0],
            [3, -20],
          ],
        }),
      ),
    };
  }

  if (template === 'sparkles') {
    return {
      duration,
      loop: true,
      tracks: systems.map((system) =>
        authoredTrack(system, 0, duration, {
          opacity: [
            [0, 1, 'outSine'],
            [0.9, 0.55, 'inOutSine'],
            [1.7, 1, 'outSine'],
            [3, 0.65],
          ],
          emissionRate: [
            [0, 60],
            [0.8, 120],
            [1.7, 45],
            [3, 80],
          ],
        }),
      ),
    };
  }

  return {
    duration,
    loop,
    tracks: systems.map((system) => baseTrack(system, duration)),
  };
}

function normalizeKeyframes(
  lane: ParticleTimelineLane,
  raw: unknown,
  duration: number,
): ParticleTimelineKeyframe[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item, index): ParticleTimelineKeyframe => {
      return {
        id: String(item.id || `${lane}-${index}`),
        time: clamp(finiteNumber(item.time, 0), 0, duration),
        value: finiteNumber(item.value, PARTICLE_TIMELINE_LANE_DEFAULTS[lane]),
        easing: normalizeParticleTimelineEasing(item.easing),
      };
    })
    .sort((a, b) => a.time - b.time);
}

function normalizeTrack(raw: unknown, system: ParticleSystemPlaygroundSystem, duration: number): ParticleTimelineTrack {
  const track = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const rawClips = Array.isArray(track.clips) ? track.clips : [];
  const clips = rawClips
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item, index) => {
      const start = clamp(finiteNumber(item.start, 0), 0, duration);
      const end = clamp(finiteNumber(item.end, duration), start + 0.01, duration);
      return {
        id: String(item.id || `clip-${system.index}-${index}`),
        start,
        end,
        ...(item.emit !== undefined ? { emit: Math.max(0, finiteNumber(item.emit, 0)) } : {}),
      };
    });

  const lanes: ParticleTimelineTrack['lanes'] = {};
  const rawLanes = typeof track.lanes === 'object' && track.lanes !== null ? (track.lanes as Record<string, unknown>) : {};
  for (const lane of PARTICLE_TIMELINE_LANES) {
    const points = normalizeKeyframes(lane, rawLanes[lane], duration);
    if (points.length > 0) lanes[lane] = points;
  }

  return {
    systemIndex: system.index,
    clips: clips.length > 0 ? clips : [clip(system.index, 0, duration, system.emitAtStart > 0 ? system.emitAtStart : undefined)],
    lanes,
  };
}

export function normalizeParticleTimeline(
  timeline: unknown,
  systems: ParticleSystemPlaygroundSystem[],
  template?: ParticleSystemPlaygroundTemplate,
): ParticleTimeline {
  const fallback = timelineForTemplate(template, systems);
  const raw = typeof timeline === 'object' && timeline !== null ? (timeline as Record<string, unknown>) : {};
  const duration = clamp(finiteNumber(raw.duration, fallback.duration), 0.25, 60);
  const tracksByIndex = new Map<number, unknown>();
  if (Array.isArray(raw.tracks)) {
    for (const track of raw.tracks) {
      if (typeof track === 'object' && track !== null) {
        const systemIndex = finiteNumber((track as Record<string, unknown>).systemIndex, NaN);
        if (Number.isFinite(systemIndex)) tracksByIndex.set(systemIndex, track);
      }
    }
  }

  return {
    duration,
    loop: raw.loop !== undefined ? raw.loop === true : fallback.loop,
    tracks: systems.map((system) => normalizeTrack(tracksByIndex.get(system.index), system, duration)),
  };
}

function reindexTimelineTracks(tracks: ParticleTimelineTrack[]): ParticleTimelineTrack[] {
  return tracks.map((track, index) => ({
    ...track,
    systemIndex: index + 1,
  }));
}

export function reindexParticleSystems<T extends ParticleSystemPlaygroundSystem>(systems: T[]): T[] {
  return systems.map((system, index) => ({
    ...system,
    index: index + 1,
  }));
}

export function reorderParticleTimeline(
  timeline: unknown,
  systems: ParticleSystemPlaygroundSystem[],
  fromIndex: number,
  toIndex: number,
): ParticleTimeline {
  const normalized = normalizeParticleTimeline(timeline, systems);
  const fromPosition = systems.findIndex((system) => system.index === fromIndex);
  const toPosition = systems.findIndex((system) => system.index === toIndex);
  if (fromPosition === -1 || toPosition === -1 || fromPosition === toPosition) return normalized;

  const tracks = [...normalized.tracks];
  const [moved] = tracks.splice(fromPosition, 1);
  tracks.splice(toPosition, 0, moved);
  return {
    ...normalized,
    tracks: reindexTimelineTracks(tracks),
  };
}

export function removeParticleTimelineTrack(
  timeline: unknown,
  systems: ParticleSystemPlaygroundSystem[],
  systemIndex: number,
): ParticleTimeline {
  const normalized = normalizeParticleTimeline(timeline, systems);
  const position = systems.findIndex((system) => system.index === systemIndex);
  if (position === -1) return normalized;

  const tracks = normalized.tracks.filter((_, index) => index !== position);
  return {
    ...normalized,
    tracks: reindexTimelineTracks(tracks),
  };
}

export function withNormalizedTimeline(
  composite: ParticleSystemPlaygroundCompositeData,
  template?: ParticleSystemPlaygroundTemplate,
): ParticleSystemPlaygroundCompositeData {
  return {
    ...composite,
    timeline: normalizeParticleTimeline(composite.timeline, composite.systems, template),
    timelineState: composite.timelineState
      ? {
          time: clamp(finiteNumber(composite.timelineState.time, 0), 0, composite.timeline?.duration ?? PARTICLE_TIMELINE_DEFAULT_DURATION),
          playing: composite.timelineState.playing === true,
          scrubVersion: finiteNumber(composite.timelineState.scrubVersion, 0),
        }
      : { time: 0, playing: false, scrubVersion: 0 },
  };
}

export function migrateParticleProject(project: ParticleSystemPlaygroundProjectFile): ParticleSystemPlaygroundProjectFile {
  const systems = (project.composite?.systems ?? []) as ParticleSystemPlaygroundProjectSystem[];
  const composite = {
    ...project.composite,
    systems,
  };
  return {
    ...project,
    version: PARTICLE_PROJECT_VERSION,
    composite: {
      ...composite,
      timeline: normalizeParticleTimeline(project.version === 1 ? undefined : composite.timeline, systems),
    },
  };
}

export function isParticleTimelineLane(value: string): value is ParticleTimelineLane {
  return VALID_LANES.has(value);
}

export function evaluateParticleKeyframes(
  keyframes: ParticleTimelineKeyframe[] | undefined,
  time: number,
  fallback: number,
): number {
  if (!keyframes || keyframes.length === 0) return fallback;
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);
  if (time <= sorted[0].time) return sorted[0].value;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (time >= current.time && time <= next.time) {
      const span = Math.max(0.0001, next.time - current.time);
      const t = clamp((time - current.time) / span, 0, 1);
      const eased = easeParticleTimelineValue(current.easing, t);
      return current.value + (next.value - current.value) * eased;
    }
  }
  return sorted[sorted.length - 1].value;
}

export function trackIsActive(track: ParticleTimelineTrack, time: number): boolean {
  return track.clips.some((item) => time >= item.start && time <= item.end);
}
