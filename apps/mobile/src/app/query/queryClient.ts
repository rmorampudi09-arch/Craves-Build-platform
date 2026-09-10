import {QueryClient} from '@tanstack/react-query';
import {
  getQueryRetryDelayMs,
  queryPolicy,
  shouldRetryQuery,
} from './queryPolicy';

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryQuery,
        retryDelay: getQueryRetryDelayMs,
        staleTime: queryPolicy.staleTimeMs,
        gcTime: queryPolicy.gcTimeMs,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: queryPolicy.mutationRetryCount,
      },
    },
  });
}

export const appQueryClient = createAppQueryClient();
