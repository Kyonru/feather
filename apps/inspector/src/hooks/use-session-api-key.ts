import { useSessionStore } from '@/store/session';
import { useSettingsStore } from '@/store/settings';

export const useEffectiveApiKey = () => {
  const sessionId = useSessionStore((state) => state.sessionId);
  const globalApiKey = useSettingsStore((state) => state.apiKey);
  const sessionApiKey = useSettingsStore((state) =>
    sessionId ? state.sessionApiKeys[sessionId] : undefined,
  );

  return sessionApiKey || globalApiKey;
};
