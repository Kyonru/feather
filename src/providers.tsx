import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './components/theme';

// Clean up stale react-query offline cache from previous versions
try {
  localStorage.removeItem('REACT_QUERY_OFFLINE_CACHE');
} catch {
  // ignore
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 60, // 1 hour in-memory cache
    },
  },
});

declare global {
  interface Window {
    __FEATHER_QUERY_CLIENT__?: QueryClient;
  }
}

if (import.meta.env.DEV) {
  try {
    if (localStorage.getItem('feather-e2e-query-client') === '1') {
      window.__FEATHER_QUERY_CLIENT__ = queryClient;
    }
  } catch {
    // ignored
  }
}

export const AppProvider = ({ children }: { children: React.ReactNode }) => {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{children}</ThemeProvider>
    </QueryClientProvider>
  );
};
