import { useQuery } from '@tanstack/react-query';
import { useSessionStore } from '@/store/session';
import { sessionQueryKey } from './use-ws-connection';

export type SystemInfo = {
  arch: string;
  cpuCount: number;
  os: string;
};

type Stats = {
  drawcallsbatched: number;
  canvasswitches: number;
  shaderswitches: number;
  canvases: number;
  images: number;
  fonts: number;
  texturememory: number;
  drawcalls: number;
};

type SupportedFeatures = {
  multicanvasformats: boolean;
  clampzero: boolean;
  lighten: boolean;
  fullnpot: boolean;
  pixelshaderhighp: boolean;
  shaderderivatives: boolean;
  glsl3: boolean;
  instancing: boolean;
};

export type PerformanceMetrics = {
  time: number;
  gameTime: number;
  vsyncEnabled: boolean;
  supported: SupportedFeatures;
  memory: number;
  peakMemory: number;
  diskUsage: number;
  stats: Stats;
  fps: number;
  frameTime: number;
  frameTimeMin: number;
  frameTimeMax: number;
  frameTimeAvg: number;
  sysInfo: SystemInfo;
};

export const DEFAULT_METRIC: PerformanceMetrics = {
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

export const usePerformance = (): { data: PerformanceMetrics[] } => {
  const sessionId = useSessionStore((state) => state.sessionId);

  const { data } = useQuery<PerformanceMetrics[]>({
    queryKey: sessionQueryKey.performance(sessionId ?? ''),
    queryFn: () => [],
    enabled: false, // data is pushed via WS, not fetched
  });

  return { data: data ?? [] };
};
