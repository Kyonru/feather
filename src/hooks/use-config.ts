import { Server, ServerRoute } from "@/constants/server";
import { useQuery } from "@tanstack/react-query";

interface Config {
  plugins: {
    name: string;
    route: string;
    description: string;
    config: any;
  }[];
  root_path: string;
}

export function useConfig(): {
  data: Config | undefined;
  isPending: boolean;
  error: unknown;
  refetch: () => void;
} {
  const { isPending, error, data, refetch } = useQuery({
    queryKey: ["config"],
    queryFn: async () => {
      const response = await fetch(
        `${Server.LOCAL}${ServerRoute.CONFIG}?p=feather`
      );
      const config = await response.json();
      return config;
    },
  });

  return {
    data,
    isPending,
    error,
    refetch,
  };
}
