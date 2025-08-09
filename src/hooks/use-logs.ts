import { Server, ServerRoute } from "@/constants/server";
import { unionBy } from "@/utils/arrays";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

enum LogType {
  OUTPUT = "output",
  ERROR = "error",
  FEATHER_START = "feather:start",
  FEATHER_FINISH = "feather:finish",
}

export const schema = z.object({
  id: z.string(),
  count: z.number(),
  time: z.number(),
  type: z.enum(Object.values(LogType)),
  str: z.string(),
  trace: z.string(),
});

export type Log = z.infer<typeof schema>;

export const useLogs = ({
  enabled,
}: {
  enabled: boolean;
}): {
  data: Log[];
  isPending: boolean;
  error: unknown;
  refetch: () => void;
} => {
  const { isPending, error, data, refetch } = useQuery({
    queryKey: ["logs"],
    queryFn: async (): Promise<Log[]> => {
      try {
        const response = await fetch(`${Server.LOCAL}${ServerRoute.LOG}`);
        const dataLogs = (await response.json()) as Log[];

        const logs = unionBy<Log, string>(
          data || [],
          dataLogs,
          (item) => item.id
        ) as Log[];
        return logs;
      } catch (error) {
        return (data || []) as Log[];
      }
    },
    // TODO: use config
    refetchInterval: 1000,
    enabled,
  });

  return {
    data: data || [],
    isPending,
    error,
    refetch,
  };
};
