import type {QueryClient} from '@tanstack/react-query';
import {
  matchesPrivateQueryScope,
  type PrivateCacheScope,
} from './queryKeys';

export async function clearPrivateQueryCache(
  queryClient: QueryClient,
  scope: PrivateCacheScope = {},
): Promise<void> {
  const predicate = (query: {queryKey: readonly unknown[]}) =>
    matchesPrivateQueryScope(query.queryKey, scope);

  try {
    await queryClient.cancelQueries({predicate});
  } finally {
    queryClient.removeQueries({predicate});
  }
}
