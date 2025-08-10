import { Server, ServerRoute } from "@/constants/server";
import { timeout } from "@/lib/utils";
import { Config, useConfigStore } from "@/store/config";
import { useQuery } from "@tanstack/react-query";

export function useConfig(): {
  data: Config | undefined;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
} {
  const setConfig = useConfigStore((state) => state.setConfig);
  const setDisconnected = useConfigStore((state) => state.setDisconnected);

  const { isFetching, error, data, refetch } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      try {
        const response = await timeout<Response>(
          3000,
          fetch(`${Server.LOCAL}${ServerRoute.CONFIG}?p=feather`)
        );
        const config = await response.json();

        setConfig(config);
        setDisconnected(false);
        return config;
      } catch (error) {
        setConfig(null);
        setDisconnected(true);
        return null;
      }
    },
  });

  return {
    data,
    isFetching,
    error,
    refetch,
  };
}
