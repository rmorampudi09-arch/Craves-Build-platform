import {useInfiniteQuery, useMutation, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {
  CHEF_SCHEDULED_ORDERS_AVAILABLE,
  CHEF_SCHEDULED_ORDERS_PAGE_SIZE,
  chefScheduledOrdersApi,
  type ChefScheduledOrder,
  type ChefScheduleResponseAction,
} from '../api/chefScheduledOrdersApi';

const CHEF_ROLE = 'CHEF' as const;
const DOMAIN = 'chef-scheduled-orders';

export function useChefScheduledOrdersQueue() {
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const queryKey = identityId
    ? createPrivateQueryKey(DOMAIN, {
        userId: identityId,
        role: CHEF_ROLE,
        paging: {limit: CHEF_SCHEDULED_ORDERS_PAGE_SIZE},
        filter: {responseStatus: 'PENDING'},
      })
    : (['craves', 'v1', 'private', DOMAIN, 'signed-out'] as const);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({pageParam, signal}) =>
      chefScheduledOrdersApi.list({
        responseStatus: 'PENDING',
        limit: CHEF_SCHEDULED_ORDERS_PAGE_SIZE,
        cursor: pageParam,
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage =>
      lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined,
    enabled: identityId !== null && CHEF_SCHEDULED_ORDERS_AVAILABLE,
    staleTime: 15_000,
  });

  const responseMutation = useMutation({
    mutationFn: async (input: {
      item: ChefScheduledOrder;
      action: ChefScheduleResponseAction;
      responseNote?: string | null;
    }) =>
      chefScheduledOrdersApi.respond(
        input.item.scheduleRequestId,
        input.item.orderId,
        {
          action: input.action,
          responseNote: input.responseNote ?? null,
          expectedVersion: input.item.responseVersion,
        },
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey,
        exact: true,
      }),
  });

  return {
    available: CHEF_SCHEDULED_ORDERS_AVAILABLE,
    sessionRequired: identityId === null,
    items: query.data?.pages.flatMap(page => page.items) ?? [],
    status: query.status,
    error: query.error,
    isRefreshing: query.isRefetching,
    hasNextPage: Boolean(query.hasNextPage),
    isFetchingNextPage: query.isFetchingNextPage,
    respondingOrderId: responseMutation.isPending
      ? responseMutation.variables?.item.orderId ?? null
      : null,
    responseError: responseMutation.error,
    refresh: async () => {
      await query.refetch();
    },
    loadOlder: async () => {
      await query.fetchNextPage();
    },
    respond: async (
      item: ChefScheduledOrder,
      action: ChefScheduleResponseAction,
      responseNote?: string | null,
    ) => {
      await responseMutation.mutateAsync({item, action, responseNote});
    },
  };
}
