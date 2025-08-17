import { ServerRoute } from '@/constants/server';
import { timeout } from '@/lib/utils';
import { useConfigStore } from '@/store/config';
import { useQuery } from '@tanstack/react-query';
import { useServer } from './use-server';

type SystemInfo = {
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
  vsyncEnabled: boolean;
  supported: SupportedFeatures;
  memory: number;
  stats: Stats;
  fps: number;
  frameTime: number;
  sysInfo: SystemInfo;
};

export const DEFAULT_METRIC: PerformanceMetrics = {
  time: 0,
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
  sysInfo: {
    arch: '',
    cpuCount: 0,
    os: '',
  },
};

export const usePerformance = (): {
  data: PerformanceMetrics[];
  isPending: boolean;
  error: unknown;
  refetch: () => void;
} => {
  const setDisconnected = useConfigStore((state) => state.setDisconnected);
  const disconnected = useConfigStore((state) => state.disconnected);
  const { url: serverUrl } = useServer();

  const { isPending, error, data, refetch } = useQuery({
    queryKey: ['performance'],
    queryFn: async (): Promise<PerformanceMetrics[]> => {
      try {
        const response = await timeout<Response>(3000, fetch(`${serverUrl}${ServerRoute.PERFORMANCE}`));

        const performance = (await response.json()) as PerformanceMetrics;

        const metrics = ((data || []).concat(performance) || []) as PerformanceMetrics[];

        return metrics;
      } catch {
        setDisconnected(true);
        return (data || []) as PerformanceMetrics[];
      }
    },
    // TODO: use config
    refetchInterval: 1000,
    enabled: !disconnected,
  });

  return {
    data: data || [],
    isPending,
    error,
    refetch,
  };
};
