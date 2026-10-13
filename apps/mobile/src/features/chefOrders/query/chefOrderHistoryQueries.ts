import {useInfiniteQuery} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
import {
  CHEF_ORDER_HISTORY_PAGE_SIZE,
  chefOrderHistoryApi,
  type ChefOrderHistoryPage,
} from '../api/chefOrderHistoryApi';

const CHEF_ROLE = 'CHEF' as const;
const CHEF_ORDER_HISTORY_DOMAIN = 'chef-order-history-v3';

const NOT_PUBLISHED: ChefOrderHistoryPage = {orders: [], nextCursor: null, hasMore: false};

export function createChefOrderHistoryQueryKey(identityId: string) {
  return createPrivateQueryKey(CHEF_ORDER_HISTORY_DOMAIN, {
    userId: identityId,
    role: CHEF_ROLE,
    paging: {limit: CHEF_ORDER_HISTORY_PAGE_SIZE},
  });
}

/**
 * Older orders of every status for the Past list, newest first, a page at a time. The live order list already holds
 * the recent ones; a server that does not publish this route yet just leaves the list at those (no error, no retry).
 */
export function useChefOrderHistoryQuery() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey = identityId
    ? createChefOrderHistoryQueryKey(identityId)
    : (['craves', 'v1', 'private', CHEF_ORDER_HISTORY_DOMAIN, 'signed-out'] as const);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: async ({pageParam, signal}) => {
      try {
        return await chefOrderHistoryApi.page({limit: CHEF_ORDER_HISTORY_PAGE_SIZE, cursor: pageParam, signal});
      } catch (error) {
        if (isRouteNotPublished(error)) {
          return NOT_PUBLISHED;
        }
        throw error;
      }
    },
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
    enabled: identityId !== null,
    staleTime: 30_000,
  });

  return {
    orders: query.data?.pages.flatMap(page => page.orders) ?? [],
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
    /** The last read failed (a later page, or the first). Callers that page on their own must stop until told to retry. */
    failed: query.isError,
    /** Reads the pages already loaded again (pull to refresh). */
    refresh: async () => {
      await query.refetch();
    },
    loadOlder: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) {
        // Without cancelRefetch:false a second call in the same moment would cancel the first and ask again.
        query.fetchNextPage({cancelRefetch: false}).catch(() => undefined);
      }
    },
  };
}
