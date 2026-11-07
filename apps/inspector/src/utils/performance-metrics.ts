import type { PerformanceMetrics } from '@/hooks/use-performance';
import { formatMemory } from '@/lib/utils';

export const DEFAULT_PERFORMANCE_METRIC: PerformanceMetrics = {
  time: 0,
  gameTime: 0,
  vsyncEnabled: false,
  supported: {
    multicanvasformats: false,
    clampzero: false,
    lighten: false,
    fullnpot: false,
    pixelshaderhighp: false,
    shaderderivatives: false,
    glsl3: false,
    instancing: false,
  },
  memory: 0,
  peakMemory: 0,
  diskUsage: 0,
  stats: {
    drawcallsbatched: 0,
    canvasswitches: 0,
    shaderswitches: 0,
    canvases: 0,
    images: 0,
    fonts: 0,
    texturememory: 0,
    drawcalls: 0,
  },
  fps: 0,
  frameTime: 0,
  frameTimeMin: 0,
  frameTimeMax: 0,
  frameTimeAvg: 0,
  sysInfo: { arch: '', cpuCount: 0, os: '' },
};

export type PerformanceVerdictSeverity = 'warning' | 'critical';

export type PerformanceVerdict = {
  id: string;
  title: string;
  severity: PerformanceVerdictSeverity;
  evidence: string;
  cause: string;
  action: string;
};

type NormalizeOptions = {
  runtimeUnits?: boolean;
};

export function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function metricNumber(value: unknown, fallback = 0): number {
  return finiteNumber(value) ?? fallback;
}

export function metricStatsNumber(metric: PerformanceMetrics | null | undefined, key: keyof PerformanceMetrics['stats'], fallback = 0): number {
  return metricNumber(metric?.stats?.[key], fallback);
}

export function formatOptionalFixed(value: unknown, decimals = 0): string {
  const number = finiteNumber(value);
  return number == null ? '—' : number.toFixed(decimals);
}

export function formatOptionalMemory(value: unknown, decimals = 2): string {
  const number = finiteNumber(value);
  return number == null ? '—' : formatMemory(number, decimals);
}

export function formatSignedMemory(value: number, decimals = 2): string {
  return `${value < 0 ? '-' : ''}${formatMemory(Math.abs(value), decimals)}`;
}

export function formatPercent(value: unknown, decimals = 2): string {
  const number = finiteNumber(value);
  return number == null ? '—' : `${(number * 100).toFixed(decimals)}%`;
}

export function normalizePerformanceMetric(value: unknown, options: NormalizeOptions = {}): PerformanceMetrics {
  const source = typeof value === 'object' && value !== null ? (value as Partial<PerformanceMetrics>) : {};
  const sourceStats: Partial<PerformanceMetrics['stats']> =
    typeof source.stats === 'object' && source.stats !== null ? source.stats : {};
  const memoryDivisor = options.runtimeUnits ? 1024 : 1;
  const byteDivisor = options.runtimeUnits ? 1024 * 1024 : 1;

  return {
    ...DEFAULT_PERFORMANCE_METRIC,
    ...source,
    memory: metricNumber(source.memory, DEFAULT_PERFORMANCE_METRIC.memory) / memoryDivisor,
    peakMemory: metricNumber(source.peakMemory, DEFAULT_PERFORMANCE_METRIC.peakMemory) / memoryDivisor,
    diskUsage: metricNumber(source.diskUsage, DEFAULT_PERFORMANCE_METRIC.diskUsage) / byteDivisor,
    fps: metricNumber(source.fps, DEFAULT_PERFORMANCE_METRIC.fps),
    frameTime: metricNumber(source.frameTime, DEFAULT_PERFORMANCE_METRIC.frameTime),
    frameTimeMin: metricNumber(source.frameTimeMin, DEFAULT_PERFORMANCE_METRIC.frameTimeMin),
    frameTimeMax: metricNumber(source.frameTimeMax, DEFAULT_PERFORMANCE_METRIC.frameTimeMax),
    frameTimeAvg: metricNumber(source.frameTimeAvg, DEFAULT_PERFORMANCE_METRIC.frameTimeAvg),
    time: metricNumber(source.time, DEFAULT_PERFORMANCE_METRIC.time),
    gameTime: metricNumber(source.gameTime, DEFAULT_PERFORMANCE_METRIC.gameTime),
    stats: {
      ...DEFAULT_PERFORMANCE_METRIC.stats,
      ...sourceStats,
      drawcallsbatched: metricNumber(sourceStats.drawcallsbatched, DEFAULT_PERFORMANCE_METRIC.stats.drawcallsbatched),
      canvasswitches: metricNumber(sourceStats.canvasswitches, DEFAULT_PERFORMANCE_METRIC.stats.canvasswitches),
      shaderswitches: metricNumber(sourceStats.shaderswitches, DEFAULT_PERFORMANCE_METRIC.stats.shaderswitches),
      canvases: metricNumber(sourceStats.canvases, DEFAULT_PERFORMANCE_METRIC.stats.canvases),
      images: metricNumber(sourceStats.images, DEFAULT_PERFORMANCE_METRIC.stats.images),
      fonts: metricNumber(sourceStats.fonts, DEFAULT_PERFORMANCE_METRIC.stats.fonts),
      texturememory: metricNumber(sourceStats.texturememory, DEFAULT_PERFORMANCE_METRIC.stats.texturememory) / byteDivisor,
      drawcalls: metricNumber(sourceStats.drawcalls, DEFAULT_PERFORMANCE_METRIC.stats.drawcalls),
    },
    supported: { ...DEFAULT_PERFORMANCE_METRIC.supported, ...(source.supported ?? {}) },
    sysInfo: { ...DEFAULT_PERFORMANCE_METRIC.sysInfo, ...(source.sysInfo ?? {}) },
    vsyncEnabled: source.vsyncEnabled ?? DEFAULT_PERFORMANCE_METRIC.vsyncEnabled,
  };
}

