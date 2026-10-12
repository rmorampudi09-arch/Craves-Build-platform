import React from 'react';
import {useInfiniteQuery, useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {createPrivateQueryKey} from '../../../app/query/queryKeys';
import {useAppSelector} from '../../../app/store/hooks';
import {isRouteNotPublished} from '../../../core/http/routeAvailability';
import {
  CHEF_SCHEDULED_ORDERS_PAGE_SIZE,
  chefScheduledOrdersApi,
  type ChefScheduledOrder,
  type ChefScheduledOrderPage,
  type ChefScheduleResponseAction,
} from '../api/chefScheduledOrdersApi';

const CHEF_ROLE = 'CHEF' as const;
const DOMAIN = 'chef-scheduled-orders';
// shortcut: the server lists oldest requested time first, so only the first 50 confirmed requests are read; later ones
// show after older ones pass. Upgrade when a kitchen holds that many confirmed scheduled orders at once.
const CONFIRMED_LIMIT = 50;

type ScheduledPage = ChefScheduledOrderPage & {unavailable?: boolean};
const NOT_PUBLISHED: ScheduledPage = {items: [], nextCursor: null, hasMore: false, unavailable: true};

/** One page of scheduled orders; a route the server does not publish yet is an empty page marked unavailable, never an error. */
async function listScheduled(options: Parameters<typeof chefScheduledOrdersApi.list>[0]): Promise<ScheduledPage> {
  try {
    return await chefScheduledOrdersApi.list(options);
  } catch (error) {
    if (isRouteNotPublished(error)) {
      return NOT_PUBLISHED;
    }
    throw error;
  }
}

export function useChefScheduledOrdersQueue() {
  const queryClient = useQueryClient();
  const identityId = useAppSelector(state => state.auth.identity?.id ?? null);
  const keyFor = (responseStatus: string, paging: Record<string, number>) =>
    identityId
      ? createPrivateQueryKey(DOMAIN, {userId: identityId, role: CHEF_ROLE, paging, filters: {responseStatus}})
      : (['craves', 'v1', 'private', DOMAIN, responseStatus, 'signed-out'] as const);
  const pendingKey = keyFor('PENDING', {limit: CHEF_SCHEDULED_ORDERS_PAGE_SIZE});
  const confirmedKey = keyFor('ACCEPTED', {limit: CONFIRMED_LIMIT});

  const pendingQuery = useInfiniteQuery({
    queryKey: pendingKey,
    queryFn: ({pageParam, signal}) =>
      listScheduled({responseStatus: 'PENDING', limit: CHEF_SCHEDULED_ORDERS_PAGE_SIZE, cursor: pageParam, signal}),
    initialPageParam: null as string | null,
    getNextPageParam: lastPage => (lastPage.hasMore ? lastPage.nextCursor ?? undefined : undefined),
    enabled: identityId !== null,
    // The route is not published for most kitchens today; do not ask again on every filter switch.
    staleTime: 30_000,
  });
  const unavailable = pendingQuery.data?.pages.some((page: ScheduledPage) => page.unavailable) ?? false;
  const confirmedQuery = useQuery({
    queryKey: confirmedKey,
    queryFn: ({signal}) => listScheduled({responseStatus: 'ACCEPTED', limit: CONFIRMED_LIMIT, signal}),
    enabled: identityId !== null && pendingQuery.isSuccess && !unavailable,
    staleTime: 30_000,
  });

  const responseMutation = useMutation({
    mutationFn: async (input: {item: ChefScheduledOrder; action: ChefScheduleResponseAction; responseNote?: string | null}) =>
      chefScheduledOrdersApi.respond(input.item.scheduleRequestId, input.item.orderId, {
        action: input.action,
        responseNote: input.responseNote ?? null,
        expectedVersion: input.item.responseVersion,
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({queryKey: pendingKey, exact: true}),
        queryClient.invalidateQueries({queryKey: confirmedKey, exact: true}),
      ]),
  });

  const pending = React.useMemo(() => pendingQuery.data?.pages.flatMap(page => page.items) ?? [], [pendingQuery.data]);
  const confirmed = React.useMemo(
    () => (confirmedQuery.data?.items ?? []).filter(item => Date.parse(item.requestedFulfilmentAt) > Date.now()),
    [confirmedQuery.data],
  );

  return {
    /** The server does not publish scheduled orders for the app yet. */
    unavailable,
    sessionRequired: identityId === null,
    pending,
    confirmed,
    status: pendingQuery.status,
    isRefreshing: pendingQuery.isRefetching,
    hasNextPage: Boolean(pendingQuery.hasNextPage),
    isFetchingNextPage: pendingQuery.isFetchingNextPage,
    respondingOrderId: responseMutation.isPending ? responseMutation.variables?.item.orderId ?? null : null,
    refresh: async () => {
      const pendingResult = await pendingQuery.refetch();
      // refetch() ignores `enabled`, so do not ask for confirmed requests of a route the server does not publish.
      if (!pendingResult.data?.pages.some((page: ScheduledPage) => page.unavailable)) {
        await confirmedQuery.refetch();
      }
    },
    loadOlder: async () => {
      await pendingQuery.fetchNextPage();
    },
    /** Confirms or declines a request; rejects when the server refuses, so the caller can say so. */
    respond: async (item: ChefScheduledOrder, action: ChefScheduleResponseAction, responseNote?: string | null) => {
      await responseMutation.mutateAsync({item, action, responseNote});
    },
  };
}

export type ChefScheduledOrdersQueue = ReturnType<typeof useChefScheduledOrdersQueue>;
