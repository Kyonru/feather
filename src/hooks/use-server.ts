import { useSettingsStore } from '@/store/settings';

export const useServer = () => {
  const port = useSettingsStore((state) => state.port);
  const apiKey = useSettingsStore((state) => state.apiKey);

  return {
    port,
    apiKey,
  };
};
