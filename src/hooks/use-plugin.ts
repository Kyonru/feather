import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useConfigStore } from '@/store/config';
import { useServer } from './use-server';
import { debounce, timeout } from '@/utils/timers';
import { unionBy } from '@/utils/arrays';

export type ScreenshotType = {
  type: 'png';
  src: string;
  width: number;
  height: number;
};

export type GifType = {
  type: 'gif';
  src: string[];
  width: number;
  height: number;
  fps: number;
};

export interface PluginContentImageType {
  type: 'image';
  name: string;
  metadata: ScreenshotType | GifType;
}

export type PluginDataType = PluginContentImageType;

export interface PluginContentProps {
  data: Array<PluginDataType>;
  type: 'gallery';
  loading: boolean;
  persist?: boolean;
}

export const usePluginAction = (url: string) => {
  const { url: serverUrl, apiKey } = useServer();
  const [params, setParams] = useState<Record<string, string | boolean>>({});

  const mutation = useMutation({
    mutationFn: async (action: string) => {
      try {
        const formattedParams = Object.entries(params)
          .filter(([key, value]) => value && key)
          .map(([key, value]) => `${key}=${value}`)
          .join('&');
        const urlWithParams = `${url}?action=${action}${formattedParams ? `&${formattedParams}` : ''}`;

        await timeout<Response>(
          3000,
          fetch(`${serverUrl}${urlWithParams}`, {
            method: 'POST',
            headers: {
              'x-api-key': apiKey,
            },
          }),
        );

        return [];
      } catch (e) {
        console.log('error', e);
        return [];
      }
    },
  });

  const update = useMutation({
    mutationFn: async () => {
      try {
        const formattedParams = Object.entries(params)
          .filter(([key, value]) => value && key)
          .map(([key, value]) => `${key}=${value}`)
          .join('&');
        const urlWithParams = `${url}?${formattedParams ? `${formattedParams}` : ''}`;

        await timeout<Response>(
          3000,
          fetch(`${serverUrl}${urlWithParams}`, {
            method: 'PUT',
            headers: {
              'x-api-key': apiKey,
            },
          }),
        );

        return [];
      } catch (e) {
        console.log('error', e);
        return [];
      }
    },
  });

  const onAction = (action: string) => {
    mutation.mutate(action);
  };

  const updateOptions = useMemo(
    () =>
      debounce(() => {
        update.mutate();
      }, 1000),
    [],
  );

  const onActionChange = (action: string, value: string | boolean) => {
    setParams((prev) => {
      return {
        ...prev,
        [action]: value,
      };
    });
    updateOptions();
  };

  return {
    onAction,
    onActionChange,
    params: params.current,
  };
};

export function usePlugin(url: string) {
  const disconnected = useConfigStore((state) => state.disconnected);
  const { url: serverUrl, apiKey } = useServer();

  const { isPending, error, data, refetch } = useQuery({
    queryKey: [serverUrl, url, apiKey],
    queryFn: async (): Promise<PluginContentProps> => {
      const response = await timeout<Response>(3000, fetch(`${serverUrl}${url}`, { headers: { 'x-api-key': apiKey } }));

      const pluginData = (await response.json()) as PluginContentProps;

      if (pluginData.persist) {
        const prevData: PluginContentProps = data as PluginContentProps;
        const newData = unionBy<PluginDataType, string>(prevData?.data || [], pluginData.data, (item) => item.name);
        return {
          ...pluginData,
          data: newData,
        };
      }

      return pluginData;
    },
    // TODO: use config
    refetchInterval: 1000,
    enabled: !disconnected,
  });

  return {
    data: data || ({} as PluginContentProps),
    isPending,
    error,
    refetch,
  };
}