function maxOf(data: PerformanceMetrics[], getValue: (metric: PerformanceMetrics) => number): number {
  return data.reduce((max, metric) => Math.max(max, getValue(metric)), 0);
}

function avgOf(data: PerformanceMetrics[], getValue: (metric: PerformanceMetrics) => number): number {
  if (!data.length) return 0;
  return data.reduce((sum, metric) => sum + getValue(metric), 0) / data.length;
}

export function analyzePerformanceHealth(data: PerformanceMetrics[], latest = data.at(-1) ?? null): PerformanceVerdict[] {
  if (!data.length || !latest) return [];

  const verdicts: PerformanceVerdict[] = [];
  const maxFrameMs = maxOf(data, (metric) => Math.max(metricNumber(metric.frameTimeMax), metricNumber(metric.frameTime)) * 1000);
  const avgFrameMs = avgOf(data, (metric) => metricNumber(metric.frameTimeAvg || metric.frameTime) * 1000);
  const latestFps = metricNumber(latest.fps);
  const avgFps = avgOf(data, (metric) => metricNumber(metric.fps));
  const latestDrawCalls = metricStatsNumber(latest, 'drawcalls');
  const avgDrawCalls = avgOf(data, (metric) => metricStatsNumber(metric, 'drawcalls'));
  const latestShaderSwitches = metricStatsNumber(latest, 'shaderswitches');
  const latestCanvasSwitches = metricStatsNumber(latest, 'canvasswitches');
  const firstMemory = metricNumber(data[0]?.memory);
  const latestMemory = metricNumber(latest.memory);
  const memoryDelta = latestMemory - firstMemory;
  const firstTexture = metricStatsNumber(data[0], 'texturememory');
  const latestTexture = metricStatsNumber(latest, 'texturememory');
  const textureDelta = latestTexture - firstTexture;

  if (maxFrameMs >= 33.33 || avgFrameMs >= 24) {
    verdicts.push({
      id: 'frame-hitch-critical',
      title: 'Frame hitch',
      severity: 'critical',
      evidence: `max ${maxFrameMs.toFixed(1)} ms`,
      cause: 'One or more frames exceeded the 30 FPS budget.',
      action: 'Open the Profiler tab or inspect Recent Spikes around the hitch.',
    });
  } else if (maxFrameMs >= 16.67) {
    verdicts.push({
      id: 'frame-hitch-warning',
      title: 'Frame hitch',
      severity: 'warning',
      evidence: `max ${maxFrameMs.toFixed(1)} ms`,
      cause: 'Recent frames exceeded the 60 FPS budget.',
      action: 'Check draw calls, shader switches, and scoped profiler samples.',
    });
  }

  if (latestFps > 0 && (latestFps < 45 || avgFps < 50)) {
    verdicts.push({
      id: 'low-fps',
      title: 'Low FPS',
      severity: latestFps < 30 ? 'critical' : 'warning',
      evidence: `latest ${latestFps.toFixed(0)} FPS`,
      cause: 'The current frame rate is below the target band.',
      action: 'Use frame-time max and profiler captures to find expensive update/draw work.',
    });
  }

  if (latestDrawCalls >= 900 || (avgDrawCalls > 0 && latestDrawCalls > avgDrawCalls * 1.5 && latestDrawCalls >= 300)) {
    verdicts.push({
      id: 'draw-call-pressure',
      title: 'Draw-call pressure',
      severity: latestDrawCalls >= 1500 ? 'critical' : 'warning',
      evidence: `${latestDrawCalls.toLocaleString()} draw calls`,
      cause: 'The game is issuing many separate graphics submissions.',
      action: 'Batch sprites, reduce state changes, or inspect repeated draw paths.',
    });
  }

  if (latestShaderSwitches > 0 || latestCanvasSwitches > 0) {
    const totalSwitches = latestShaderSwitches + latestCanvasSwitches;
    if (totalSwitches >= 8 || latestShaderSwitches >= 4 || latestCanvasSwitches >= 4) {
      verdicts.push({
        id: 'state-switching',
        title: 'Shader/canvas switching',
        severity: totalSwitches >= 16 ? 'critical' : 'warning',
        evidence: `${latestShaderSwitches} shader / ${latestCanvasSwitches} canvas`,
        cause: 'Frequent graphics state changes can break batching.',
        action: 'Group draws by shader/canvas and avoid unnecessary render target swaps.',
      });
    }
  }

  if (data.length >= 3 && memoryDelta >= 8 && latestMemory > firstMemory * 1.12) {
    verdicts.push({
      id: 'memory-climbing',
      title: 'Memory climbing',
      severity: memoryDelta >= 32 ? 'critical' : 'warning',
      evidence: `+${formatMemory(memoryDelta, 2)}`,
      cause: 'Lua heap usage is growing across the visible window.',
      action: 'Look for retained tables, unbounded caches, or allocations in update loops.',
    });
  }

  if (latestTexture >= 128 || textureDelta >= 32 || (latestMemory > 0 && latestTexture > latestMemory * 1.5)) {
    verdicts.push({
      id: 'texture-heavy',
      title: 'Texture-heavy',
      severity: latestTexture >= 512 ? 'critical' : 'warning',
      evidence: `${formatMemory(latestTexture, 2)} texture`,
      cause: 'Texture memory is high relative to the live Lua heap or rising quickly.',
      action: 'Open Assets to inspect repeated loads, large textures, and preview metadata.',
    });
  }

  return verdicts;
}

