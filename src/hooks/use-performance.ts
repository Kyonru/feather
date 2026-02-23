import { ServerRoute } from '@/constants/server';
import { timeout } from '@/utils/timers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServer } from './use-server';
import { useSampleRate } from './use-config';

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
  const queryClient = useQueryClient();
  const { url: serverUrl, apiKey } = useServer();
  const sampleRate = useSampleRate();
  const queryKey = [serverUrl, apiKey, 'performance'];

  const { isPending, error, data, refetch } = useQuery({
    // eslint-disable-next-line @tanstack/query/exhaustive-deps
    queryKey: queryKey,
    queryFn: async (): Promise<PerformanceMetrics[]> => {
      const response = await timeout<Response>(
        3000,
        fetch(`${serverUrl}${ServerRoute.PERFORMANCE}`, {
          headers: {
            'x-api-key': apiKey,
          },
        }),
      );

      const performance = (await response.json()) as PerformanceMetrics;
      const existing = queryClient.getQueryData<PerformanceMetrics[]>(queryKey) || [];

      const metrics = (existing.concat(performance) || []) as PerformanceMetrics[];

      return metrics;
    },
    refetchInterval: sampleRate * 1000,
    placeholderData: (previousData) => previousData,
  });

  return {
    data: data || [],
    isPending,
    error,
    refetch,
  };
};
