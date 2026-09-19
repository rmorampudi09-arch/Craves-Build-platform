import {useInfiniteQuery} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {
  CHEF_ORDER_HISTORY_PAGE_SIZE,
  CHEF_ORDER_HISTORY_V2_AVAILABLE,
  chefOrderHistoryApi,
} from '../api/chefOrderHistoryApi';

const CHEF_ROLE = 'CHEF' as const;
const CHEF_COMPLETED_HISTORY_DOMAIN = 'chef-completed-order-history-v2';

export const chefCompletedOrderHistoryQueryPrefix = [
  'craves',
  'v1',
  'private',
  CHEF_COMPLETED_HISTORY_DOMAIN,
] as const;

export function createChefCompletedOrderHistoryQueryKey(identityId: string) {
  return createPrivateQueryKey(CHEF_COMPLETED_HISTORY_DOMAIN, {
    userId: identityId,
    role: CHEF_ROLE,
    filters: {status: 'DELIVERED'},
    paging: {limit: CHEF_ORDER_HISTORY_PAGE_SIZE},
  });
}

export function useChefCompletedOrderHistoryQuery() {
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey = identityId
    ? createChefCompletedOrderHistoryQueryKey(identityId)
    : ([...chefCompletedOrderHistoryQueryPrefix, 'signed-out'] as const);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({pageParam, signal}) =>
      chefOrderHistoryApi.page({
        limit: CHEF_ORDER_HISTORY_PAGE_SIZE,
        cursor: pageParam,
        status: 'DELIVERED',
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
    enabled: identityId !== null && CHEF_ORDER_HISTORY_V2_AVAILABLE,
    staleTime: 30_000,
  });

  return {
    ...query,
    available: CHEF_ORDER_HISTORY_V2_AVAILABLE,
    sessionRequired: identityId === null,
    orders: query.data?.pages.flatMap(page => page.orders) ?? [],
  };
}
