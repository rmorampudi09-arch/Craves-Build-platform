import {QueryClient} from '@tanstack/react-query';
import {queryPolicy} from './queryPolicy';

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: queryPolicy.readRetryCount,
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
