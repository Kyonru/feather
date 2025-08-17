import { useSettingsStore } from '@/store/settings';

export const useServer = () => {
  const host = useSettingsStore((state) => state.host);
  const port = useSettingsStore((state) => state.port);
  const url = `${host}:${port}`;

  return {
    host,
    port,
    url,
  };
};
