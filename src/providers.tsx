import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { ThemeProvider } from './components/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days of caching
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: window.localStorage,
});

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <ThemeProvider>{children}</ThemeProvider>
    </PersistQueryClientProvider>
  );
};
