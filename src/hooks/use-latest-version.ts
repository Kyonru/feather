import { Servers } from '@/constants/server';
import { timeout } from '@/utils/timers';
import { useQuery } from '@tanstack/react-query';
import { version } from '../../package.json';
import { useSettingsStore } from '@/store/settings';
import { isGreaterOrEqual } from '@/utils/versions';

export function useLatestVersion(): {
  data: string | null | undefined;
  isFetching: boolean;
  error: unknown;
  refetch: () => void;
} {
  const setLatestVersion = useSettingsStore((state) => state.setIsLatestVersion);

  const { isFetching, error, data, refetch } = useQuery({
    queryKey: ['latest-version'],
    queryFn: async () => {
      try {
        const response = await timeout<Response>(3000, fetch(Servers.LATEST_VERSION));
        const releases = await response.json();

        const latest = releases.tag_name.replace('v', '');

        const isLatestVersion = isGreaterOrEqual(version, latest);

        setLatestVersion(isLatestVersion);

        return latest;
      } catch {
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
